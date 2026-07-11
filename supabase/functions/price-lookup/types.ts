// Shared types for the price-lookup provider adapter pattern.

export type ProductHit = {
  name: string;
  size: string | null;
  stockcode: string | null;
  unitPriceText: string | null;
  /** Effective shelf price in whole cents (discounted price when on special). */
  priceCents: number;
  /** Pre-special price in cents when the item is discounted, else null. */
  wasPriceCents: number | null;
};

export type PriceProvider = {
  id: string;
  supportsAutoPrices: boolean;
  search(term: string): Promise<ProductHit[]>;
};
