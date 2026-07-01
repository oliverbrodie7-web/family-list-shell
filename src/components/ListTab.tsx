import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Check, ShoppingCart, Trash2, X, Star, Flag, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { useMember } from "@/lib/member";
import { ShopCelebration } from "./ShopCelebration";

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
  const [trolleyOpen, setTrolleyOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const prevActiveRef = useRef<number | null>(null);
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
    if (next && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.(10); } catch { /* ignore */ }
    }
    setItems((arr) => arr.map((i) => (i.id === item.id ? { ...i, is_checked: next } : i)));
    await supabase.from("shopping_list_items").update({ is_checked: next }).eq("id", item.id);
  };

  const clearTrolley = async () => {
    const checkedIds = items.filter((i) => i.is_checked).map((i) => i.id);
    if (checkedIds.length === 0) return;
    setItems((arr) => arr.filter((i) => !i.is_checked));
    setConfirmClear(false);
    await supabase.from("shopping_list_items").delete().in("id", checkedIds);
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
    return (
      <p className="px-5 pt-6 text-sm" style={{ color: "var(--clay-muted)" }}>
        Loading household…
      </p>
    );
  }

  // Split into active vs checked; each aisle-card shows only ONE side.
  const activeItems = items.filter((i) => !i.is_checked);
  const checkedItems = items.filter((i) => i.is_checked);

  const groupBy = (arr: Item[]) => {
    const g = new Map<Category, Item[]>();
    for (const c of CATEGORIES) g.set(c, []);
    for (const it of arr) {
      const key = (CATEGORIES as readonly string[]).includes(it.category)
        ? (it.category as Category)
        : "misc";
      g.get(key)!.push(it);
    }
    for (const list of g.values()) {
      list.sort((a, b) => {
        if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
        return a.created_at.localeCompare(b.created_at);
      });
    }
    return g;
  };

  const activeGrouped = groupBy(activeItems);
  const trolleyItems = [...checkedItems].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const total = items.length;
  const done = checkedItems.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  useEffect(() => {
    if (loading) return;
    const prev = prevActiveRef.current;
    if (prev != null && prev > 0 && activeItems.length === 0 && total > 0) {
      setCelebrate(true);
    }
    prevActiveRef.current = activeItems.length;
  }, [activeItems.length, total, loading]);

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

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-4 pb-8">
      <div className="mb-3 px-1">
        <div className="flex items-center justify-between">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--clay-muted)" }}
          >
            {activeItems.length} {activeItems.length === 1 ? "item" : "items"} left
          </p>
          <p className="text-[11px]" style={{ color: "var(--clay-muted)" }}>
            {done} of {total} in the trolley
          </p>
        </div>
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
          style={{ background: "var(--clay-border)" }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, background: "var(--clay-accent)" }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {CATEGORIES.map((c) => {
          const arr = activeGrouped.get(c)!;
          if (arr.length === 0) return null;
          return (
            <AisleCard
              key={c}
              label={CATEGORY_LABELS[c]}
              count={arr.length}
              items={arr}
              memberMap={memberMap}
              onToggle={toggleChecked}
              onEdit={setEditing}
              onDelete={deleteItem}
            />
          );
        })}
      </div>

      {trolleyItems.length > 0 && (
        <div className="mt-4">
          <TrolleyCard
            items={trolleyItems}
            memberMap={memberMap}
            open={trolleyOpen}
            onToggleOpen={() => setTrolleyOpen((o) => !o)}
            onUntick={toggleChecked}
            onClear={() => setConfirmClear(true)}
          />
        </div>
      )}

      {editing && <EditSheet item={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />}

      {confirmClear && (
        <ConfirmClearDialog
          count={trolleyItems.length}
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearTrolley}
        />
      )}
    </div>
  );
}

function AisleCard({
  label,
  count,
  items,
  memberMap,
  onToggle,
  onEdit,
  onDelete,
}: {
  label: string;
  count: number;
  items: Item[];
  memberMap: Map<string, { name: string; initial: string; color: string }>;
  onToggle: (i: Item) => void;
  onEdit: (i: Item) => void;
  onDelete: (i: Item) => void;
}) {
  return (
    <section
      className="overflow-hidden rounded-[14px] bg-white"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      <header className="flex items-center justify-between px-3.5 pt-2 pb-1">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--clay-muted)" }}
        >
          {label}
        </h2>
        <span className="text-[11px] font-medium" style={{ color: "var(--clay-muted)" }}>
          {count}
        </span>
      </header>
      <ul>
        {items.map((it, idx) => (
          <SwipeRow
            key={it.id}
            item={it}
            isFirst={idx === 0}
            member={it.added_by_member_id ? memberMap.get(it.added_by_member_id) : undefined}
            onToggle={() => onToggle(it)}
            onEdit={() => onEdit(it)}
            onDelete={() => onDelete(it)}
          />
        ))}
      </ul>
    </section>
  );
}

const SWIPE_MAX = 84;

