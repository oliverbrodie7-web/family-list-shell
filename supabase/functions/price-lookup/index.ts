// Edge Function: price-lookup
// Price ESTIMATES for shopping-list terms from the household's supermarket, via
// the provider adapter registry (woolworths live; coles/aldi stubs).
//
// mode 'price' (default): PIN → 7-day cache (incl. miss cache) → provider search
//   → Claude picks the single best everyday product OR says NONE → upsert → return.
// mode 'candidates': live search only (no pin, no cache), up to 8 products for a
//   picker UI, no AI.
//
// Never throws to the client: always structured JSON, HTTP 200. verify_jwt stays
// ON (called from the logged-in app). DB writes use the service role; because
// shopping_product_pins is RLS-scoped per household, EVERY pin read/write filters
// on household_id explicitly.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
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

// IDENTICAL rules to the client's src/lib/itemNormalise.ts (kept self-contained
// because Edge Functions cannot import from src). Client and server must agree on
// what counts as the same item name, or pins and caches won't line up.
function normaliseName(raw: string): string {
  let n = raw.toLowerCase().trim().replace(/\s+/g, " ");
  if (n.endsWith("ies")) n = n.slice(0, -3) + "y";
  else if (n.endsWith("s") && n.length > 3) n = n.slice(0, -1);
  return n;
}

// Ask Claude which single hit a typical Australian family means, OR the exact
// word NONE when nothing is a plausible everyday grocery match.
// Returns: a valid index | "none" | "error" (error → caller falls back to hit 0).
async function pickBestHit(
  term: string,
  hits: ProductHit[],
): Promise<number | "none" | "error"> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  // No AI available or a single hit → take the first hit (as today, NOT none).
  if (!apiKey || hits.length <= 1) return 0;

  const list = hits
    .map(
      (h, i) =>
        `${i}: ${h.name}${h.size ? ` (${h.size})` : ""} — $${(h.priceCents / 100).toFixed(2)}`,
    )
    .join("\n");

  const prompt = `A shopper in Australia wrote "${term}" on their family shopping list.

Below are supermarket search results. Pick the ONE product a typical Australian family most likely means by that term. Prefer standard sizes and everyday or own-brand items over premium, novelty, or specialty products (for "milk" that means a standard 2L full cream milk, not a 350mL protein shake).

But a WRONG price is worse than no price. If NONE of these results is a plausible everyday grocery match for "${term}" — for example the term is a household nickname or misspelling and the results are unrelated (floodlights, kitchen gadgets, phone cases, etc.) — reply with the single word NONE instead of guessing the closest one.

${list}

Reply with ONLY the index number of your pick, or the single word NONE. No other text.`;

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
        system: "You reply with a single integer, or the single word NONE. Nothing else.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return "error";
    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? "";
    if (/\bNONE\b/i.test(raw)) return "none";
    const idx = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < hits.length) return idx;
    return "error"; // unparseable → caller falls back to hit 0
  } catch {
    return "error";
  }
}

// Miss cache: record that this term has no everyday match, so it stops retrying
// Apify on every app open until the row ages past 7 days.
async function writeMissCache(
  admin: SupabaseClient,
  supermarket: string,
  queryNormalised: string,
) {
  await admin.from("shopping_product_prices").upsert(
    {
      supermarket,
      query_normalised: queryNormalised,
      matched_name: null,
      price_cents: null,
      was_price_cents: null,
      unit_price_text: null,
      stockcode: null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "supermarket,query_normalised" },
  );
}

type ResolveResult =
  | { matched: true; priceCents: number; payload: Record<string, unknown> }
  | { matched: false; payload: Record<string, unknown> };

