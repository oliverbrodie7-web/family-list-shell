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
          className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 pt-10 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "rgba(55,48,43,0.35)" }}
          onClick={dismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="w-full max-w-[380px] rounded-3xl p-6 shadow-xl"
            style={{
              background: "var(--clay-surface)",
              border: "1px solid var(--clay-border)",
            }}
          >
            <div
              className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--clay-accent)" }}
            >
              What's new
            </div>
            <h2
              className="font-serif text-[24px] leading-tight"
              style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
            >
              {row.title || "What's new"}
            </h2>
            <p
              className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed"
              style={{ color: "var(--clay-ink)" }}
            >
              {row.notes}
            </p>
            <div className="mt-5 flex items-center justify-between">
              <span className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
                v{row.version}
              </span>
              <button onClick={dismiss} className="clay-btn-primary px-5 py-2 text-[14px]">
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
