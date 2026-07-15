import { useEffect, useState, type FormEvent } from "react";
import { Pin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normaliseItemName } from "@/lib/itemNormalise";

// Advanced-only price editor (Phase 6 + pins). Bottom sheet with a matched-product
// section above the manual price input:
//   - PINNED: shows the pinned product with Change / Unpin.
//   - matched estimate: "Matched to: [label]" + Choose exact product.
//   - nothing: Choose exact product.
// The candidates search (which costs money per run) fires ONLY on an explicit tap
// of "Choose exact product" / "Change" — never on open, never automatically.
const MAX_DOLLARS = 999.99;

export type Candidate = {
  stockcode: string | null;
  name: string;
  size: string | null;
  price_cents: number;
  was_price_cents: number | null;
  unit_price_text: string | null;
  image: string | null;
};

type PinInfo = { product_name: string; size: string | null };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function PriceSheet({
  name,
  initialCents,
  priceLabel,
  householdId,
  supermarket,
  onSave,
  onRemove,
  onPin,
  onUnpin,
  onClose,
}: {
  name: string;
  initialCents: number | null;
  priceLabel: string | null;
  householdId: string | null;
  supermarket: string;
  onSave: (cents: number) => Promise<void>;
  onRemove?: () => Promise<void>;
  onPin: (c: Candidate) => Promise<boolean>;
  onUnpin: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState(
    initialCents != null ? (initialCents / 100).toFixed(2) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Product section state.
  const [pin, setPin] = useState<PinInfo | null | "loading">("loading");
  const [view, setView] = useState<"main" | "picker">("main");
  const [candState, setCandState] = useState<
    "idle" | "loading" | "loaded" | "unsupported"
  >("idle");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // ONE cheap read on open: is this item name already pinned? No Apify call ever.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!householdId) {
        setPin(null);
        return;
      }
      try {
        const { data } = await supabase
          .from("shopping_product_pins")
          .select("product_name, size")
          .eq("household_id", householdId)
          .eq("supermarket", supermarket)
          .eq("name_normalised", normaliseItemName(name))
          .maybeSingle();
        if (cancelled) return;
        setPin(data ? { product_name: data.product_name, size: data.size } : null);
      } catch {
        if (!cancelled) setPin(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId, supermarket, name]);

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

  // Explicit-tap only: fire the live candidates search.
  const openPicker = async () => {
    setView("picker");
    setCandState("loading");
    setCandidates([]);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("price-lookup", {
        body: { itemName: name, supermarket, mode: "candidates" },
      });
      if (fnErr || !data) {
        setCandidates([]);
        setCandState("loaded");
        return;
      }
      const d = data as { candidates?: Candidate[]; unsupported?: boolean };
      if (d.unsupported) {
        setCandState("unsupported");
        return;
      }
      setCandidates(Array.isArray(d.candidates) ? d.candidates : []);
      setCandState("loaded");
    } catch {
      setCandidates([]);
      setCandState("loaded");
    }
  };

  const pickCandidate = async (c: Candidate) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onPin(c);
      if (ok) {
        // Pin is a complete action: the price is applied and the row already
        // shows it with the pin indicator. Close the sheet so the now-stale
        // price input can't be mis-tapped into a 'manual' override. Reopening
        // prefills the input from the row's current (pinned) price.
        onClose();
        return;
      }
      // On failure the parent showed the notice + rolled back; stay in the picker.
    } finally {
      setBusy(false);
    }
  };

  const doUnpin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onUnpin();
      if (ok) setPin(null);
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
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
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

        {view === "picker" ? (
          <Picker
            state={candState}
            candidates={candidates}
            busy={busy}
            onPick={pickCandidate}
            onCancel={() => setView("main")}
          />
        ) : (
          <>
            {/* Matched-product section */}
            <ProductSection
              pin={pin}
              priceLabel={priceLabel}
              busy={busy}
              onChoose={openPicker}
              onUnpin={doUnpin}
            />

            <p className="mt-4 text-[14px]" style={{ color: "var(--clay-muted)" }}>
              Or set the price yourself
            </p>
            <form onSubmit={submit} className="mt-2 space-y-3">
              <div
                className="flex items-center gap-2 rounded-[12px] bg-white px-4"
                style={{ border: "1px solid var(--clay-border)" }}
              >
                <span
                  className="text-[18px] font-medium"
                  style={{ color: "var(--clay-muted)" }}
                >
                  $
                </span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
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
          </>
        )}
      </div>
    </div>
  );
}

