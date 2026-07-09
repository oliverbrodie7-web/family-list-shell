import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useMember } from "@/lib/member";
import { snappySpring } from "@/lib/motion";

// "Suggest a feature" submit sheet — available to everyone (basic feature).
// Inserts a row into shopping_feedback.
export function FeedbackModal({
  householdId,
  onClose,
}: {
  householdId: string | null;
  onClose: () => void;
}) {
  const { member } = useMember();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    const { error: insErr } = await supabase.from("shopping_feedback").insert({
      household_id: householdId,
      member_id: member?.id ?? null,
      member_name: member?.name ?? null,
      message: trimmed,
    });
    setSending(false);
    if (insErr) {
      setError("Something went wrong — please try again.");
      return;
    }
    setSent(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={snappySpring}
        className="w-full max-w-[340px] rounded-[18px] bg-white p-6 shadow-xl"
        style={{ border: "1px solid var(--clay-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div className="space-y-5 text-center">
            <h2
              className="font-serif text-[22px] leading-tight"
              style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
            >
              Thanks! Your suggestion has been sent.
            </h2>
            <button onClick={onClose} className="clay-btn-primary w-full">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <h2
                className="font-serif text-[22px] leading-tight"
                style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
              >
                Suggest a feature
              </h2>
              <p className="mt-1 text-[14px]" style={{ color: "var(--clay-muted)" }}>
                What would you like Our Pantry to do?
              </p>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Your idea…"
              className="clay-input"
              style={{ resize: "none", lineHeight: 1.4 }}
            />
            {error && (
              <p className="text-[15px]" style={{ color: "#B4441F" }}>
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="clay-btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="clay-btn-primary flex-1"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
