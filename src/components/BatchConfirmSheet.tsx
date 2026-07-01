import { useEffect, useState } from "react";
import { Flag, X, Trash2, Loader2, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";

export interface BatchRow {
  key: string;
  raw: string;
  display_name: string;
  category: Category;
  quantity: string;
  is_priority: boolean;
}

export function BatchConfirmSheet({
  rawItems,
  onCancel,
  onConfirm,
}: {
  rawItems: string[];
  onCancel: () => void;
  onConfirm: (rows: BatchRow[]) => Promise<void> | void;
}) {
  const [rows, setRows] = useState<BatchRow[]>(() =>
    rawItems.map((raw, i) => ({
      key: `${Date.now()}-${i}`,
      raw,
      display_name: raw,
      category: "misc" as Category,
      quantity: "",
      is_priority: false,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openCatFor, setOpenCatFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "categorize-item",
          { body: { items: rawItems } },
        );
        if (cancelled) return;
        const results = (data as {
          results?: { display_name?: string; category?: string }[];
        })?.results;
        if (!error && Array.isArray(results)) {
          setRows((prev) =>
            prev.map((r, i) => {
              const res = results[i];
              if (!res) return r;
              const cat = (CATEGORIES as readonly string[]).includes(
                res.category ?? "",
              )
                ? (res.category as Category)
                : "misc";
              return {
                ...r,
                display_name: res.display_name?.trim() || r.display_name,
                category: cat,
              };
            }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (key: string, patch: Partial<BatchRow>) =>
    setRows((arr) => arr.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) =>
    setRows((arr) => arr.filter((r) => r.key !== key));

  const addAll = async () => {
    if (saving || rows.length === 0) return;
    setSaving(true);
    try {
      await onConfirm(rows);
    } catch {
      // Parent surfaces the error (toast). Keep the sheet open so the user
      // can retry without losing their reviewed items.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 active:bg-neutral-100"
        >
          <X size={20} />
        </button>
        <h2 className="text-base font-semibold text-neutral-900">
          Review {rows.length} {rows.length === 1 ? "item" : "items"}
        </h2>
        <div className="w-9" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-32">
        {loading && (
          <div className="mb-3 flex items-center gap-2 text-xs text-neutral-400">
            <Loader2 size={12} className="animate-spin" />
            Sorting items…
          </div>
        )}
        {rows.length === 0 ? (
          <p className="mt-10 text-center text-sm text-neutral-400">
            No items to add.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.key}
                className="rounded-xl border border-neutral-200 bg-white p-3"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={r.display_name}
                    onChange={(e) =>
                      update(r.key, { display_name: e.target.value })
                    }
                    className="min-h-[44px] flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-[16px] text-neutral-900 outline-none focus:border-[var(--accent-green)]"
                  />
                  <button
                    type="button"
                    onClick={() => remove(r.key)}
                    aria-label="Remove"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-300 active:bg-neutral-100 active:text-red-500"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCatFor((cur) => (cur === r.key ? null : r.key))
                    }
                    className="flex min-h-[36px] items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-3 text-xs font-medium uppercase tracking-wider text-neutral-600"
                  >
                    {loading && r.category === "misc" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : null}
                    {CATEGORY_LABELS[r.category]}
                    <ChevronDown size={12} />
                  </button>

                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={r.quantity}
                    onChange={(e) =>
                      update(r.key, { quantity: e.target.value })
                    }
                    placeholder="Qty"
                    className="w-16 rounded-full border border-neutral-200 px-3 py-1.5 text-center text-base text-neutral-700 outline-none focus:border-[var(--accent-green)]"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      update(r.key, { is_priority: !r.is_priority })
                    }
                    aria-pressed={r.is_priority}
                    aria-label="Toggle priority"
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                      r.is_priority
                        ? "border-amber-300 bg-amber-50 text-amber-500"
                        : "border-neutral-200 text-neutral-400"
                    }`}
                  >
                    <Flag
                      size={14}
                      fill={r.is_priority ? "currentColor" : "none"}
                    />
                  </button>
                </div>

                {openCatFor === r.key && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          update(r.key, { category: c });
                          setOpenCatFor(null);
                        }}
                        className={`min-h-[34px] rounded-full border px-3 text-xs font-medium transition ${
                          r.category === c
                            ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-white"
                            : "border-neutral-200 bg-white text-neutral-600"
                        }`}
                      >
                        {CATEGORY_LABELS[c]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-100 bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <button
          type="button"
          onClick={addAll}
          disabled={saving || rows.length === 0}
          className="w-full rounded-xl bg-[var(--accent-green)] py-4 text-[15px] font-semibold text-white transition active:opacity-90 disabled:opacity-40"
        >
          {saving ? "Adding…" : `Add all (${rows.length})`}
        </button>
      </div>
    </div>
  );
}