function SwipeRow({
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
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const decided = useRef(false);
  const axisHoriz = useRef(false);

  const checked = item.is_checked;
  const priority = item.is_priority && !checked;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    decided.current = false;
    axisHoriz.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const nx = e.touches[0].clientX - startX.current;
    const ny = e.touches[0].clientY - startY.current;
    if (!decided.current) {
      if (Math.abs(nx) < 6 && Math.abs(ny) < 6) return;
      axisHoriz.current = Math.abs(nx) > Math.abs(ny);
      decided.current = true;
    }
    if (!axisHoriz.current) return;
    const base = open ? -SWIPE_MAX : 0;
    let next = base + nx;
    if (next > 0) next = 0;
    if (next < -SWIPE_MAX * 1.2) next = -SWIPE_MAX * 1.2;
    setDx(next);
  };
  const onTouchEnd = () => {
    dragging.current = false;
    if (!axisHoriz.current) {
      setDx(open ? -SWIPE_MAX : 0);
      return;
    }
    if (dx < -SWIPE_MAX / 2) {
      setOpen(true);
      setDx(-SWIPE_MAX);
    } else {
      setOpen(false);
      setDx(0);
    }
  };

  const handleNameClick = () => {
    if (open) {
      setOpen(false);
      setDx(0);
      return;
    }
    onEdit();
  };

  const handleDelete = () => {
    setOpen(false);
    setDx(0);
    onDelete();
  };

  return (
    <li
      className="relative"
      style={{ borderTop: isFirst ? "none" : "1px solid var(--clay-border)" }}
    >
      {/* Swipe delete underlay */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 flex items-center justify-end"
        style={{ width: SWIPE_MAX, background: "#C2693F" }}
      >
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-full w-full items-center justify-center text-white"
          aria-label="Delete item"
        >
          <Trash2 size={16} />
          <span className="ml-1.5 text-[13px] font-medium">Delete</span>
        </button>
      </div>

      <div
        className="relative flex items-center gap-2.5 bg-white px-3.5 py-2"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging.current ? "none" : "transform 180ms ease",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {priority && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-[3px]"
            style={{ background: "var(--clay-accent)" }}
          />
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-label={checked ? "Uncheck" : "Check off"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{
            border: checked ? "1.8px solid var(--clay-accent)" : "1.8px solid #C9BBA8",
            background: checked ? "var(--clay-accent)" : "transparent",
            color: "#fff",
            transition: "background 180ms ease, border-color 180ms ease, transform 180ms ease",
            transform: checked ? "scale(1.08)" : "scale(1)",
          }}
        >
          {checked && <Check size={12} strokeWidth={3.5} className="animate-scale-in" />}
        </button>

        <button
          type="button"
          onClick={handleNameClick}
          className="flex min-h-[28px] flex-1 items-center gap-1.5 text-left"
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
            <Star size={12} fill="currentColor" style={{ color: "var(--clay-priority)" }} />
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
      </div>
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
    (CATEGORIES as readonly string[]).includes(item.category)
      ? (item.category as Category)
      : "misc",
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
          <h3 className="text-base font-semibold" style={{ color: "var(--clay-ink)" }}>
            Edit item
          </h3>
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

        <p
          className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--clay-muted)" }}
        >
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

function TrolleyCard({
  items,
  memberMap,
  open,
  onToggleOpen,
  onUntick,
  onClear,
}: {
  items: Item[];
  memberMap: Map<string, { name: string; initial: string; color: string }>;
  open: boolean;
  onToggleOpen: () => void;
  onUntick: (i: Item) => void;
  onClear: () => void;
}) {
  return (
    <section
      className="overflow-hidden rounded-[14px] bg-white"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between px-3.5 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ShoppingCart size={13} style={{ color: "var(--clay-muted)" }} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            In the trolley
          </span>
          <span className="text-[11px] font-medium" style={{ color: "var(--clay-muted)" }}>
            · {items.length}
          </span>
        </span>
        <ChevronDown
          size={16}
          style={{
            color: "var(--clay-muted)",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 180ms ease",
          }}
        />
      </button>

      {open && (
        <>
          <ul style={{ borderTop: "1px solid var(--clay-border)" }}>
            {items.map((it) => {
              const member = it.added_by_member_id
                ? memberMap.get(it.added_by_member_id)
                : undefined;
              return (
                <li
                  key={it.id}
                  style={{ borderTop: "1px solid var(--clay-border)" }}
                  className="first:border-t-0"
                >
                  <div className="flex items-center gap-2.5 bg-white px-3.5 py-2">
                    <button
                      type="button"
                      onClick={() => onUntick(it)}
                      aria-label="Return to list"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{
                        border: "1.8px solid var(--clay-accent)",
                        background: "var(--clay-accent)",
                        color: "#fff",
                      }}
                    >
                      <Check size={12} strokeWidth={3.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onUntick(it)}
                      className="flex min-h-[28px] flex-1 items-center gap-1.5 text-left"
                    >
                      <span
                        className="text-[14px] leading-tight"
                        style={{ color: "var(--clay-muted)", opacity: 0.75 }}
                      >
                        {it.display_name}
                      </span>
                      {it.quantity != null && (
                        <span className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
                          ×{it.quantity}
                        </span>
                      )}
                    </button>
                    {member && (
                      <span
                        title={`Added by ${member.name}`}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                        style={{ background: member.color, opacity: 0.5 }}
                      >
                        {member.initial}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div
            className="px-3.5 py-2"
            style={{ borderTop: "1px solid var(--clay-border)" }}
          >
            <button
              type="button"
              onClick={onClear}
              className="w-full rounded-lg py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--clay-accent)" }}
            >
              Done — clear trolley
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ConfirmClearDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 pb-[max(env(safe-area-inset-bottom),0px)]"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold" style={{ color: "var(--clay-ink)" }}>
          Clear the trolley?
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--clay-muted)" }}>
          This removes {count} bought {count === 1 ? "item" : "items"} from the list. Unticked
          items stay for next time.
        </p>
        <div className="mt-4 flex gap-2">
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
            onClick={onConfirm}
            className="flex-1 rounded-lg py-3 text-[15px] font-semibold text-white"
            style={{ background: "var(--clay-accent)" }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
