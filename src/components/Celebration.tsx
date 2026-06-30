import { useEffect, useRef } from "react";

const CONFETTI_COLORS = ["#C2693F", "#D38A2E", "#6F8F5E"];

export function Celebration({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const N = 40;
    const pieces = Array.from({ length: N }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.35 + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 3.2,
      vy: -2 - Math.random() * 3.5,
      g: 0.12 + Math.random() * 0.05,
      size: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      shape: Math.random() < 0.5 ? "rect" : "circle",
    }));

    const start = performance.now();
    const DURATION = 2000;
    let raf = 0;

    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, w, h);
      const fade = elapsed < DURATION - 400 ? 1 : Math.max(0, (DURATION - elapsed) / 400);
      for (const p of pieces) {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (elapsed < DURATION) {
        raf = requestAnimationFrame(tick);
      } else {
        onDone();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center"
      aria-live="polite"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div
        className="pointer-events-auto mt-[22vh] rounded-2xl bg-white/95 px-6 py-4 text-center shadow-lg backdrop-blur"
        style={{ border: "1px solid var(--clay-border)" }}
        onClick={onDone}
      >
        <p
          className="text-[26px] leading-tight"
          style={{ fontFamily: "Fraunces, serif", color: "var(--clay-ink)" }}
        >
          All done!
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--clay-muted)" }}>
          Nice one — everything's in the trolley.
        </p>
      </div>
    </div>
  );
}
