// Single source of truth for the app's current "what's new" note.
// Update these three fields each time you ship a new version and publish;
// on first load the app records this via the publish-version Edge Function
// (idempotent), and the existing What's New popup then shows it once.
export const CURRENT_VERSION = {
  version: "1.6",
  title: "A few lovely new things",
  notes:
    "Add by voice: tap Say your list and just say what you need, even a few things at once. Invite your family: share a code so everyone adds to the same list. Add straight from your list: each aisle now has a plus, so you can pop something in without leaving the page. Quick undo: just added something by mistake? Undo it right there. Plus a cleaner, simpler add screen. Happy shopping!",
} as const;
