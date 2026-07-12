// Comparison-only normaliser for duplicate detection on list adds.
// NEVER used for display and NEVER written to the database — it exists so that
// "Apple", "apples", "APPLE" and " apples " all count as the same item.
// The plural fold is deliberately simple: consistency matters more than
// linguistic perfection since both sides of every comparison go through it.
export function normaliseItemName(name: string): string {
  let n = name.toLowerCase().trim().replace(/\s+/g, " ");
  if (n.endsWith("ies")) n = n.slice(0, -3) + "y";
  else if (n.endsWith("s") && n.length > 3) n = n.slice(0, -1);
  return n;
}