function ProductSection({
  pin,
  priceLabel,
  busy,
  onChoose,
  onUnpin,
}: {
  pin: PinInfo | null | "loading";
  priceLabel: string | null;
  busy: boolean;
  onChoose: () => void;
  onUnpin: () => void;
}) {
  if (pin === "loading") {
    return (
      <p className="mt-3 text-[13px]" style={{ color: "var(--clay-muted)" }}>
        Checking product…
      </p>
    );
  }

  if (pin) {
    return (
      <div
        className="mt-3 rounded-[12px] bg-white p-3.5"
        style={{ border: "1px solid var(--clay-border)" }}
      >
        <div className="flex items-start gap-2">
          <Pin size={13} className="mt-0.5 shrink-0" style={{ color: "var(--clay-accent)" }} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug" style={{ color: "var(--clay-ink)" }}>
              {pin.product_name}
            </p>
            {pin.size && (
              <p className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
                {pin.size}
              </p>
            )}
          </div>
        </div>
        <div className="mt-2 flex gap-4">
          <button
            type="button"
            onClick={onChoose}
            disabled={busy}
            className="text-[13px] font-medium"
            style={{ color: "var(--clay-accent)" }}
          >
            Change
          </button>
          <button
            type="button"
            onClick={onUnpin}
            disabled={busy}
            className="text-[13px] font-medium"
            style={{ color: "var(--clay-muted)" }}
          >
            Unpin
          </button>
        </div>
      </div>
    );
  }

  // Not pinned.
  return (
    <div className="mt-3">
      {priceLabel && (
        <p className="mb-2 text-[13px]" style={{ color: "var(--clay-muted)" }}>
          Matched to: {priceLabel}
        </p>
      )}
      <button
        type="button"
        onClick={onChoose}
        disabled={busy}
        className="clay-btn-secondary"
      >
        Choose exact product
      </button>
    </div>
  );
}

function Picker({
  state,
  candidates,
  busy,
  onPick,
  onCancel,
}: {
  state: "idle" | "loading" | "loaded" | "unsupported";
  candidates: Candidate[];
  busy: boolean;
  onPick: (c: Candidate) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3">
      <p className="mb-3 text-[14px]" style={{ color: "var(--clay-muted)" }}>
        Pick the exact product
      </p>

      {state === "loading" && (
        <p className="py-6 text-center text-[14px]" style={{ color: "var(--clay-muted)" }}>
          Finding products…
        </p>
      )}

      {state === "unsupported" && (
        <p className="py-4 text-[14px]" style={{ color: "var(--clay-muted)" }}>
          Not available for this supermarket.
        </p>
      )}

      {state === "loaded" && candidates.length === 0 && (
        <p className="py-4 text-[14px]" style={{ color: "var(--clay-muted)" }}>
          No products found. You can still type a price yourself.
        </p>
      )}

      {state === "loaded" && candidates.length > 0 && (
        <ul className="space-y-2">
          {candidates.map((c, i) => (
            <li key={c.stockcode ?? i}>
              <button
                type="button"
                onClick={() => onPick(c)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-[12px] bg-white p-2.5 text-left disabled:opacity-60"
                style={{ border: "1px solid var(--clay-border)" }}
              >
                <CandidateImage src={c.image} />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[14px]"
                    style={{ color: "var(--clay-ink)" }}
                  >
                    {c.name}
                  </span>
                  {c.size && (
                    <span className="block text-[12px]" style={{ color: "var(--clay-muted)" }}>
                      {c.size}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className="block text-[14px] font-medium tabular-nums"
                    style={{ color: "var(--clay-ink)" }}
                  >
                    {money(c.price_cents)}
                  </span>
                  {c.was_price_cents != null && c.was_price_cents > c.price_cents && (
                    <span
                      className="block text-[12px] tabular-nums line-through"
                      style={{ color: "var(--clay-muted)" }}
                    >
                      {money(c.was_price_cents)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="clay-btn-ghost mt-3"
      >
        Cancel
      </button>
    </div>
  );
}

function CandidateImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className="h-11 w-11 shrink-0 rounded-lg"
        style={{ background: "var(--clay-accent-soft)", border: "1px solid var(--clay-border)" }}
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-11 w-11 shrink-0 rounded-lg object-contain"
      style={{ background: "#fff", border: "1px solid var(--clay-border)" }}
    />
  );
}
