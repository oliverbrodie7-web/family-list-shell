// Shared framer-motion presets. Loosened for lively, iOS-like motion:
// clearly perceptible travel with a little spring overshoot as things settle
// (not floppy) — taps are quick and poppy, layout/reorder glide with a touch
// of bounce, and slower value tweens (progress, chevrons) read as smooth motion.
import type { Transition } from "framer-motion";

export const softSpring: Transition = {
  type: "spring",
  stiffness: 230,
  damping: 22,
  mass: 0.9,
};

export const snappySpring: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 18,
  mass: 0.7,
};

export const gentleSpring: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 24,
  mass: 1,
};

export const tapScale = { scale: 0.9 } as const;