// The normal price flow: cache (incl. miss) → search → AI pick / NONE → upsert.
async function resolvePrice(
  admin: SupabaseClient,
  provider: PriceProvider | undefined,
  supermarket: string,
  queryNormalised: string,
): Promise<ResolveResult> {
  if (!provider || !provider.supportsAutoPrices) {
    return { matched: false, payload: { unsupported: true, reason: "provider" } };
  }

  // 1. Cache (7 days). A cached MISS (price_cents null) short-circuits with no Apify.
  const { data: cached } = await admin
    .from("shopping_product_prices")
    .select("matched_name, price_cents, was_price_cents, unit_price_text, stockcode, fetched_at")
    .eq("supermarket", supermarket)
    .eq("query_normalised", queryNormalised)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MAX_AGE_MS) {
    if (cached.price_cents == null) {
      return { matched: false, payload: { unsupported: true, reason: "no_match", cached: true } };
    }
    return {
      matched: true,
      priceCents: cached.price_cents,
      payload: {
        matched_name: cached.matched_name,
        price_cents: cached.price_cents,
        was_price_cents: cached.was_price_cents,
        unit_price_text: cached.unit_price_text,
        stockcode: cached.stockcode,
        cached: true,
      },
    };
  }

  // 2. Provider search. A thrown error/timeout is a transient failure — do NOT
  //    miss-cache it (so it retries later), just report unsupported for now.
  let hits: ProductHit[];
  try {
    hits = await provider.search(queryNormalised);
  } catch (e) {
    console.log(
      `price-lookup: search failed for "${queryNormalised}" (${supermarket}):`,
      e instanceof Error ? e.message : e,
    );
    return { matched: false, payload: { unsupported: true, reason: "search_failed" } };
  }

  // Zero surviving hits after the in-stock filter → real miss → miss-cache it.
  if (hits.length === 0) {
    await writeMissCache(admin, supermarket, queryNormalised);
    return { matched: false, payload: { unsupported: true, reason: "no_match" } };
  }

  // 3. Match picking. NONE → miss-cache. AI error/unparseable → fall back to hit 0.
  const pick = await pickBestHit(queryNormalised, hits);
  if (pick === "none") {
    await writeMissCache(admin, supermarket, queryNormalised);
    return { matched: false, payload: { unsupported: true, reason: "no_match" } };
  }
  const idx = pick === "error" ? 0 : pick;
  const winner = hits[idx] ?? hits[0];

  // 4. Upsert the winner and return.
  await admin.from("shopping_product_prices").upsert(
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

  return {
    matched: true,
    priceCents: winner.priceCents,
    payload: {
      matched_name: winner.name,
      price_cents: winner.priceCents,
      was_price_cents: winner.wasPriceCents,
      unit_price_text: winner.unitPriceText,
      stockcode: winner.stockcode,
      cached: false,
    },
  };
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
      householdId?: string;
      mode?: string;
    };
    const itemName = typeof body.itemName === "string" ? body.itemName.trim() : "";
    const supermarket =
      typeof body.supermarket === "string" && body.supermarket.trim()
        ? body.supermarket.trim().toLowerCase()
        : "woolworths";
    const householdId =
      typeof body.householdId === "string" && body.householdId.trim()
        ? body.householdId.trim()
        : null;
    const mode = body.mode === "candidates" ? "candidates" : "price";

    if (!itemName) return json(200, { unsupported: true, error: "missing_item" });

    const provider = PROVIDERS[supermarket];
    const queryNormalised = normaliseName(itemName);

    // ---- MODE 'candidates': live search only, no pin, no cache, no AI. ----
    if (mode === "candidates") {
      if (!provider || !provider.supportsAutoPrices) {
        return json(200, { unsupported: true, reason: "provider" });
      }
      let hits: ProductHit[] = [];
      try {
        hits = await provider.search(queryNormalised);
      } catch (e) {
        console.log(
          `price-lookup: candidates search failed for "${queryNormalised}":`,
          e instanceof Error ? e.message : e,
        );
        hits = [];
      }
      const candidates = hits.slice(0, 8).map((h) => ({
        stockcode: h.stockcode,
        name: h.name,
        size: h.size,
        price_cents: h.priceCents,
        was_price_cents: h.wasPriceCents,
        unit_price_text: h.unitPriceText,
        image: h.image,
      }));
      return json(200, { candidates });
    }

    // ---- MODE 'price'. ----
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. PIN FIRST — precedence over cache and search. Scoped to this household.
    let pinNeedsPrice = false;
    if (householdId) {
      const { data: pin } = await admin
        .from("shopping_product_pins")
        .select("product_name, stockcode, size, last_price_cents")
        .eq("household_id", householdId)
        .eq("supermarket", supermarket)
        .eq("name_normalised", queryNormalised)
        .maybeSingle();

      if (pin) {
        if (pin.last_price_cents != null) {
          // Pinned with a known price: return it with NO Apify and NO AI call.
          return json(200, {
            source: "pin",
            matched_name: pin.product_name,
            price_cents: pin.last_price_cents,
            stockcode: pin.stockcode,
            size: pin.size,
            cached: true,
          });
        }
        // Pinned but price unknown → fall through to a normal search, then patch
        // ONLY this pin's last_price_cents (never its stockcode/product_name).
        pinNeedsPrice = true;
      }
    }

    // 2. Normal flow.
    const result = await resolvePrice(admin, provider, supermarket, queryNormalised);

    if (result.matched && pinNeedsPrice && householdId) {
      await admin
        .from("shopping_product_pins")
        .update({
          last_price_cents: result.priceCents,
          updated_at: new Date().toISOString(),
        })
        .eq("household_id", householdId)
        .eq("supermarket", supermarket)
        .eq("name_normalised", queryNormalised);
    }

    return json(200, result.payload);
  } catch (e) {
    console.error("price-lookup: unexpected", e instanceof Error ? e.message : e);
    return json(200, { unsupported: true, error: "unexpected" });
  }
});
