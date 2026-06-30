import { useEffect, useState, useCallback, useMemo } from "react";
import { Flag, Check, ShoppingCart, Trash2, X, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { useMember } from "@/lib/member";

interface Item {
  id: string;
  display_name: string;
  quantity: number | null;
  is_priority: boolean;
  is_checked: boolean;
  category: string;
  created_at: string;
  added_by_member_id: string | null;
}

// Warm palette for member chips — assigned deterministically by member id.
const MEMBER_COLORS = ["#C2693F", "#6F8F5E", "#D38A2E", "#8E6E8A", "#A86A4B", "#5E8A8F"];

function memberColor(id: string | null | undefined) {
  if (!id) return "#C9BBA8";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

export function ListTab({ householdId, active }: { householdId: string | null; active: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const { members } = useMember();

  const memberMap = useMemo(() => {
    const m = new Map<string, { name: string; initial: string; color: string }>();
    for (const mem of members) {
      m.set(mem.id, {
        name: mem.name,
        initial: (mem.name?.[0] ?? "?").toUpperCase(),
        color: memberColor(mem.id),
      });
    }
    return m;
  }, [members]);

  const fetchItems = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const { data } = await supabase
      .from("shopping_list_items")
      .select(
        "id, display_name, quantity, is_priority, is_checked, category, created_at, added_by_member_id",
      )
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
    return <p className="px-5 pt-6 text-sm" style={{ color: "var(--clay-muted)" }}>Loading household…</p>;
  }

  const grouped = new Map<Category, Item[]>();
  for (const c of CATEGORIES) grouped.set(c, []);
  for (const it of items) {
    const key = (CATEGORIES as readonly string[]).includes(it.category)
      ? (it.category as Category)
      : "misc";
    grouped.get(key)!.push(it);
  }
  // Within each aisle: unchecked first, priority pinned to top of unchecked, then checked at bottom.
  for (const arr of grouped.values()) {
    arr.sort((a, b) => {
      if (a.is_checked !== b.is_checked) return a.is_checked ? 1 : -1;
      if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
      return a.created_at.localeCompare(b.created_at);
    });
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 pt-20 text-center">
        <ShoppingCart size={36} strokeWidth={1.5} style={{ color: "#C9BBA8" }} />
        <p className="mt-4 text-base font-medium" style={{ color: "var(--clay-ink)" }}>
          Your shopping list will appear here
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--clay-muted)" }}>
          Add an item from the Input tab.
        </p>
      </div>
    );
  }

  const totalActive = items.filter((i) => !i.is_checked).length;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-5 pb-8">
      <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--clay-muted)" }}>
        {totalActive} {totalActive === 1 ? "item" : "items"}
      </p>

      <div className="space-y-2.5">
        {CATEGORIES.map((c) => {
          const arr = grouped.get(c)!;
          if (arr.length === 0) return null;
          const activeCount = arr.filter((i) => !i.is_checked).length;
          return (
            <section
              key={c}
              className="overflow-hidden rounded-[14px] bg-white"
              style={{ border: "1px solid var(--clay-border)" }}
            >
              <header className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--clay-muted)" }}>
                  {CATEGORY_LABELS[c]}
                </h2>
                <span className="text-[11px] font-medium" style={{ color: "var(--clay-muted)" }}>
                  {activeCount}
                </span>
              </header>
              <ul>
                {arr.map((it, idx) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    isFirst={idx === 0}
                    member={it.added_by_member_id ? memberMap.get(it.added_by_member_id) : undefined}
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

      {editing && (
        <EditSheet item={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />
      )}
    </div>
  );
}

function ItemRow({
  item,
  isFirst,
  member,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: Item;
  isFirst: boolean;
  member?: { name: string; initial: string; color: string };
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const checked = item.is_checked;
  const priority = item.is_priority && !checked;

  return (
    <li
      className="relative flex items-center gap-2.5 px-3.5 py-2"
      style={{
        borderTop: isFirst ? "none" : "1px solid var(--clay-border)",
      }}
    >
      {priority && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
          style={{ background: "var(--clay-priority)" }}
        />
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-label={checked ? "Uncheck" : "Check off"}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition"
        style={{
          border: checked ? "1.8px solid var(--clay-accent)" : "1.8px solid #C9BBA8",
          background: checked ? "var(--clay-accent)" : "transparent",
          color: "#fff",
        }}
      >
        {checked && <Check size={12} strokeWidth={3.5} />}
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-[36px] flex-1 items-center gap-1.5 text-left"
      >
        <span
          className="text-[14px] leading-tight"
          style={{
            color: checked ? "var(--clay-muted)" : "var(--clay-ink)",
            opacity: checked ? 0.7 : 1,
          }}
        >
          {item.display_name}
        </span>
        {priority && (
          <Star
            size={12}
            fill="currentColor"
            style={{ color: "var(--clay-priority)" }}
          />
        )}
        {item.quantity != null && (
          <span className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
            ×{item.quantity}
          </span>
        )}
      </button>

      {member && (
        <span
          title={`Added by ${member.name}`}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
          style={{ background: member.color, opacity: checked ? 0.5 : 1 }}
        >
          {member.initial}
        </span>
      )}

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete item"
        className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition active:bg-[var(--clay-accent-soft)]"
        style={{ color: "#C9BBA8" }}
      >
        <Trash2 size={14} />
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
          <h3 className="text-base font-semibold" style={{ color: "var(--clay-ink)" }}>Edit item</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{ color: "var(--clay-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          className="w-full rounded-lg px-3 py-3 text-[16px] outline-none"
          style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
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
            className="w-20 rounded-full px-3 py-2 text-center text-[16px] outline-none"
            style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
          />
          <button
            type="button"
            onClick={() => setPriority((p) => !p)}
            aria-pressed={priority}
            className="flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-medium transition"
            style={{
              border: priority ? "1px solid var(--clay-priority)" : "1px solid var(--clay-border)",
              background: priority ? "#FBEED9" : "transparent",
              color: priority ? "var(--clay-priority)" : "var(--clay-muted)",
            }}
          >
            <Flag size={14} fill={priority ? "currentColor" : "none"} />
            Priority
          </button>
        </div>

        <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--clay-muted)" }}>
          Category
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className="min-h-[36px] rounded-full px-3 text-sm font-medium transition"
              style={{
                border:
                  category === c
                    ? "1px solid var(--clay-accent)"
                    : "1px solid var(--clay-border)",
                background: category === c ? "var(--clay-accent)" : "#fff",
                color: category === c ? "#fff" : "var(--clay-muted)",
              }}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg py-3 text-[15px] font-medium"
            style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-lg py-3 text-[15px] font-semibold text-white"
            style={{ background: "var(--clay-accent)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
