import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

const SEEN_KEY = "op_last_seen_version";

type VersionRow = {
  version: string;
  title: string | null;
  notes: string;
};

export function WhatsNewPopup() {
  const [row, setRow] = useState<VersionRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("shopping_app_versions")
          .select("version,title,notes")
          .order("released_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const seen = localStorage.getItem(SEEN_KEY);
        if (!seen) {
          // First-ever run: mark as caught-up, don't show backlog.
          localStorage.setItem(SEEN_KEY, data.version);
          return;
        }
        if (seen !== data.version) {
          setRow(data as VersionRow);
        }
      } catch {
        /* silent */
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    if (row) localStorage.setItem(SEEN_KEY, row.version);
    setRow(null);
  };

  return (
    <AnimatePresence>
      {row && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ background: "rgba(55,48,43,0.35)" }}
          onClick={dismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="w-full max-w-[340px] rounded-[18px] p-7 shadow-2xl"
            style={{
              background: "var(--clay-surface)",
              border: "1px solid var(--clay-border)",
              boxShadow: "0 25px 60px -20px rgba(55,48,43,0.35)",
            }}
          >
            <div
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "var(--clay-accent)" }}
            >
              What's new
            </div>
            <h2
              className="font-display text-[26px] leading-[1.15]"
              style={{ color: "var(--clay-ink)" }}
            >
              {row.title || "What's new"}
            </h2>
            <p
              className="mt-4 whitespace-pre-wrap text-[16px] leading-[1.55]"
              style={{ color: "var(--clay-ink)" }}
            >
              {row.notes}
            </p>
            <div className="mt-7">
              <button onClick={dismiss} className="clay-btn-primary">
                Got it
              </button>
            </div>
            <div className="mt-3 text-center">
              <span
                className="text-[12px] font-medium"
                style={{ color: "var(--clay-muted)" }}
              >
                v{row.version}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
