import { useEffect, useState, useCallback } from "react";
import { Flag, Check, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";

interface Item {
  id: string;
  display_name: string;
  quantity: number | null;
  is_priority: boolean;
  is_checked: boolean;
  category: string;
  created_at: string;
}

export function ListTab({ householdId, active }: { householdId: string | null; active: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const { data } = await supabase
      .from("shopping_list_items")
      .select("id, display_name, quantity, is_priority, is_checked, category, created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true });
    setItems((data as Item[]) ?? []);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    if (active) fetchItems();
  }, [active, fetchItems]);

  const toggleChecked = async (item: Item) => {
    const next = !item.is_checked;
    setItems((arr) => arr.map((i) => (i.id === item.id ? { ...i, is_checked: next } : i)));
    await supabase.from("shopping_list_items").update({ is_checked: next }).eq("id", item.id);
  };

  if (!householdId) {
    return <p className="px-5 pt-6 text-sm text-neutral-400">Loading household…</p>;
  }

  const active_items = items.filter((i) => !i.is_checked);
  const checked = items.filter((i) => i.is_checked);

  const grouped = new Map<Category, Item[]>();
  for (const c of CATEGORIES) grouped.set(c, []);
  for (const it of active_items) {
    const key = (CATEGORIES as readonly string[]).includes(it.category)
      ? (it.category as Category)
      : "misc";
    grouped.get(key)!.push(it);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => Number(b.is_priority) - Number(a.is_priority));
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 pt-20 text-center">
        <ShoppingCart size={36} strokeWidth={1.5} className="text-neutral-300" />
        <p className="mt-4 text-base font-medium text-neutral-700">
          Your shopping list will appear here
        </p>
        <p className="mt-1 text-sm text-neutral-400">Add an item from the Input tab.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-6">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {active_items.length} {active_items.length === 1 ? "item" : "items"}
      </p>

      <div className="space-y-6">
        {CATEGORIES.map((c) => {
          const arr = grouped.get(c)!;
          if (arr.length === 0) return null;
          return (
            <section key={c}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {CATEGORY_LABELS[c]}
              </h2>
              <ul className="space-y-1.5">
                {arr.map((it) => (
                  <ItemRow key={it.id} item={it} onToggle={() => toggleChecked(it)} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {checked.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
            Checked off
          </h2>
          <ul className="space-y-1.5">
            {checked.map((it) => (
              <ItemRow key={it.id} item={it} onToggle={() => toggleChecked(it)} muted />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  muted,
}: {
  item: Item;
  onToggle: () => void;
  muted?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-neutral-100 bg-white px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.is_checked ? "Uncheck" : "Check off"}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
          item.is_checked
            ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-white"
            : "border-neutral-300 bg-white"
        }`}
      >
        {item.is_checked && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="flex flex-1 items-center gap-2">
        <span
          className={`text-[15px] ${
            muted ? "text-neutral-400 line-through" : "text-neutral-900"
          }`}
        >
          {item.display_name}
        </span>
        {item.quantity != null && (
          <span className={`text-sm ${muted ? "text-neutral-300" : "text-neutral-400"}`}>
            ×{item.quantity}
          </span>
        )}
      </div>
      {item.is_priority && (
        <Flag
          size={16}
          fill="currentColor"
          className={muted ? "text-neutral-300" : "text-amber-500"}
        />
      )}
    </li>
  );
}
