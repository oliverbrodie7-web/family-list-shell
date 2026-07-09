// Edge Function: price-test
// FEASIBILITY TEST ONLY — proves whether our Edge Function environment can fetch
// product prices from Woolworths Australia. Not the real feature. Never throws;
// always returns a structured JSON report (and logs it).
//
// Public (verify_jwt = false in supabase/config.toml) so it can be hit with curl.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const baseHeaders = (extra: Record<string, string> = {}) => ({
  "User-Agent": UA,
  "Accept-Language": "en-AU,en;q=0.9",
  Referer: "https://www.woolworths.com.au/",
  ...extra,
});

// Heuristic: does this body look like a bot-block / challenge page?
function looksBlocked(status: number, contentType: string, body: string): boolean {
  const b = body.toLowerCase();
  return (
    status === 403 ||
    status === 429 ||
    status === 503 ||
    /access denied|are you a human|captcha|incapsula|_incapsula_|distil|cf-challenge|attention required|bot detection|request unsuccessful/i.test(
      b,
    ) ||
    (contentType.includes("text/html") && b.includes("incapsula"))
  );
}

type FirstProduct = { name: string | null; price: number | null; stockcode: number | string | null };

type AttemptReport = {
  attempt: string;
  url: string;
  status: number | null;
  contentType: string | null;
  looksLikeProductData: boolean;
  looksLikeBlockOrChallenge: boolean;
  productCount: number;
  sample: FirstProduct[];
  note: string;
  error?: string;
};

// Pull a Cookie header value out of a set of Set-Cookie headers.
function cookiesFromResponse(res: Response): string {
  // Deno exposes combined Set-Cookie via getSetCookie() when available.
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  let list: string[] = [];
  if (typeof anyHeaders.getSetCookie === "function") {
    list = anyHeaders.getSetCookie();
  } else {
    const raw = res.headers.get("set-cookie");
    if (raw) list = [raw];
  }
  return list.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

// Try to extract products from a parsed Woolworths Search API JSON payload.
function extractApiProducts(data: unknown): FirstProduct[] {
  const out: FirstProduct[] = [];
  const groups = (data as { Products?: unknown[] })?.Products;
  if (!Array.isArray(groups)) return out;
  for (const g of groups) {
    // Each group has a nested Products array; the leaf holds Name/Price/Stockcode.
    const leaves = (g as { Products?: unknown[] })?.Products ?? [g];
    for (const p of leaves as Record<string, unknown>[]) {
      if (!p) continue;
      out.push({
        name: (p.Name as string) ?? (p.DisplayName as string) ?? null,
        price: (p.Price as number) ?? (p.InstorePrice as number) ?? null,
        stockcode: (p.Stockcode as number) ?? (p.Barcode as string) ?? null,
      });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

// Try to find product-ish JSON in an HTML page (best-effort regex probe).
function extractHtmlProducts(html: string): FirstProduct[] {
  const out: FirstProduct[] = [];
  // Look for "Name":"...", ... "Price":number ... "Stockcode":number clusters.
  const re =
    /"Stockcode":(\d+)[^}]*?"Name":"([^"]+)"[^}]*?"Price":([0-9.]+)|"Name":"([^"]+)"[^}]*?"Price":([0-9.]+)[^}]*?"Stockcode":(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 3) {
    if (m[1]) {
      out.push({ name: m[2], price: Number(m[3]), stockcode: Number(m[1]) });
    } else {
      out.push({ name: m[4], price: Number(m[5]), stockcode: Number(m[6]) });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = (await req.json().catch(() => ({}))) as { term?: string };
  const term =
    typeof body.term === "string" && body.term.trim() ? body.term.trim() : "milk";

  const attempts: AttemptReport[] = [];
  let succeeded: string | null = null;

  // --- Bootstrap: hit the homepage once to collect any session cookies. ---
  let cookie = "";
  let bootstrapNote = "skipped";
  try {
    const home = await fetch("https://www.woolworths.com.au/", {
      headers: baseHeaders({ Accept: "text/html" }),
    });
    cookie = cookiesFromResponse(home);
    bootstrapNote = `homepage status ${home.status}, cookies ${cookie ? "captured" : "none"}`;
    // Drain body so the connection is freed.
    await home.text().catch(() => "");
  } catch (e) {
    bootstrapNote = `homepage fetch failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  // --- ATTEMPT 1: JSON Search API ---
  {
    const url = `https://www.woolworths.com.au/apis/ui/Search/products?searchTerm=${encodeURIComponent(term)}`;
    const report: AttemptReport = {
      attempt: "1-json-api",
      url,
      status: null,
      contentType: null,
      looksLikeProductData: false,
      looksLikeBlockOrChallenge: false,
      productCount: 0,
      sample: [],
      note: "",
    };
    try {
      const res = await fetch(url, {
        headers: baseHeaders({
          Accept: "application/json, text/plain, */*",
          ...(cookie ? { Cookie: cookie } : {}),
        }),
      });
      report.status = res.status;
      report.contentType = res.headers.get("content-type");
      const text = await res.text();
      report.looksLikeBlockOrChallenge = looksBlocked(res.status, report.contentType ?? "", text);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (parsed) {
        const products = extractApiProducts(parsed);
        report.sample = products;
        report.productCount = products.length;
        report.looksLikeProductData = products.length > 0;
        report.note = products.length > 0 ? "Parsed JSON and found products." : "Parsed JSON but no products matched expected shape.";
        if (products.length > 0) succeeded = report.attempt;
      } else {
        report.note = `Response was not JSON (first 160 chars): ${text.slice(0, 160).replace(/\s+/g, " ")}`;
      }
    } catch (e) {
      report.error = e instanceof Error ? e.message : String(e);
      report.note = "Fetch threw.";
    }
    attempts.push(report);
  }

  // --- ATTEMPT 2: HTML search page fallback (only if attempt 1 didn't succeed) ---
  if (!succeeded) {
    const url = `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(term)}`;
    const report: AttemptReport = {
      attempt: "2-html-fallback",
      url,
      status: null,
      contentType: null,
      looksLikeProductData: false,
      looksLikeBlockOrChallenge: false,
      productCount: 0,
      sample: [],
      note: "",
    };
    try {
      const res = await fetch(url, {
        headers: baseHeaders({
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...(cookie ? { Cookie: cookie } : {}),
        }),
      });
      report.status = res.status;
      report.contentType = res.headers.get("content-type");
      const html = await res.text();
      report.looksLikeBlockOrChallenge = looksBlocked(res.status, report.contentType ?? "", html);
      const hasPriceField = /"Price"\s*:/.test(html);
      const products = extractHtmlProducts(html);
      report.sample = products;
      report.productCount = products.length;
      report.looksLikeProductData = products.length > 0 || hasPriceField;
      report.note =
        products.length > 0
          ? "Found embedded product JSON in HTML."
          : hasPriceField
            ? 'HTML contains "Price" fields but no products parsed by the probe.'
            : 'No "Price" fields found in HTML.';
      if (products.length > 0) succeeded = report.attempt;
    } catch (e) {
      report.error = e instanceof Error ? e.message : String(e);
      report.note = "Fetch threw.";
    }
    attempts.push(report);
  }

  const result = {
    ok: true,
    term,
    bootstrap: bootstrapNote,
    succeededAttempt: succeeded,
    verdict: succeeded
      ? `Feasible via ${succeeded} — got product data from Woolworths.`
      : "Could not extract product data (see per-attempt block/challenge flags and notes).",
    attempts,
  };

  console.log("price-test report:", JSON.stringify(result));
  return json(200, result);
});
