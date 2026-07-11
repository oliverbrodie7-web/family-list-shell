// Edge Function: price-lookup
// Returns a price ESTIMATE for a shopping-list term from the household's
// supermarket, via the provider adapter registry (woolworths live; coles/aldi
// stubs). Flow: normalise term → 7-day cache in shopping_product_prices →
// provider search → Claude picks the single most likely everyday product →
// upsert cache → return. Never throws to the client; unsupported/failed paths
// return { unsupported: true } with HTTP 200.
//
// verify_jwt stays ON (default) — called from the logged-in app. DB writes use
// the service role because shopping_product_prices is select-only under RLS.

import { createClient } from "npm:@supabase/supabase-js@2";
import type { PriceProvider, ProductHit } from "./types.ts";
import { woolworths } from "./providers/woolworths.ts";
import { coles } from "./providers/coles.ts";
import { aldi } from "./providers/aldi.ts";

const PROVIDERS: Record<string, PriceProvider> = {
  [woolworths.id]: woolworths,
  [coles.id]: coles,
  [aldi.id]: aldi,
};

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// lowercase, trim, collapse whitespace, singularise simple plurals.
function normaliseTerm(raw: string): string {
  let t = raw.toLowerCase().trim().replace(/\s+/g, " ");
  if (t.endsWith("ies") && t.length > 4) t = t.slice(0, -3) + "y";
  else if (t.endsWith("es") && t.length > 3 && !t.endsWith("ses")) t = t.slice(0, -2);
  else if (t.endsWith("s") && !t.endsWith("ss") && t.length > 3) t = t.slice(0, -1);
  return t;
}

// Ask Claude which single hit a typical Australian family most likely means.
async function pickBestHit(term: string, hits: ProductHit[]): Promise<number> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey || hits.length <= 1) return 0;

  const list = hits
    .map(
      (h, i) =>
        `${i}: ${h.name}${h.size ? ` (${h.size})` : ""} — $${(h.priceCents / 100).toFixed(2)}`,
    )
    .join("\n");

  const prompt = `A shopper in Australia wrote "${term}" on their family shopping list.

Below are supermarket search results. Pick the ONE product a typical Australian family most likely means by that generic term. Prefer standard sizes and everyday or own-brand items over premium, novelty, or specialty products (for "milk" that means a standard 2L full cream milk, not a 350mL protein shake).

${list}

Reply with ONLY the index number of your pick. No other text.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 10,
        system: "You reply with a single integer and nothing else.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? "";
    const idx = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < hits.length) return idx;
    return 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE =
      Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error("price-lookup: missing env");
      return json(200, { unsupported: true, error: "not_configured" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      itemName?: string;
      supermarket?: string;
    };
    const itemName =
      typeof body.itemName === "string" ? body.itemName.trim() : "";
    const supermarket =
      typeof body.supermarket === "string" && body.supermarket.trim()
        ? body.supermarket.trim().toLowerCase()
        : "woolworths";
    if (!itemName) return json(200, { unsupported: true, error: "missing_item" });

    const provider = PROVIDERS[supermarket];
    if (!provider || !provider.supportsAutoPrices) {
      return json(200, { unsupported: true });
    }

    const queryNormalised = normaliseTerm(itemName);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Cache: fresh within 7 days → no Apify call.
    const { data: cached } = await admin
      .from("shopping_product_prices")
      .select("matched_name, price_cents, was_price_cents, unit_price_text, stockcode, fetched_at")
      .eq("supermarket", supermarket)
      .eq("query_normalised", queryNormalised)
      .maybeSingle();

    if (
      cached &&
      Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MAX_AGE_MS
    ) {
      return json(200, {
        matched_name: cached.matched_name,
        price_cents: cached.price_cents,
        was_price_cents: cached.was_price_cents,
        unit_price_text: cached.unit_price_text,
        stockcode: cached.stockcode,
        cached: true,
      });
    }

    // 2. Provider search.
    let hits: ProductHit[];
    try {
      hits = await provider.search(queryNormalised);
    } catch (e) {
      console.log(
        `price-lookup: search failed for "${queryNormalised}" (${supermarket}):`,
        e instanceof Error ? e.message : e,
      );
      return json(200, { unsupported: true });
    }
    if (hits.length === 0) return json(200, { unsupported: true });

    // 3. Match picking (AI, falls back to first hit).
    const idx = await pickBestHit(queryNormalised, hits);
    const winner = hits[idx] ?? hits[0];

    // 4. Upsert cache, return.
    const { error: upsertErr } = await admin
      .from("shopping_product_prices")
      .upsert(
        {
          supermarket,
          query_normalised: queryNormalised,
          matched_name: winner.name,
          price_cents: winner.priceCents,
          was_price_cents: winner.wasPriceCents,
          unit_price_text: winner.unitPriceText,
          stockcode: winner.stockcode,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "supermarket,query_normalised" },
      );
    if (upsertErr) {
      console.error("price-lookup: cache upsert failed", upsertErr.message);
      // Still return the price — caching is best-effort.
    }

    console.log(
      `price-lookup: "${queryNormalised}" (${supermarket}) → ${winner.name} @ ${winner.priceCents}c`,
    );
    return json(200, {
      matched_name: winner.name,
      price_cents: winner.priceCents,
      was_price_cents: winner.wasPriceCents,
      unit_price_text: winner.unitPriceText,
      stockcode: winner.stockcode,
      cached: false,
    });
  } catch (e) {
    console.error("price-lookup: unexpected", e instanceof Error ? e.message : e);
    return json(200, { unsupported: true, error: "unexpected" });
  }
});
