import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { snappySpring } from "@/lib/motion";

// Generic front-and-centre Warm Clay notice — same visual family as the
// duplicate "already on your list" notice. Used for honest write-failure
// messages ("No connection. …"). Auto-dismisses, taps pass through
// (pointer-events-none), and a repeat REPLACES the visible notice (single
// state slot + timer reset) rather than stacking a second card.
const DISMISS_MS = 2800;

export function useCenterNotice(): {
  showNotice: (message: string, durationMs?: number) => void;
  centerNotice: ReactNode;
} {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // durationMs is optional; callers that omit it keep the default dismiss time.
  const showNotice = useCallback((m: string, durationMs = DISMISS_MS) => {
    setMessage(m);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setMessage(null), durationMs);
  }, []);

  return { showNotice, centerNotice: <CenterNoticeOverlay message={message} /> };
}

function CenterNoticeOverlay({ message }: { message: string | null }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[30%] z-[60] flex justify-center px-8"
    >
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={snappySpring}
            className="w-full max-w-[320px] rounded-[16px] bg-white px-5 py-4 text-center shadow-xl"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <p className="text-[15px] leading-snug" style={{ color: "var(--clay-ink)" }}>
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
