// Coles provider — STUB. Auto prices not supported yet; implementing this file
// (and flipping supportsAutoPrices) is all that's needed to bring Coles online.
import type { PriceProvider } from "../types.ts";

export const coles: PriceProvider = {
  id: "coles",
  supportsAutoPrices: false,
  search(): Promise<never> {
    return Promise.reject(new Error("NotSupported"));
  },
};
