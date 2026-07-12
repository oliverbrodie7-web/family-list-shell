import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { snappySpring } from "@/lib/motion";

// Front-and-centre notice for blocked duplicate adds (basic feature).
// Renders mid-screen (safely above the keyboard), auto-dismisses after 2.5s,
// and never traps interaction: the whole overlay is pointer-events-none.
// Repeat duplicates REPLACE the visible notice (state swap + timer reset)
// rather than stacking. All other toasts keep their existing home.

const DISMISS_MS = 2500;

export function useDuplicateNotice(): {
  showDuplicate: (name: string) => void;
  duplicateNotice: ReactNode;
} {
  const [name, setName] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const showDuplicate = useCallback((n: string) => {
    setName(n);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setName(null), DISMISS_MS);
  }, []);

  return { showDuplicate, duplicateNotice: <DuplicateNoticeOverlay name={name} /> };
}

function DuplicateNoticeOverlay({ name }: { name: string | null }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[30%] z-[60] flex justify-center px-8"
    >
      <AnimatePresence>
        {name && (
          <motion.div
            key={name}
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={snappySpring}
            className="w-full max-w-[320px] rounded-[16px] bg-white px-5 py-4 text-center shadow-xl"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <p className="text-[16px] leading-snug" style={{ color: "var(--clay-ink)" }}>
              <span className="font-semibold" style={{ color: "var(--clay-accent)" }}>
                {name}
              </span>{" "}
              is already on your list
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
