// Single source of truth for the app's current "what's new" note.
// Update these three fields each time you ship a new version and publish;
// on first load the app records this via the publish-version Edge Function
// (idempotent), and the existing What's New popup then shows it once.
export const CURRENT_VERSION = {
  version: "1.7",
  title: "Tell us what you'd love",
  // Each bullet on its own line — the What's New popup preserves the \n breaks.
  notes: `• New: tap "Got an idea? Suggest a feature" on the home screen to send us your ideas
• We're listening — your suggestions help shape what comes next
• Thanks for being part of Our Pantry!`,
} as const;
