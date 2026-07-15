// Single source of truth for the app's current "what's new" note.
// Update these three fields each time you ship a new version and publish;
// on first load the app records this via the publish-version Edge Function
// (idempotent), and the existing What's New popup then shows it once.
export const CURRENT_VERSION = {
  version: "1.8",
  title: "A few extras, if you want them",
  // Each bullet on its own line — the What's New popup preserves the \n breaks.
  notes: `• Head to Settings and turn on Advanced features to try what's new
• Prices and totals: estimated supermarket prices on your items, plus a running total as you shop
• Switch each extra on or off on its own, so you only get what you want
• Add the same thing twice? The list now spots it and lets you know
• Prices are estimates only, so treat them as a guide`,
} as const;
