// Shared framer-motion presets. Keep springs quick and understated.
import type { Transition } from "framer-motion";

export const softSpring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.7,
};

export const snappySpring: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 40,
  mass: 0.6,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 26,
  mass: 0.8,
};

export const tapScale = { scale: 0.95 } as const;
