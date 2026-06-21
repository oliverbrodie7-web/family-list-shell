import { useState, useRef, useEffect } from "react";
import { Flag, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";

interface RecentItem {
  id: string;
  display_name: string;
  quantity: number | null;
  is_priority: boolean;
  category: Category;
}

export function InputTab({ householdId }: { householdId: string | null }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [text, setText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<Category>("misc");
  const [priority, setPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !householdId || !userId || submitting) return;
    setSubmitting(true);
    setError(null);
    const qty = quantity.trim() === "" ? null : Number(quantity);
    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert({
        user_id: userId,
        household_id: householdId,
        raw_input: trimmed,
        display_name: trimmed,
        category,
        quantity: qty,
        is_priority: priority,
        is_checked: false,
      })
      .select("id, display_name, quantity, is_priority, category")
      .single();
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setRecent((r) => [data as RecentItem, ...r].slice(0, 5));
    }
    setText("");
    setQuantity("");
    setPriority(false);
    inputRef.current?.focus();
  };

  const toggleRecentPriority = async (id: string, next: boolean) => {
    setRecent((r) => r.map((it) => (it.id === id ? { ...it, is_priority: next } : it)));
    await supabase.from("shopping_list_items").update({ is_priority: next }).eq("id", id);
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
            className={`flex h-12 w-12 items-center justify-center rounded-xl border transition ${
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
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-green)] text-white transition disabled:opacity-40"
          >
            <Plus size={22} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  category === c
                    ? "border-[var(--accent-green)] bg-[var(--accent-green-soft)] text-[var(--accent-green)]"
                    : "border-neutral-200 bg-white text-neutral-500"
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qty"
            className="w-16 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-center text-sm text-neutral-700 outline-none focus:border-[var(--accent-green)]"
          />
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
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                    {CATEGORY_LABELS[it.category] ?? it.category}
                  </span>
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
    </div>
  );
}
