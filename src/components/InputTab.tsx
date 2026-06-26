import { useState, useRef, useEffect } from "react";
import { Flag, Plus, Loader2, List } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BatchConfirmSheet, type BatchRow } from "./BatchConfirmSheet";
import { BulkAddSheet } from "./BulkAddSheet";

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
  const userId = session?.user?.id;
  const [text, setText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [priority, setPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [batchItems, setBatchItems] = useState<string[] | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const categorize = async (
    raw: string,
  ): Promise<{ display_name: string; category: Category }> => {
    try {
      const { data, error } = await supabase.functions.invoke("categorize-item", {
        body: { text: raw },
      });
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
    const tempId = `temp-${Date.now()}`;
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
      ].slice(0, 5),
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
        it.id === tempId ? { ...(data as RecentItem), categorizing: false } : it,
      ),
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !householdId || !userId || submitting) return;
    setError(null);

    // Detect comma-separated multi-add
    const parts = parseCommaList(trimmed);
    const isMulti = parts.length > 1;

    if (isMulti) {
      if (parts.length > MAX_INLINE_BATCH) {
        setError(
          `That's ${parts.length} items. Remove some, or use Bulk add for longer lists.`,
        );
        return;
      }
      // Route to confirm screen; preserve input until user confirms or cancels
      setBatchItems(parts);
      return;
    }

    // ---- Single-item path: unchanged behaviour ----
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

  const toggleRecentPriority = async (id: string, next: boolean) => {
    if (id.startsWith("temp-")) return;
    setRecent((r) => r.map((it) => (it.id === id ? { ...it, is_priority: next } : it)));
    await supabase.from("shopping_list_items").update({ is_priority: next }).eq("id", id);
  };

  const confirmBatch = async (rows: BatchRow[]) => {
    if (!householdId || !userId || rows.length === 0) {
      setBatchItems(null);
      return;
    }
    const payload = rows.map((r) => {
      const qtyNum =
        r.quantity.trim() === "" ? null : Math.max(1, parseInt(r.quantity, 10) || 1);
      return {
        user_id: userId,
        household_id: householdId,
        raw_input: r.raw,
        display_name: r.display_name.trim() || r.raw,
        category: r.category,
        quantity: qtyNum,
        is_priority: r.is_priority,
        is_checked: false,
      };
    });

    const { data, error: insertErr } = await supabase
      .from("shopping_list_items")
      .insert(payload)
      .select("id, display_name, quantity, is_priority, category");

    if (insertErr) {
      setError(insertErr.message);
      return;
    }

    const added = (data ?? []).map((d) => ({
      ...(d as RecentItem),
      categorizing: false,
    }));
    setRecent((r) => [...added.reverse(), ...r].slice(0, 5));
    setBatchItems(null);
    setBulkOpen(false);
    // Clear main input if it was source
    setText("");
    setQuantity("");
    setPriority(false);
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-6">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add an item…"
            className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition focus:border-[var(--accent-green)]"
          />
          <button
            type="button"
            onClick={() => setPriority((p) => !p)}
            aria-label="Toggle priority"
            aria-pressed={priority}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition ${
              priority
                ? "border-amber-300 bg-amber-50 text-amber-500"
                : "border-neutral-200 bg-white text-neutral-400"
            }`}
          >
            <Flag size={20} fill={priority ? "currentColor" : "none"} />
          </button>
          <button
            type="submit"
            disabled={!text.trim() || !householdId || submitting}
            aria-label="Add item"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-green)] text-white transition disabled:opacity-40"
          >
            <Plus size={22} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pl-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400" htmlFor="qty-input">
              + qty
            </label>
            <input
              id="qty-input"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              className="w-14 rounded-full border border-neutral-200 bg-white px-3 py-1 text-center text-sm text-neutral-700 outline-none transition focus:border-[var(--accent-green)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition active:bg-neutral-50"
          >
            <List size={14} />
            Bulk add
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      {!householdId && (
        <p className="mt-3 text-sm text-neutral-400">Loading household…</p>
      )}

      {recent.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Just added
          </p>
          <ul className="space-y-1.5">
            {recent.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm text-neutral-800">
                  <span>{it.display_name}</span>
                  {it.quantity != null && (
                    <span className="text-neutral-400">×{it.quantity}</span>
                  )}
                  {it.categorizing || !it.category ? (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-400">
                      <Loader2 size={10} className="animate-spin" />
                      sorting
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                      {CATEGORY_LABELS[it.category] ?? it.category}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleRecentPriority(it.id, !it.is_priority)}
                  aria-label="Toggle priority"
                  className={`p-1 transition ${
                    it.is_priority ? "text-amber-500" : "text-neutral-300"
                  }`}
                >
                  <Flag size={16} fill={it.is_priority ? "currentColor" : "none"} />
                </button>
              </li>
            ))}
          </ul>
        </div>
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
    </div>
  );
}
