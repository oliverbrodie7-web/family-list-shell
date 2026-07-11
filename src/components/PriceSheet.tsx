import { useState, type FormEvent } from "react";

// Advanced-only manual price editor (Phase 6). Bottom sheet: item name heading,
// a dollars-and-cents input, Save, and (for already-priced items) Remove price.
// The parent performs the actual writes; this sheet just collects/validates.
const MAX_DOLLARS = 999.99;

export function PriceSheet({
  name,
  initialCents,
  onSave,
  onRemove,
  onClose,
}: {
  name: string;
  initialCents: number | null;
  onSave: (cents: number) => Promise<void>;
  onRemove?: () => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(
    initialCents != null ? (initialCents / 100).toFixed(2) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const cleaned = text.replace(/[$\s,]/g, "");
    const dollars = Number(cleaned);
    if (cleaned === "" || Number.isNaN(dollars) || dollars <= 0) {
      setError("Please enter a price like 4.50");
      return;
    }
    if (dollars > MAX_DOLLARS) {
      setError("That looks too high — max is $999.99");
      return;
    }
    setBusy(true);
    try {
      await onSave(Math.round(dollars * 100));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onRemove || busy) return;
    setBusy(true);
    try {
      await onRemove();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
        style={{ background: "var(--clay-bg)", border: "1px solid var(--clay-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--clay-border)" }}
        />

        <h2
          className="font-serif text-[22px] leading-tight"
          style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
        >
          {name}
        </h2>
        <p className="mt-1 text-[14px]" style={{ color: "var(--clay-muted)" }}>
          What does this cost?
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div
            className="flex items-center gap-2 rounded-[12px] bg-white px-4"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <span className="text-[18px] font-medium" style={{ color: "var(--clay-muted)" }}>
              $
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              autoFocus
              placeholder="4.50"
              maxLength={7}
              className="w-full bg-transparent py-3 text-[20px] font-medium outline-none"
              style={{ color: "var(--clay-ink)" }}
            />
          </div>
          {error && (
            <p className="text-[14px]" style={{ color: "#B4441F" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="clay-btn-primary">
            {busy ? "Saving…" : "Save"}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="w-full rounded-[12px] py-2.5 text-[14px] font-medium transition"
              style={{ color: "var(--clay-muted)", background: "transparent" }}
            >
              Remove price
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
