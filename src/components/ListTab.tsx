import { useEffect, useState, useCallback } from "react";
import { Flag, Check, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
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
  const [editing, setEditing] = useState<Item | null>(null);

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

  const deleteItem = async (item: Item) => {
    setItems((arr) => arr.filter((i) => i.id !== item.id));
    let undone = false;
    toast("Item deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          setItems((arr) =>
            [...arr, item].sort((a, b) => a.created_at.localeCompare(b.created_at)),
          );
        },
      },
      duration: 4000,
    });
    // Defer actual delete to allow undo window
    setTimeout(async () => {
      if (undone) return;
      await supabase.from("shopping_list_items").delete().eq("id", item.id);
    }, 4200);
  };

  const saveEdit = async (updated: Item) => {
    setItems((arr) => arr.map((i) => (i.id === updated.id ? updated : i)));
    setEditing(null);
    await supabase
      .from("shopping_list_items")
      .update({
        display_name: updated.display_name,
        category: updated.category,
        quantity: updated.quantity,
        is_priority: updated.is_priority,
      })
      .eq("id", updated.id);
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
                  <ItemRow
                    key={it.id}
                    item={it}
                    onToggle={() => toggleChecked(it)}
                    onEdit={() => setEditing(it)}
                    onDelete={() => deleteItem(it)}
                  />
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
              <ItemRow
                key={it.id}
                item={it}
                onToggle={() => toggleChecked(it)}
                onEdit={() => setEditing(it)}
                onDelete={() => deleteItem(it)}
                muted
              />
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <EditSheet
          item={editing}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
  muted,
}: {
  item: Item;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  muted?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-white px-3 py-2.5">
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
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-[44px] flex-1 items-center gap-2 text-left"
      >
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
      </button>
      {item.is_priority && (
        <Flag
          size={16}
          fill="currentColor"
          className={muted ? "text-neutral-300" : "text-amber-500"}
        />
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete item"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-300 transition active:bg-neutral-100 active:text-red-500"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}

function EditSheet({
  item,
  onCancel,
  onSave,
}: {
  item: Item;
  onCancel: () => void;
  onSave: (updated: Item) => void;
}) {
  const [name, setName] = useState(item.display_name);
  const [category, setCategory] = useState<Category>(
    (CATEGORIES as readonly string[]).includes(item.category) ? (item.category as Category) : "misc",
  );
  const [qty, setQty] = useState<string>(item.quantity != null ? String(item.quantity) : "");
  const [priority, setPriority] = useState(item.is_priority);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsedQty = qty.trim() === "" ? null : Math.max(1, parseInt(qty, 10) || 1);
    onSave({
      ...item,
      display_name: trimmed,
      category,
      quantity: parsedQty,
      is_priority: priority,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 pb-[max(env(safe-area-inset-bottom),0px)]"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Edit item</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-400 active:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          className="w-full rounded-lg border border-neutral-200 px-3 py-3 text-[16px] text-neutral-900 outline-none focus:border-[var(--accent-green)]"
          autoFocus
        />

        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qty"
            className="w-20 rounded-full border border-neutral-200 px-3 py-2 text-center text-[15px] text-neutral-900 outline-none focus:border-[var(--accent-green)]"
          />
          <button
            type="button"
            onClick={() => setPriority((p) => !p)}
            aria-pressed={priority}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
              priority
                ? "border-amber-500 bg-amber-50 text-amber-600"
                : "border-neutral-200 text-neutral-500"
            }`}
          >
            <Flag size={14} fill={priority ? "currentColor" : "none"} />
            Priority
          </button>
        </div>

        <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Category
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`min-h-[36px] rounded-full border px-3 text-sm font-medium transition ${
                category === c
                  ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-white"
                  : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-neutral-200 py-3 text-[15px] font-medium text-neutral-700 active:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-lg bg-[var(--accent-green)] py-3 text-[15px] font-semibold text-white active:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
