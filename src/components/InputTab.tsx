import { useState, useRef, useEffect } from "react";
import { Flag, Plus, Loader2, List } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BatchConfirmSheet, type BatchRow } from "./BatchConfirmSheet";
import { BulkAddSheet } from "./BulkAddSheet";
import { notifyHousehold } from "@/lib/push";
import { useMember } from "@/lib/member";

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
        it.id === tempId ? { ...(data as RecentItem), categorizing: false } : it,
      ),
    );
    if (householdId) {
      void notifyHousehold({
        householdId,
        memberId: member?.id ?? null,
        title: "Our Pantry",
        body: `${memberName} added ${display_name}`,
      });
    }
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
    // Mirror the single-add insert exactly (same columns, same types, same
    // fields including household_id and added_by_member_id) so RLS + schema
    // accept the bulk insert.
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
        added_by_member_id: member?.id ?? null,
      };
    });

    const { data, error: insertErr } = await supabase
      .from("shopping_list_items")
      .insert(payload)
      .select("id, display_name, quantity, is_priority, category");

    if (insertErr) {
      // Surface the real error instead of silently returning to the review sheet.
      console.log("BULK ERROR message:", insertErr?.message);
      console.log("BULK ERROR details:", insertErr?.details);
      console.log("BULK ERROR hint:", insertErr?.hint);
      console.log("BULK ERROR code:", insertErr?.code);
      console.log("BULK payload sample:", JSON.stringify(payload?.[0]));
      const msg =
        insertErr.message ||
        (insertErr as { hint?: string }).hint ||
        "Bulk add failed";
      setError(msg);
      toast.error(`Bulk add failed: ${msg}`);
      // Throw so BatchConfirmSheet's saving spinner stops and the sheet stays
      // open for the user to retry.
      throw insertErr;
    }

    const added = (data ?? []).map((d) => ({
      ...(d as RecentItem),
      categorizing: false,
    }));
    setRecent((r) => [...added.reverse(), ...r].slice(0, 5));
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
    // Clear main input if it was source
    setText("");
    setQuantity("");
    setPriority(false);
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-6">
      <form onSubmit={submit} className="space-y-2.5">
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
            className="flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:opacity-60"
            style={{ color: "var(--clay-ink)" }}
          />
          <button
            type="submit"
            disabled={!text.trim() || !householdId || submitting}
            aria-label="Add item"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40"
            style={{ background: "var(--clay-accent)" }}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
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
            <button
              type="button"
              onClick={() => setPriority((p) => !p)}
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
            </button>
          </div>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium transition"
            style={{
              border: "1px solid var(--clay-border)",
              color: "var(--clay-muted)",
            }}
          >
            <List size={13} />
            Bulk add
          </button>
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

      {recent.length > 0 && (
        <div className="mt-7">
          <p
            className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            Just added
          </p>
          <section
            className="overflow-hidden rounded-[14px] bg-white"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <ul>
              {recent.map((it, idx) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5"
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
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: "var(--clay-accent-soft)",
                        color: "var(--clay-accent)",
                      }}
                    >
                      {CATEGORY_LABELS[it.category] ?? it.category}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleRecentPriority(it.id, !it.is_priority)}
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
                  </button>
                </li>
              ))}
            </ul>
          </section>
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
