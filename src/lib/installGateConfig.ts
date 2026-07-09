// Rollout control for the "install as a PWA" gate.
//   "advanced-only" → only advanced-unlocked users (showAdvanced) are gated — safe initial rollout
//   "everyone"      → every non-installed (browser) user is gated
//   "off"           → never gate
// Set to "advanced-only" for the initial rollout.
export const INSTALL_GATE_MODE: "advanced-only" | "everyone" | "off" =
  "advanced-only";
