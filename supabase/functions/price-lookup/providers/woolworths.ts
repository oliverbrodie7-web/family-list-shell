// Woolworths AU provider — searches via the Apify actor
// dromb/woolworths-au-product-search-catalog-unofficial (run-sync, dataset items).
import type { PriceProvider, ProductHit } from "../types.ts";

const ACTOR_URL =
  "https://api.apify.com/v2/acts/dromb~woolworths-au-product-search-catalog-unofficial/run-sync-get-dataset-items";

const TIMEOUT_MS = 90_000;

export const woolworths: PriceProvider = {
  id: "woolworths",
  supportsAutoPrices: true,

  async search(term: string): Promise<ProductHit[]> {
    const token = Deno.env.get("APIFY_TOKEN");
    if (!token) throw new Error("missing_apify_token");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${ACTOR_URL}?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "search", query: term, includeRaw: false }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`apify_${res.status}`);

    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) throw new Error("apify_unexpected_shape");

    const hits: ProductHit[] = [];
    for (const item of raw as Record<string, unknown>[]) {
      if (!item) continue;
      // Only in-stock, available products with a usable price.
      if (item.is_available !== true) continue;
      if (item.stock_status !== "InStock") continue;

      // Prices arrive in DOLLARS. discount_price present => on special.
      const price = typeof item.price === "number" ? item.price : null;
      const discount =
        typeof item.discount_price === "number" ? item.discount_price : null;
      const effectiveDollars = discount ?? price;
      if (effectiveDollars == null) continue;

      hits.push({
        name: typeof item.name === "string" ? item.name : "",
        size: typeof item.size === "string" ? item.size : null,
        stockcode:
          item.sku != null ? String(item.sku) : item.id != null ? String(item.id) : null,
        unitPriceText: typeof item.unit_price === "string" ? item.unit_price : null,
        image: typeof item.image === "string" ? item.image : null,
        priceCents: Math.round(effectiveDollars * 100),
        wasPriceCents:
          discount != null && price != null ? Math.round(price * 100) : null,
      });
      if (hits.length >= 10) break;
    }
    return hits;
  },
};
