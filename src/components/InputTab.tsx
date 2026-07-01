import { useState, useRef, useEffect, useMemo } from "react";
import { Flag, Plus, Loader2, List, Sparkles, ChevronRight, X, Check } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BatchConfirmSheet, type BatchRow } from "./BatchConfirmSheet";
import { BulkAddSheet } from "./BulkAddSheet";
import { notifyHousehold } from "@/lib/push";
import { useMember } from "@/lib/member";
import { bumpRegular, topRegulars, normalizeName } from "@/lib/regulars";
import { COMMON_AISLES, ALL_COMMON_ITEMS } from "@/lib/common-items";
import { softSpring, snappySpring } from "@/lib/motion";

interface RecentItem {
  id: string;
  display_name: string;
  quantity: number | null;
  is_priority: boolean;
  category: Category | null;
  categorizing?: boolean;
}

const MAX_INLINE_BATCH = 10;

const parseCommaList = (s: string): string[] =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

export function InputTab({ householdId }: { householdId: string | null }) {
  const { session } = useAuth();
  const { member } = useMember();
  const userId = session?.user?.id;
  const memberName = member?.name ?? "Someone";
  const [text, setText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [priority, setPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [batchItems, setBatchItems] = useState<string[] | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [regularsTick, setRegularsTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const regulars = useMemo(
    () => topRegulars(8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regularsTick],
  );

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 1 || q.includes(",")) return [];
    const pool = Array.from(
      new Set([...regulars.map((r) => r.name), ...ALL_COMMON_ITEMS]),
    );
    return pool
      .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      .slice(0, 5);
  }, [text, regulars]);

  const categorize = async (
    raw: string,
  ): Promise<{ display_name: string; category: Category }> => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "categorize-item",
        { body: { text: raw } },
      );
      if (error) return { display_name: raw, category: "misc" };
      const d = data as { display_name?: string; category?: string };
      const name =
        typeof d?.display_name === "string" && d.display_name.trim()
          ? d.display_name.trim()
          : raw;
      const cat = (d?.category as Category) ?? "misc";
      return { display_name: name, category: cat };
    } catch {
      return { display_name: raw, category: "misc" };
    }
  };

  const insertSingle = async (
    raw: string,
    qty: number | null,
    isPriority: boolean,
  ) => {
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    setRecent((r) =>
      [
        {
          id: tempId,
          display_name: raw,
          quantity: qty,
          is_priority: isPriority,
          category: null,
          categorizing: true,
        },
        ...r,
      ].slice(0, 6),
    );

    const { display_name, category } = await categorize(raw);
    const { data, error: insertErr } = await supabase
      .from("shopping_list_items")
      .insert({
        user_id: userId,
        household_id: householdId,
        raw_input: raw,
        display_name,
        category,
        quantity: qty,
        is_priority: isPriority,
        is_checked: false,
        added_by_member_id: member?.id ?? null,
      })
      .select("id, display_name, quantity, is_priority, category")
      .single();

    if (insertErr || !data) {
      setError(insertErr?.message ?? "Failed to add item");
      setRecent((r) => r.filter((it) => it.id !== tempId));
      return;
    }
    setRecent((r) =>
      r.map((it) =>
        it.id === tempId
          ? { ...(data as RecentItem), categorizing: false }
          : it,
      ),
    );
    bumpRegular(display_name);
    setRegularsTick((t) => t + 1);
    if (householdId) {
      void notifyHousehold({
        householdId,
        memberId: member?.id ?? null,
        title: "Our Pantry",
        body: `${memberName} added ${display_name}`,
      });
    }
  };

  const quickAdd = async (name: string) => {
    if (!householdId || !userId) return;
    void insertSingle(name, null, false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !householdId || !userId || submitting) return;
    setError(null);

    const parts = parseCommaList(trimmed);
    const isMulti = parts.length > 1;

    if (isMulti) {
      if (parts.length > MAX_INLINE_BATCH) {
        setError(
          `That's ${parts.length} items. Remove some, or use Bulk add for longer lists.`,
        );
        return;
      }
      setBatchItems(parts);
      return;
    }

    setSubmitting(true);
    const qty = quantity.trim() === "" ? null : Number(quantity);
    const isPriority = priority;

    setText("");
    setQuantity("");
    setPriority(false);
    inputRef.current?.focus();
    setSubmitting(false);

    await insertSingle(trimmed, qty, isPriority);
  };

  const pickSuggestion = (name: string) => {
    setText("");
    setQuantity("");
    setPriority(false);
    inputRef.current?.focus();
    void insertSingle(name, null, false);
  };

  const toggleRecentPriority = async (id: string, next: boolean) => {
    if (id.startsWith("temp-")) return;
    setRecent((r) =>
      r.map((it) => (it.id === id ? { ...it, is_priority: next } : it)),
    );
    await supabase
      .from("shopping_list_items")
      .update({ is_priority: next })
      .eq("id", id);
  };

  const confirmBatch = async (rows: BatchRow[]) => {
    if (!householdId || !userId || rows.length === 0) {
      setBatchItems(null);
      return;
    }
    const payload = rows.map((r) => {
      const qtyNum =
        r.quantity.trim() === ""
          ? null
          : Math.max(1, parseInt(r.quantity, 10) || 1);
      return {
        user_id: userId,
        household_id: householdId,
        raw_input: r.raw,
        display_name: r.display_name.trim() || r.raw,
        category: r.category,
        quantity: qtyNum,
        is_priority: r.is_priority,
        is_checked: false,
        added_by_member_id: member?.id ?? null,
      };
    });

    const { data, error: insertErr } = await supabase
      .from("shopping_list_items")
      .insert(payload)
      .select("id, display_name, quantity, is_priority, category");

    if (insertErr) {
      const msg =
        insertErr.message ||
        (insertErr as { hint?: string }).hint ||
        "Bulk add failed";
      setError(msg);
      toast.error(`Bulk add failed: ${msg}`);
      throw insertErr;
    }

    const added = (data ?? []).map((d) => ({
      ...(d as RecentItem),
      categorizing: false,
    }));
    for (const row of added) bumpRegular(row.display_name);
    setRegularsTick((t) => t + 1);

    setRecent((r) => [...added.reverse(), ...r].slice(0, 6));
    setBatchItems(null);
    setBulkOpen(false);
    const n = added.length;
    if (householdId && n > 0) {
      void notifyHousehold({
        householdId,
        memberId: member?.id ?? null,
        title: "Our Pantry",
        body: `${memberName} added ${n} ${n === 1 ? "item" : "items"}`,
      });
    }
    setText("");
    setQuantity("");
    setPriority(false);
  };

  const notifyAdded = (name: string) => {
    toast.success(`${name} added`, { id: "add-feedback", duration: 2000 });
  };

  const chipAdd = (name: string) => {
    notifyAdded(name);
    quickAdd(name);
  };


  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-5 pb-10">
      {/* ---------- HERO BLOCK ---------- */}
      <div className="flex flex-col items-center pt-[10vh]">
        <h1
          className="font-display mb-5 text-center text-[28px] leading-tight"
          style={{ color: "var(--clay-ink)" }}
        >
          What do you need?
        </h1>

        {/* ---------- HERO INPUT ---------- */}
        <form onSubmit={submit} className="w-full space-y-2.5">
        <div className="relative">
          <div
            className="flex items-center gap-2 rounded-[14px] bg-white pl-4 pr-1.5 py-1.5"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add an item…"
              className="flex-1 bg-transparent py-2.5 text-[16px] outline-none placeholder:opacity-60"
              style={{ color: "var(--clay-ink)" }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <motion.button
              type="submit"
              disabled={!text.trim() || !householdId || submitting}
              whileTap={{ scale: 0.9 }}
              transition={snappySpring}
              aria-label="Add item"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40"
              style={{ background: "var(--clay-accent)" }}
            >
              <Plus size={22} strokeWidth={2.5} />
            </motion.button>
          </div>

          {suggestions.length > 0 && (
            <div
              className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[12px] bg-white shadow-sm"
              style={{ border: "1px solid var(--clay-border)" }}
            >
              <ul>
                {suggestions.map((s) => (
                  <li
                    key={s}
                    className="border-t first:border-t-0"
                    style={{ borderColor: "var(--clay-border)" }}
                  >
                    <SuggestionRow
                      label={s}
                      onAdd={() => {
                        notifyAdded(s);
                        pickSuggestion(s);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pl-1">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="qty-input"
              className="text-[12px]"
              style={{ color: "var(--clay-muted)" }}
            >
              + qty
            </label>
            <input
              id="qty-input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              className="w-14 rounded-full bg-white px-3 py-1 text-center text-[16px] outline-none"
              style={{
                border: "1px solid var(--clay-border)",
                color: "var(--clay-ink)",
              }}
            />
            <motion.button
              type="button"
              onClick={() => setPriority((p) => !p)}
              whileTap={{ scale: 0.94 }}
              aria-label="Toggle priority"
              aria-pressed={priority}
              className="ml-1 flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition"
              style={{
                border: "1px solid var(--clay-border)",
                background: priority ? "#FBEED9" : "#FFFFFF",
                color: priority ? "var(--clay-priority)" : "var(--clay-muted)",
              }}
            >
              <Flag size={12} fill={priority ? "currentColor" : "none"} />
              priority
            </motion.button>
          </div>
          <motion.button
            type="button"
            onClick={() => setBulkOpen(true)}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium transition"
            style={{
              border: "1px solid var(--clay-border)",
              color: "var(--clay-muted)",
            }}
          >
            <List size={13} />
            Bulk add
          </motion.button>
        </div>
      </form>

      {error && (
        <p className="mt-3 text-sm" style={{ color: "#B4441F" }}>
          {error}
        </p>
      )}
      {!householdId && (
        <p className="mt-3 text-sm" style={{ color: "var(--clay-muted)" }}>
          Loading household…
        </p>
      )}

      {/* ---------- YOUR REGULARS ---------- */}
      <section className="mt-7">
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <Sparkles size={12} style={{ color: "var(--clay-accent)" }} />
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            Your regulars
          </h2>
        </div>
        {regulars.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {regulars.map((r) => (
              <AddChip
                key={`reg-${r.name}`}
                label={r.name}
                onAdd={() => chipAdd(r.name)}
              />
            ))}
          </div>
        ) : (
          <p
            className="px-1 text-[13px]"
            style={{ color: "var(--clay-muted)" }}
          >
            Your most-added items will show up here.
          </p>
        )}
      </section>

      {/* ---------- BROWSE COMMON ITEMS ---------- */}
      <section className="mt-5">
        <motion.button
          type="button"
          onClick={() => setBrowseOpen(true)}
          whileTap={{ scale: 0.985 }}
          className="flex w-full items-center justify-between rounded-[14px] bg-white px-4 py-3.5 text-left transition active:bg-[var(--clay-accent-soft)]"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <span
            className="text-[15px]"
            style={{ color: "var(--clay-ink)" }}
          >
            Browse common items
          </span>
          <ChevronRight size={18} style={{ color: "var(--clay-muted)" }} />
        </motion.button>
      </section>

      {/* ---------- JUST ADDED ---------- */}
      {recent.length > 0 && (
        <section className="mt-7">
          <p
            className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            Just added
          </p>
          <div
            className="overflow-hidden rounded-[14px] bg-white"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <ul>
              <AnimatePresence initial={false}>
                {recent.map((it, idx) => (
                  <motion.li
                    key={it.id}
                    layout
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={softSpring}
                    className="flex items-center justify-between gap-2 overflow-hidden px-3.5 py-2.5"
                    style={{
                      borderTop:
                        idx === 0 ? "none" : "1px solid var(--clay-border)",
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className="truncate text-[14px]"
                        style={{ color: "var(--clay-ink)" }}
                      >
                        {it.display_name}
                      </span>
                      {it.quantity != null && (
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--clay-muted)" }}
                        >
                          ×{it.quantity}
                        </span>
                      )}
                    </div>

                    {it.categorizing || !it.category ? (
                      <span
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
                        style={{
                          background: "var(--clay-border)",
                          color: "var(--clay-muted)",
                        }}
                      >
                        <Loader2 size={10} className="animate-spin" />
                        sorting
                      </span>
                    ) : (
                      <motion.span
                        key={it.category}
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={snappySpring}
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: "var(--clay-accent-soft)",
                          color: "var(--clay-accent)",
                        }}
                      >
                        {CATEGORY_LABELS[it.category] ?? it.category}
                      </motion.span>
                    )}

                    <motion.button
                      type="button"
                      onClick={() =>
                        toggleRecentPriority(it.id, !it.is_priority)
                      }
                      whileTap={{ scale: 0.85 }}
                      aria-label="Toggle priority"
                      className="p-1 transition"
                      style={{
                        color: it.is_priority
                          ? "var(--clay-priority)"
                          : "#C9BBA8",
                      }}
                    >
                      <Flag
                        size={14}
                        fill={it.is_priority ? "currentColor" : "none"}
                      />
                    </motion.button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </section>
      )}

      {bulkOpen && !batchItems && (
        <BulkAddSheet
          onCancel={() => setBulkOpen(false)}
          onSubmit={(items) => {
            if (items.length === 0) return;
            setBatchItems(items);
          }}
        />
      )}

      {batchItems && (
        <BatchConfirmSheet
          rawItems={batchItems}
          onCancel={() => setBatchItems(null)}
          onConfirm={confirmBatch}
        />
      )}

      {browseOpen && (
        <BrowseSheet
          onClose={() => setBrowseOpen(false)}
          onPick={(name) => chipAdd(name)}
        />
      )}
    </div>
  );
}

function AddChip({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  const [added, setAdded] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handle = () => {
    onAdd();
    setAdded(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAdded(false), 1000);
  };

  return (
    <motion.button
      type="button"
      onClick={handle}
      whileTap={{ scale: 0.94 }}
      transition={snappySpring}
      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] transition-colors duration-200"
      style={{
        border: `1px solid ${added ? "var(--clay-accent)" : "var(--clay-border)"}`,
        background: added ? "var(--clay-accent)" : "#FFFFFF",
        color: added ? "#FFFFFF" : "var(--clay-ink)",
      }}
    >
      {added && <Check size={12} strokeWidth={3} />}
      {label}
    </motion.button>
  );
}

function SuggestionRow({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  const [added, setAdded] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handle = () => {
    onAdd();
    setAdded(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAdded(false), 1000);
  };

  return (
    <motion.button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handle}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[15px] transition-colors duration-200"
      style={{
        background: added ? "var(--clay-accent)" : "transparent",
        color: added ? "#FFFFFF" : "var(--clay-ink)",
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {added && <Check size={14} strokeWidth={3} />}
        <span className="truncate">{label}</span>
      </span>
      {!added && <Plus size={14} style={{ color: "var(--clay-accent)" }} />}
    </motion.button>
  );
}

function BrowseSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-t-[20px] bg-[var(--clay-bg)]"
        style={{
          maxHeight: "85vh",
          paddingBottom: "env(safe-area-inset-bottom)",
          border: "1px solid var(--clay-border)",
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3
            className="text-[16px] font-semibold"
            style={{ color: "var(--clay-ink)" }}
          >
            Browse common items
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <X size={16} style={{ color: "var(--clay-muted)" }} />
          </button>
        </div>
        <p
          className="px-5 pb-3 text-[12px]"
          style={{ color: "var(--clay-muted)" }}
        >
          Tap any item to add it.
        </p>
        <div
          className="overflow-y-auto px-5 pb-6"
          style={{ maxHeight: "calc(85vh - 84px)" }}
        >
          <div
            className="overflow-hidden rounded-[14px] bg-white"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            {COMMON_AISLES.map((aisle, idx) => (
              <div
                key={aisle.label}
                className="px-3.5 py-3"
                style={{
                  borderTop:
                    idx === 0 ? "none" : "1px solid var(--clay-border)",
                }}
              >
                <p
                  className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "var(--clay-muted)" }}
                >
                  {aisle.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {aisle.items.map((it) => (
                    <AddChip
                      key={`${aisle.label}-${it}`}
                      label={it}
                      onAdd={() => onPick(it)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Silence unused import in case tree-shaking complains
void normalizeName;
