// Aldi provider — STUB. Aldi has no practical product-price API; households on
// Aldi use manual prices only.
import type { PriceProvider } from "../types.ts";

export const aldi: PriceProvider = {
  id: "aldi",
  supportsAutoPrices: false,
  search(): Promise<never> {
    return Promise.reject(new Error("NotSupported"));
  },
};
