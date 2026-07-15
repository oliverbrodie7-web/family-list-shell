// Client helper for auto price estimates (advanced 'pricing' feature).
// Fire-and-forget: every failure path resolves to null and never throws,
// so adding items can never be blocked or broken by pricing.
//
// householdId is passed so price-lookup can honour the household's pins; a pin
// hit comes back as source 'pin' and is written to the row with price_source
// 'pin' (plain price, protected from estimates like 'manual').
import { supabase } from "./supabase";

export type PriceEstimate = {
  price_cents: number;
  matched_name: string | null;
  source: "pin" | "estimate";
};

async function fetchPriceEstimate(
  itemName: string,
  supermarket: string,
  householdId: string | null,
): Promise<PriceEstimate | null> {
  try {
    const { data, error } = await supabase.functions.invoke("price-lookup", {
      body: { itemName, supermarket, householdId },
    });
    if (error || !data) return null;
    const d = data as {
      unsupported?: boolean;
      price_cents?: unknown;
      matched_name?: unknown;
      source?: unknown;
    };
    if (d.unsupported || typeof d.price_cents !== "number") return null;
    return {
      price_cents: d.price_cents,
      matched_name: typeof d.matched_name === "string" ? d.matched_name : null,
      source: d.source === "pin" ? "pin" : "estimate",
    };
  } catch {
    return null;
  }
}

// Look up a price and write it onto the item row — but ONLY when the row's
// price_source is still null or 'estimate'. Manual AND pin (and suppressed)
// prices are never overwritten (the .or filter excludes anything that isn't
// null or 'estimate', so the update matches zero rows for them).
export async function applyPriceEstimate(
  itemId: string,
  itemName: string,
  supermarket: string,
  householdId: string | null,
): Promise<PriceEstimate | null> {
  const est = await fetchPriceEstimate(itemName, supermarket, householdId);
  if (!est) return null;
  try {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .update({
        price_cents: est.price_cents,
        price_source: est.source,
        price_label: est.matched_name,
      })
      .eq("id", itemId)
      .or("price_source.is.null,price_source.eq.estimate")
      .select("id");
    if (error || !data || data.length === 0) return null;
    return est;
  } catch {
    return null;
  }
}
