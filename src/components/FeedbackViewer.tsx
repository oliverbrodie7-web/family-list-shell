import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Admin feedback viewer — read-only list of all suggestions, newest first.
// Only rendered for advanced-unlocked users (gated by the caller).
type FeedbackRow = {
  id: string;
  member_name: string | null;
  message: string;
  created_at: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${day} ${month}, ${h}:${m}${ampm}`;
}

export function FeedbackViewer({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("shopping_feedback")
      .select("id, member_name, message, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError("Couldn't load suggestions.");
          setRows([]);
          return;
        }
        setRows((data ?? []) as FeedbackRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
        style={{ background: "var(--clay-bg)", border: "1px solid var(--clay-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--clay-border)" }}
        />

        <h2
          className="font-serif text-[24px] leading-tight"
          style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
        >
          Feedback
        </h2>
        <p className="text-[15px]" style={{ color: "var(--clay-muted)" }}>
          Suggestions from your family
        </p>

        <div className="mt-4 flex-1 space-y-2.5 overflow-y-auto">
          {rows === null ? (
            <p className="text-[15px]" style={{ color: "var(--clay-muted)" }}>
              Loading…
            </p>
          ) : error ? (
            <p className="text-[15px]" style={{ color: "#B4441F" }}>
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-[15px]" style={{ color: "var(--clay-muted)" }}>
              No suggestions yet.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="rounded-[14px] bg-white p-4"
                style={{ border: "1px solid var(--clay-border)" }}
              >
                <p
                  className="text-[15px] leading-snug"
                  style={{ color: "var(--clay-ink)", whiteSpace: "pre-wrap" }}
                >
                  {r.message}
                </p>
                <p className="mt-2 text-[13px]" style={{ color: "var(--clay-muted)" }}>
                  {r.member_name?.trim() || "Someone"} · {formatWhen(r.created_at)}
                </p>
              </div>
            ))
          )}
        </div>

        <button onClick={onClose} className="clay-btn-ghost mt-4">
          Close
        </button>
      </div>
    </div>
  );
}
