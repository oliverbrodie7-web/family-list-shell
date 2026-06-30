import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Flag, Check, ShoppingCart, Trash2, X, Star, ChevronDown } from "lucide-react";
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

interface RowGroup {
  key: string;
  items: Item[];
  display_name: string;
  category: Category;
  is_priority: boolean;
  is_checked: boolean;
  totalQty: number;
  count: number;
  earliestCreated: string;
  member_id: string | null;
}

const MEMBER_COLORS = ["#C2693F", "#6F8F5E", "#D38A2E", "#8E6E8A", "#A86A4B", "#5E8A8F"];

function memberColor(id: string | null | undefined) {
  if (!id) return "#C9BBA8";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function haptic() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    /* no-op */
  }
}

export function ListTab({ householdId, active }: { householdId: string | null; active: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RowGroup | null>(null);
  const [trolleyOpen, setTrolleyOpen] = useState(true);
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

  const toggleGroup = async (g: RowGroup) => {
    const next = !g.is_checked;
    if (next) haptic();
    const ids = g.items.map((i) => i.id);
    setItems((arr) => arr.map((i) => (ids.includes(i.id) ? { ...i, is_checked: next } : i)));
    await supabase.from("shopping_list_items").update({ is_checked: next }).in("id", ids);
  };

  const deleteGroup = async (g: RowGroup) => {
    const ids = g.items.map((i) => i.id);
    const snapshot = g.items;
    setItems((arr) => arr.filter((i) => !ids.includes(i.id)));
    let undone = false;
    toast(g.count > 1 ? `${g.count} items deleted` : "Item deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          setItems((arr) =>
            [...arr, ...snapshot].sort((a, b) => a.created_at.localeCompare(b.created_at)),
          );
        },
      },
      duration: 4000,
    });
    setTimeout(async () => {
      if (undone) return;
      await supabase.from("shopping_list_items").delete().in("id", ids);
    }, 4200);
  };

  const clearTrolley = async () => {
    const checkedIds = items.filter((i) => i.is_checked).map((i) => i.id);
    if (checkedIds.length === 0) return;
    if (!window.confirm(`Remove ${checkedIds.length} item${checkedIds.length === 1 ? "" : "s"} from the list?`)) return;
    setItems((arr) => arr.filter((i) => !i.is_checked));
    await supabase.from("shopping_list_items").delete().in("id", checkedIds);
  };

  const saveEdit = async (
    g: RowGroup,
    patch: { display_name: string; category: Category; quantity: number | null; is_priority: boolean },
  ) => {
    const ids = g.items.map((i) => i.id);
    setItems((arr) =>
      arr.map((i) =>
        ids.includes(i.id)
          ? {
              ...i,
              display_name: patch.display_name,
              category: patch.category,
              is_priority: patch.is_priority,
              quantity: i.id === ids[0] ? patch.quantity : i.quantity,
            }
          : i,
      ),
    );
    setEditing(null);
    await supabase
      .from("shopping_list_items")
      .update({
        display_name: patch.display_name,
        category: patch.category,
        is_priority: patch.is_priority,
      })
      .in("id", ids);
    await supabase
      .from("shopping_list_items")
      .update({ quantity: patch.quantity })
      .eq("id", ids[0]);
  };

  if (!householdId) {
    return <p className="px-5 pt-6 text-sm" style={{ color: "var(--clay-muted)" }}>Loading household…</p>;
  }

  // Group items by aisle (active only)
  const activeByCat = new Map<Category, RowGroup[]>();
  for (const c of CATEGORIES) activeByCat.set(c, []);

  const unmergedActive = new Map<string, Item[]>();
  const checkedItems: Item[] = [];
  for (const it of items) {
    const cat = (CATEGORIES as readonly string[]).includes(it.category)
      ? (it.category as Category)
      : "misc";
    if (it.is_checked) {
      checkedItems.push({ ...it, category: cat });
      continue;
    }
    const key = `${cat}::${normName(it.display_name)}`;
    if (!unmergedActive.has(key)) unmergedActive.set(key, []);
    unmergedActive.get(key)!.push({ ...it, category: cat });
  }

  for (const [, group] of unmergedActive) {
    const first = group[0];
    const cat = first.category as Category;
    const totalQty = group.reduce((s, i) => s + (i.quantity ?? 1), 0);
    activeByCat.get(cat)!.push({
      key: group.map((i) => i.id).join(","),
      items: group,
      display_name: first.display_name,
      category: cat,
      is_priority: group.some((i) => i.is_priority),
      is_checked: false,
      totalQty,
      count: group.length,
      earliestCreated: group.reduce(
        (s, i) => (i.created_at < s ? i.created_at : s),
        first.created_at,
      ),
      member_id: first.added_by_member_id,
    });
  }

  for (const arr of activeByCat.values()) {
    arr.sort((a, b) => {
      if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
      return a.earliestCreated.localeCompare(b.earliestCreated);
    });
  }

  const trolleyGroups: RowGroup[] = checkedItems
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((it) => ({
      key: it.id,
      items: [it],
      display_name: it.display_name,
      category: it.category as Category,
      is_priority: it.is_priority,
      is_checked: true,
      totalQty: it.quantity ?? 1,
      count: 1,
      earliestCreated: it.created_at,
      member_id: it.added_by_member_id,
    }));

  const totalActive = Array.from(activeByCat.values()).reduce((s, a) => s + a.length, 0);
  const totalChecked = trolleyGroups.length;
  const totalAll = totalActive + totalChecked;
  const progressPct = totalAll === 0 ? 0 : Math.round((totalChecked / totalAll) * 100);

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
    <div className="mx-auto w-full max-w-md px-4 pt-5 pb-8">
      {/* Progress bar */}
      <div className="mb-4 px-1">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium" style={{ color: "var(--clay-muted)" }}>
          <span>
            {totalChecked} of {totalAll} in the trolley
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--clay-border)" }}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progressPct}%`,
              background: "var(--clay-accent)",
              transition: "width 280ms ease",
            }}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {CATEGORIES.map((c) => {
          const arr = activeByCat.get(c)!;
          if (arr.length === 0) return null;
          return (
            <AisleCard
              key={c}
              title={CATEGORY_LABELS[c]}
              count={arr.length}
              groups={arr}
              memberMap={memberMap}
              onToggle={toggleGroup}
              onEdit={(g) => setEditing(g)}
              onDelete={deleteGroup}
            />
          );
        })}
      </div>

      {totalChecked > 0 && (
        <section
          className="mt-5 overflow-hidden rounded-[14px] bg-white"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <header className="flex items-center justify-between px-3.5 pt-2.5 pb-2">
            <button
              type="button"
              onClick={() => setTrolleyOpen((v) => !v)}
              aria-expanded={trolleyOpen}
              className="flex flex-1 items-center gap-1.5 text-left"
            >
              <ChevronDown
                size={14}
                style={{
                  color: "var(--clay-muted)",
                  transform: trolleyOpen ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 180ms ease",
                }}
              />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--clay-muted)" }}>
                In the trolley · {totalChecked}
              </h2>
            </button>
            <button
              type="button"
              onClick={clearTrolley}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                color: "var(--clay-accent)",
                background: "#FBEFE6",
              }}
            >
              Done — clear
            </button>
          </header>

          {trolleyOpen && (
            <ul>
              {trolleyGroups.map((g, idx) => (
                <SwipeRow
                  key={g.key}
                  group={g}
                  isFirst={idx === 0}
                  member={g.member_id ? memberMap.get(g.member_id) : undefined}
                  onToggle={() => toggleGroup(g)}
                  onEdit={() => setEditing(g)}
                  onDelete={() => deleteGroup(g)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <EditSheet group={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />
      )}
    </div>
  );
}

function AisleCard({
  title,
  count,
  groups,
  memberMap,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  count: number;
  groups: RowGroup[];
  memberMap: Map<string, { name: string; initial: string; color: string }>;
  onToggle: (g: RowGroup) => void;
  onEdit: (g: RowGroup) => void;
  onDelete: (g: RowGroup) => void;
}) {
  return (
    <section
      className="overflow-hidden rounded-[14px] bg-white"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      <header className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--clay-muted)" }}>
          {title}
        </h2>
        <span className="text-[11px] font-medium" style={{ color: "var(--clay-muted)" }}>
          {count}
        </span>
      </header>
      <ul>
        {groups.map((g, idx) => (
          <SwipeRow
            key={g.key}
            group={g}
            isFirst={idx === 0}
            member={g.member_id ? memberMap.get(g.member_id) : undefined}
            onToggle={() => onToggle(g)}
            onEdit={() => onEdit(g)}
            onDelete={() => onDelete(g)}
          />
        ))}
      </ul>
    </section>
  );
}

const SWIPE_REVEAL = 76;
const SWIPE_THRESHOLD = 56;

function SwipeRow({
  group,
  isFirst,
  member,
  onToggle,
  onEdit,
  onDelete,
}: {
  group: RowGroup;
  isFirst: boolean;
  member?: { name: string; initial: string; color: string };
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [bounce, setBounce] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);
  const horizontal = useRef(false);

  const checked = group.is_checked;
  const priority = group.is_priority && !checked;

  const handleStart = (x: number, y: number) => {
    startX.current = x;
    startY.current = y;
    dragging.current = true;
    horizontal.current = false;
  };
  const handleMove = (x: number, y: number) => {
    if (!dragging.current || startX.current == null || startY.current == null) return;
    const dx = x - startX.current;
    const dy = y - startY.current;
    if (!horizontal.current) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        horizontal.current = true;
      } else if (Math.abs(dy) > 8) {
        dragging.current = false;
        return;
      } else {
        return;
      }
    }
    const base = open ? -SWIPE_REVEAL : 0;
    let next = base + dx;
    if (next > 0) next = 0;
    if (next < -SWIPE_REVEAL - 20) next = -SWIPE_REVEAL - 20;
    setOffset(next);
  };
  const handleEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (offset < -SWIPE_THRESHOLD) {
      setOpen(true);
      setOffset(-SWIPE_REVEAL);
    } else {
      setOpen(false);
      setOffset(0);
    }
  };

  const closeSwipe = () => {
    setOpen(false);
    setOffset(0);
  };

  const handleToggleClick = () => {
    if (open) {
      closeSwipe();
      return;
    }
    setBounce(true);
    setTimeout(() => setBounce(false), 280);
    onToggle();
  };

  return (
    <li
      className="relative overflow-hidden"
      style={{ borderTop: isFirst ? "none" : "1px solid var(--clay-border)" }}
    >
      <button
        type="button"
        onClick={() => {
          closeSwipe();
          onDelete();
        }}
        aria-label="Delete item"
        className="absolute inset-y-0 right-0 flex items-center justify-center text-white"
        style={{ width: SWIPE_REVEAL, background: "#C2693F" }}
      >
        <Trash2 size={18} />
      </button>

      <div
        className="relative flex items-center gap-2.5 bg-white px-3.5 py-2"
        style={{
          transform: `translateX(${offset}px) scale(${bounce ? 0.985 : 1})`,
          transition: dragging.current
            ? "none"
            : "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      >
        {priority && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r"
            style={{ background: "var(--clay-accent)" }}
          />
        )}

        <button
          type="button"
          onClick={handleToggleClick}
          aria-label={checked ? "Uncheck" : "Check off"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{
            border: checked ? "1.8px solid var(--clay-accent)" : "1.8px solid #C9BBA8",
            background: checked ? "var(--clay-accent)" : "transparent",
            color: "#fff",
            transition: "background 200ms ease, border-color 200ms ease, transform 200ms ease",
            transform: checked ? "scale(1)" : "scale(1)",
          }}
        >
          {checked && (
            <Check
              size={12}
              strokeWidth={3.5}
              style={{
                animation: "tickDraw 220ms ease-out",
              }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (open) {
              closeSwipe();
              return;
            }
            onEdit();
          }}
          className="flex min-h-[28px] flex-1 items-center gap-1.5 text-left"
        >
          <span
            className="text-[14px] leading-tight"
            style={{
              color: checked ? "var(--clay-muted)" : "var(--clay-ink)",
              opacity: checked ? 0.7 : 1,
            }}
          >
            {group.display_name}
            {group.count > 1 && (
              <span className="ml-1.5 text-[12px]" style={{ color: "var(--clay-muted)" }}>
                ×{group.count}
              </span>
            )}
            {group.count === 1 && group.totalQty > 1 && (
              <span className="ml-1.5 text-[12px]" style={{ color: "var(--clay-muted)" }}>
                ×{group.totalQty}
              </span>
            )}
          </span>
          {priority && (
            <Star size={12} fill="currentColor" style={{ color: "var(--clay-priority)" }} />
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
  group,
  onCancel,
  onSave,
}: {
  group: RowGroup;
  onCancel: () => void;
  onSave: (
    g: RowGroup,
    patch: { display_name: string; category: Category; quantity: number | null; is_priority: boolean },
  ) => void;
}) {
  const [name, setName] = useState(group.display_name);
  const [category, setCategory] = useState<Category>(group.category);
  const [qty, setQty] = useState<string>(group.totalQty > 1 ? String(group.totalQty) : "");
  const [priority, setPriority] = useState(group.is_priority);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsedQty = qty.trim() === "" ? null : Math.max(1, parseInt(qty, 10) || 1);
    onSave(group, {
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
