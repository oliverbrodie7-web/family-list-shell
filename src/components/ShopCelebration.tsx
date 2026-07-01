import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const COLORS = ["#C2693F", "#D38A2E", "#6F8F5E"];

interface Piece {
  left: number;
  cx: number;
  cr: number;
  delay: number;
  duration: number;
  color: string;
  rot: number;
}

export function ShopCelebration({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  const pieces = useMemo<Piece[]>(() => {
    return Array.from({ length: 28 }, () => ({
      left: Math.random() * 100,
      cx: (Math.random() - 0.5) * 160,
      cr: (Math.random() - 0.5) * 900,
      delay: Math.random() * 0.25,
      duration: 1.4 + Math.random() * 0.9,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * 360,
    }));
  }, []);

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), 1800);
    const end = setTimeout(onDone, 2400);
    return () => {
      clearTimeout(fade);
      clearTimeout(end);
    };
  }, [onDone]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      style={{
        animation: leaving
          ? "clay-celebrate-out 500ms ease forwards"
          : undefined,
      }}
      onClick={() => setLeaving(true)}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="clay-confetti-piece"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rot}deg)`,
              ["--cx" as string]: `${p.cx}px`,
              ["--cr" as string]: `${p.cr}deg`,
            } as React.CSSProperties
          }
        />
      ))}
      <div className="pointer-events-auto flex h-full items-center justify-center px-8">
        <motion.div
          initial={{ scale: 0.7, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 22, mass: 0.8 }}
          className="rounded-2xl bg-white/90 px-6 py-5 text-center shadow-lg backdrop-blur"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <p
            className="font-display text-[26px] leading-tight"
            style={{ color: "var(--clay-ink)" }}
          >
            All done!
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--clay-muted)" }}>
            Nice one — everything's in the trolley.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
