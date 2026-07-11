import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Check, ShoppingCart, Trash2, X, Star, Flag, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  motion,
  AnimatePresence,
  useAnimation,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { useMember } from "@/lib/member";
import { softSpring, snappySpring, gentleSpring } from "@/lib/motion";
import { ShopCelebration } from "./ShopCelebration";
import { TabSwitcher, type Tab } from "./TabSwitcher";
import { useAdvancedFeatures } from "@/lib/advancedFeatures";
import { applyPriceEstimate } from "@/lib/priceLookup";
import { PriceSheet } from "./PriceSheet";


interface Item {
  id: string;
  display_name: string;
  quantity: number | null;
  is_priority: boolean;
  is_checked: boolean;
  category: string;
  created_at: string;
  added_by_member_id: string | null;
  price_cents: number | null;
  price_source: string | null;
}

const formatCents = (c: number) => `$${(c / 100).toFixed(2)}`;

const MEMBER_COLORS = ["#C2693F", "#6F8F5E", "#D38A2E", "#8E6E8A", "#A86A4B", "#5E8A8F"];

function memberColor(id: string | null | undefined) {
  if (!id) return "#C9BBA8";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

export function ListTab({
  householdId,
  active,
  tab,
  onTabChange,
}: {
  householdId: string | null;
  active: boolean;
  tab: Tab;
  onTabChange: (t: Tab) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [trolleyOpen, setTrolleyOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<Item | null>(null);
  const prevActiveRef = useRef<number | null>(null);
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { members, member } = useMember();
  const { isFeatureOn, supermarket } = useAdvancedFeatures();
  const pricingOn = isFeatureOn("pricing");


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
        "id, display_name, quantity, is_priority, is_checked, category, created_at, added_by_member_id, price_cents, price_source",
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

  const savePrice = async (item: Item, cents: number) => {
    setItems((arr) =>
      arr.map((i) =>
        i.id === item.id ? { ...i, price_cents: cents, price_source: "manual" } : i,
      ),
    );
    await supabase
      .from("shopping_list_items")
      .update({ price_cents: cents, price_source: "manual" })
      .eq("id", item.id);
  };

  // Removing a price marks the row 'suppressed' (not null) so backfill never
  // auto re-estimates it. A later manual save overwrites this and ends it.
  const removePrice = async (item: Item) => {
    setItems((arr) =>
      arr.map((i) =>
        i.id === item.id ? { ...i, price_cents: null, price_source: "suppressed" } : i,
      ),
    );
    await supabase
      .from("shopping_list_items")
      .update({ price_cents: null, price_source: "suppressed", price_label: null })
      .eq("id", item.id);
  };

  // Fire-and-forget estimate for one item; patches local state on success,
  // but never over a manual price (DB guard in applyPriceEstimate + local check).
  const estimateItem = useCallback(
    (id: string, name: string) => {
      void applyPriceEstimate(id, name, supermarket).then((est) => {
        if (!est) return;
        setItems((arr) =>
          arr.map((i) =>
            i.id === id && i.price_source !== "manual"
              ? { ...i, price_cents: est.price_cents, price_source: "estimate" }
              : i,
          ),
        );
      });
    },
    [supermarket],
  );

  // Backfill: on List tab load, estimate up to 5 unticked, priceless items.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (loading || !pricingOn || backfilledRef.current) return;
    const candidates = items
      .filter((i) => !i.is_checked && i.price_cents == null && i.price_source == null)
      .slice(0, 5);
    if (candidates.length === 0) return;
    backfilledRef.current = true;
    for (const c of candidates) estimateItem(c.id, c.display_name);
  }, [loading, pricingOn, items, estimateItem]);

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

  const addItemToCategory = async (category: Category, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || !householdId) return;
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const nowIso = new Date().toISOString();
    const temp: Item = {
      id: tempId,
      display_name: trimmed,
      quantity: null,
      is_priority: false,
      is_checked: false,
      category,
      created_at: nowIso,
      added_by_member_id: member?.id ?? null,
      price_cents: null,
      price_source: null,
    };
    setItems((arr) => [...arr, temp]);

    // Clean up name via AI but IGNORE its category — user picked the aisle.
    let cleanName = trimmed;
    try {
      const { data } = await supabase.functions.invoke("categorize-item", {
        body: { text: trimmed },
      });
      const d = data as { display_name?: string };
      if (typeof d?.display_name === "string" && d.display_name.trim()) {
        cleanName = d.display_name.trim();
      }
    } catch {
      /* keep raw */
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("shopping_list_items")
      .insert({
        user_id: userId,
        household_id: householdId,
        raw_input: trimmed,
        display_name: cleanName,
        category,
        quantity: null,
        is_priority: false,
        is_checked: false,
        added_by_member_id: member?.id ?? null,
      })
      .select(
        "id, display_name, quantity, is_priority, is_checked, category, created_at, added_by_member_id, price_cents, price_source",
      )
      .single();

    if (insertErr || !inserted) {
      setItems((arr) => arr.filter((i) => i.id !== tempId));
      toast.error("Couldn't add item");
      return;
    }
    setItems((arr) =>
      arr.map((i) => (i.id === tempId ? (inserted as Item) : i)),
    );
    if (pricingOn) {
      estimateItem((inserted as Item).id, (inserted as Item).display_name);
    }
  };


  if (!householdId) {
    return (
      <p className="px-5 pt-6 text-[15px]" style={{ color: "var(--clay-muted)" }}>
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

  // Manual pricing totals (advanced only). Line prices — never multiplied by quantity.
  const untickedCents = activeItems.reduce((s, i) => s + (i.price_cents ?? 0), 0);
  const hasUntickedPrice = activeItems.some((i) => i.price_cents != null);
  const tickedCents = checkedItems.reduce((s, i) => s + (i.price_cents ?? 0), 0);
  const hasTickedPrice = checkedItems.some((i) => i.price_cents != null);

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
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4 pb-8">
        <TabSwitcher tab={tab} onChange={onTabChange} />
        <div className="flex flex-1 flex-col items-center justify-center px-4 pt-16 text-center">
          <ShoppingCart size={36} strokeWidth={1.5} style={{ color: "#C9BBA8" }} />
          <p className="mt-4 text-[17px] font-medium" style={{ color: "var(--clay-ink)" }}>
            Your shopping list will appear here
          </p>
          <p className="mt-1 text-[15px]" style={{ color: "var(--clay-muted)" }}>
            Add an item from the Input tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-4 pb-8">
      <div className="mb-3">
        <TabSwitcher tab={tab} onChange={onTabChange} />
      </div>

      <div className="mb-3 px-1">
        <div className="flex items-center justify-between">
          <p
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--clay-muted)" }}
          >
            {activeItems.length} {activeItems.length === 1 ? "item" : "items"} left
          </p>
          <p className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
            {done} of {total} in the trolley
          </p>
        </div>
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
          style={{ background: "var(--clay-border)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: "var(--clay-accent)" }}
            animate={{ width: `${pct}%` }}
            transition={gentleSpring}
          />
        </div>
        {pricingOn && (hasUntickedPrice || hasTickedPrice) && (
          <div className="mt-2 flex items-baseline justify-between gap-2">
            {hasUntickedPrice ? (
              <p className="text-[13px] font-medium" style={{ color: "var(--clay-ink)" }}>
                Estimated total: {formatCents(untickedCents)}
              </p>
            ) : (
              <span />
            )}
            {hasTickedPrice && (
              <p className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
                {formatCents(tickedCents)} in the trolley
              </p>
            )}
          </div>
        )}
        {pricingOn && hasUntickedPrice && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--clay-muted)", opacity: 0.85 }}>
            Prices are estimates based on typical supermarket products.
          </p>
        )}
      </div>

      <motion.div layout className="space-y-2">
        <AnimatePresence initial={false}>
          {CATEGORIES.map((c) => {
            const arr = activeGrouped.get(c)!;
            if (arr.length === 0) return null;
            return (
              <AisleCard
                key={c}
                aisleKey={c}
                label={CATEGORY_LABELS[c]}
                count={arr.length}
                items={arr}
                memberMap={memberMap}
                onToggle={toggleChecked}
                onEdit={setEditing}
                onDelete={deleteItem}
                onAdd={(name) => addItemToCategory(c, name)}
                openSwipeId={openSwipeId}
                setOpenSwipeId={setOpenSwipeId}
                showPrices={pricingOn}
                onPrice={setPricing}
              />
            );
          })}
        </AnimatePresence>
      </motion.div>


      <AnimatePresence initial={false}>
        {trolleyItems.length > 0 && (
          <motion.div
            key="trolley"
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={softSpring}
            className="mt-4"
          >
            <TrolleyCard
              items={trolleyItems}
              memberMap={memberMap}
              open={trolleyOpen}
              onToggleOpen={() => setTrolleyOpen((o) => !o)}
              onUntick={toggleChecked}
              onClear={() => setConfirmClear(true)}
              showPrices={pricingOn}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {editing && <EditSheet item={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />}

      {pricing && pricingOn && (
        <PriceSheet
          name={pricing.display_name}
          initialCents={pricing.price_cents}
          onSave={async (cents) => {
            await savePrice(pricing, cents);
            setPricing(null);
          }}
          onRemove={
            pricing.price_cents != null
              ? async () => {
                  await removePrice(pricing);
                  setPricing(null);
                }
              : undefined
          }
          onClose={() => setPricing(null)}
        />
      )}

      {confirmClear && (
        <ConfirmClearDialog
          count={trolleyItems.length}
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearTrolley}
        />
      )}

      {celebrate && <ShopCelebration onDone={() => setCelebrate(false)} />}
    </div>
  );
}

const COLLAPSE_STORAGE_KEY = "pantry.aisleCollapsed.v1";

function readCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeCollapsed(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function AisleCard({
  aisleKey,
  label,
  count,
  items,
  memberMap,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
  openSwipeId,
  setOpenSwipeId,
  showPrices,
  onPrice,
}: {
  aisleKey: string;
  label: string;
  count: number;
  items: Item[];
  memberMap: Map<string, { name: string; initial: string; color: string }>;
  onToggle: (i: Item) => void;
  onEdit: (i: Item) => void;
  onDelete: (i: Item) => void;
  onAdd: (name: string) => void;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  showPrices: boolean;
  onPrice: (i: Item) => void;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => !!readCollapsed()[aisleKey]);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      const state = readCollapsed();
      if (next) state[aisleKey] = true;
      else delete state[aisleKey];
      writeCollapsed(state);
      return next;
    });
    if (openSwipeId) setOpenSwipeId(null);
  };

  const openAdd = () => {
    if (collapsed) {
      setCollapsed(false);
      const state = readCollapsed();
      delete state[aisleKey];
      writeCollapsed(state);
    }
    setAddOpen(true);
    if (openSwipeId) setOpenSwipeId(null);
    // focus after render
    window.setTimeout(() => addInputRef.current?.focus(), 40);
  };

  const submitAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = addText.trim();
    if (!name) {
      setAddOpen(false);
      return;
    }
    onAdd(name);
    setAddText("");
    // keep open for another add; focus stays
    addInputRef.current?.focus();
  };

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={softSpring}
      className="overflow-hidden rounded-[14px] bg-white"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      <div className="flex items-center px-3.5 pt-2 pb-1.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls={`aisle-${aisleKey}`}
          className="flex flex-1 items-center justify-between text-left"
        >
          <h2
            className="text-[12px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            {label}
          </h2>
          <span className="mr-1 flex items-center gap-1.5">
            <span className="text-[12px] font-medium" style={{ color: "var(--clay-muted)" }}>
              {count}
            </span>
            <motion.span
              animate={{ rotate: collapsed ? -90 : 0 }}
              transition={gentleSpring}
              className="flex items-center justify-center"
              style={{ color: "var(--clay-muted)" }}
              aria-hidden
            >
              <ChevronDown size={14} strokeWidth={2.25} />
            </motion.span>
          </span>
        </button>
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAdd();
          }}
          whileTap={{ scale: 0.88 }}
          transition={snappySpring}
          aria-label={`Add to ${label}`}
          className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "var(--clay-accent-soft)",
            color: "var(--clay-accent)",
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {addOpen && (
          <motion.form
            key="add-form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={softSpring}
            onSubmit={submitAdd}
            style={{ overflow: "hidden", borderTop: "1px solid var(--clay-border)" }}
          >
            <div className="flex items-center gap-2 px-3.5 py-2.5">
              <input
                ref={addInputRef}
                type="text"
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAddOpen(false);
                    setAddText("");
                  }
                }}
                placeholder={`Add to ${label.toLowerCase()}…`}
                className="flex-1 rounded-full bg-white px-3 py-2 text-[15px] outline-none"
                style={{
                  border: "1px solid var(--clay-border)",
                  color: "var(--clay-ink)",
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button
                type="submit"
                aria-label="Add"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: "var(--clay-accent)" }}
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setAddText("");
                }}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ color: "var(--clay-muted)" }}
              >
                <X size={16} />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            id={`aisle-${aisleKey}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={softSpring}
            style={{ overflow: "hidden" }}
          >
            <ul>
              <AnimatePresence initial={false}>
                {items.map((it, idx) => (
                  <SwipeRow
                    key={it.id}
                    item={it}
                    isFirst={idx === 0}
                    member={it.added_by_member_id ? memberMap.get(it.added_by_member_id) : undefined}
                    isOpen={openSwipeId === it.id}
                    onRequestOpen={() => setOpenSwipeId(it.id)}
                    onRequestClose={() => {
                      if (openSwipeId === it.id) setOpenSwipeId(null);
                    }}
                    onToggle={() => onToggle(it)}
                    onEdit={() => onEdit(it)}
                    onDelete={() => onDelete(it)}
                    showPrice={showPrices}
                    onPrice={() => onPrice(it)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

const SWIPE_MAX = 84;

function SwipeRow({
  item,
  isFirst,
  member,
  isOpen,
  onRequestOpen,
  onRequestClose,
  onToggle,
  onEdit,
  onDelete,
  showPrice,
  onPrice,
}: {
  item: Item;
  isFirst: boolean;
  member?: { name: string; initial: string; color: string };
  isOpen: boolean;
  onRequestOpen: () => void;
  onRequestClose: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  showPrice: boolean;
  onPrice: () => void;
}) {
  const checked = item.is_checked;
  const priority = item.is_priority && !checked;

  const x = useMotionValue(0);
  const controls = useAnimation();
  const spring = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.8 };

  // Sync external open/close state (e.g. another row opened).
  useEffect(() => {
    controls.start({ x: isOpen ? -SWIPE_MAX : 0, transition: spring });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    // Flick left OR dragged past threshold → open. Flick right → close.
    const shouldOpen =
      offset < -SWIPE_MAX / 2 || velocity < -500 ? true : velocity > 500 ? false : false;
    if (shouldOpen) {
      onRequestOpen();
      controls.start({ x: -SWIPE_MAX, transition: spring });
    } else {
      onRequestClose();
      controls.start({ x: 0, transition: spring });
    }
  };

  const handleNameClick = () => {
    if (isOpen) {
      onRequestClose();
      return;
    }
    onEdit();
  };

  const handleDelete = () => {
    onRequestClose();
    onDelete();
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0, y: -18, scale: 0.97 }}
      animate={{ opacity: 1, height: "auto", y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={softSpring}
      className="relative overflow-hidden"
      style={{ borderTop: isFirst ? "none" : "1px solid var(--clay-border)" }}
    >
      {/* Swipe delete underlay */}
      <div
        aria-hidden={!isOpen}
        className="absolute inset-y-0 right-0 flex items-center justify-end"
        style={{ width: SWIPE_MAX, background: "#C2693F" }}
      >
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-full w-full items-center justify-center text-white"
          aria-label="Delete item"
          tabIndex={isOpen ? 0 : -1}
        >
          <Trash2 size={16} />
          <span className="ml-1.5 text-[13px] font-medium">Delete</span>
        </button>
      </div>

      <motion.div
        className="relative flex items-center gap-2.5 bg-white px-3.5 py-2.5 touch-pan-y"
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -SWIPE_MAX, right: 0 }}
        dragElastic={{ left: 0.15, right: 0 }}
        dragMomentum={false}
        animate={controls}
        onDragEnd={handleDragEnd}
      >
        {priority && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-[3px]"
            style={{ background: "var(--clay-accent)" }}
          />
        )}

        <motion.button
          type="button"
          onClick={onToggle}
          aria-label={checked ? "Uncheck" : "Check off"}
          whileTap={{ scale: 0.85 }}
          animate={{ scale: checked ? 1.18 : 1 }}
          transition={snappySpring}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{
            border: checked ? "1.8px solid var(--clay-accent)" : "1.8px solid #C9BBA8",
            background: checked ? "var(--clay-accent)" : "transparent",
            color: "#fff",
            transition: "background 180ms ease, border-color 180ms ease",
          }}
        >
          <AnimatePresence initial={false}>
            {checked && (
              <motion.span
                key="check"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={snappySpring}
                className="flex items-center justify-center"
              >
                <Check size={12} strokeWidth={3.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <button
          type="button"
          onClick={handleNameClick}
          className="flex min-h-[32px] flex-1 items-center gap-1.5 text-left"
        >
          <span
            className="text-[15px] leading-tight"
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

        {showPrice &&
          (item.price_cents != null ? (
            <button
              type="button"
              onClick={onPrice}
              aria-label={`Edit price for ${item.display_name}`}
              className="shrink-0 px-0.5 text-[12px] tabular-nums"
              style={{ color: "var(--clay-muted)", opacity: checked ? 0.7 : 1 }}
            >
              {item.price_source === "estimate" ? "~" : ""}
              {formatCents(item.price_cents)}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPrice}
              aria-label={`Add price for ${item.display_name}`}
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] leading-none"
              style={{ border: "1px solid var(--clay-border)", color: "#C9BBA8" }}
            >
              $
            </button>
          ))}

        {member && (
          <span
            title={`Added by ${member.name}`}
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: member.color, opacity: checked ? 0.5 : 1 }}
          >
            {member.initial}
          </span>
        )}
      </motion.div>
    </motion.li>
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
          <h3 className="text-[17px] font-semibold" style={{ color: "var(--clay-ink)" }}>
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
          className="mt-4 mb-2 text-[12px] font-semibold uppercase tracking-wider"
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
              className="min-h-[40px] rounded-full px-3 text-[15px] font-medium transition"
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
            className="flex-1 rounded-lg py-3 text-[16px] font-medium"
            style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-lg py-3 text-[16px] font-semibold text-white"
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
  showPrices,
}: {
  items: Item[];
  memberMap: Map<string, { name: string; initial: string; color: string }>;
  open: boolean;
  onToggleOpen: () => void;
  onUntick: (i: Item) => void;
  onClear: () => void;
  showPrices: boolean;
}) {
  return (
    <motion.section
      layout
      className="overflow-hidden rounded-[14px] bg-white"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      <motion.button
        type="button"
        onClick={onToggleOpen}
        whileTap={{ scale: 0.96 }}
        transition={snappySpring}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ShoppingCart size={13} style={{ color: "var(--clay-muted)" }} />
          <span
            className="text-[12px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            In the trolley
          </span>
          <span className="text-[12px] font-medium" style={{ color: "var(--clay-muted)" }}>
            · {items.length}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={softSpring}
          style={{ display: "inline-flex", color: "var(--clay-muted)" }}
        >
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="trolley-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={softSpring}
            style={{ overflow: "hidden" }}
          >
            <ul style={{ borderTop: "1px solid var(--clay-border)" }}>
              <AnimatePresence initial={false}>
                {items.map((it) => {
                  const member = it.added_by_member_id
                    ? memberMap.get(it.added_by_member_id)
                    : undefined;
                  return (
                    <motion.li
                      key={it.id}
                      layout
                      initial={{ opacity: 0, height: 0, y: -12 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={softSpring}
                      style={{ borderTop: "1px solid var(--clay-border)", overflow: "hidden" }}
                      className="first:border-t-0"
                    >
                      <div className="flex items-center gap-2.5 bg-white px-3.5 py-2.5">
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
                          className="flex min-h-[32px] flex-1 items-center gap-1.5 text-left"
                        >
                          <span
                            className="text-[15px] leading-tight"
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
                        {showPrices && it.price_cents != null && (
                          <span
                            className="shrink-0 text-[12px] tabular-nums"
                            style={{ color: "var(--clay-muted)", opacity: 0.75 }}
                          >
                            {it.price_source === "estimate" ? "~" : ""}
                            {formatCents(it.price_cents)}
                          </span>
                        )}
                        {member && (
                          <span
                            title={`Added by ${member.name}`}
                            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ background: member.color, opacity: 0.5 }}
                          >
                            {member.initial}
                          </span>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
            <div
              className="px-3.5 py-2"
              style={{ borderTop: "1px solid var(--clay-border)" }}
            >
              <motion.button
                type="button"
                onClick={onClear}
                whileTap={{ scale: 0.94 }}
                transition={snappySpring}
                className="w-full rounded-lg py-2.5 text-[14px] font-semibold text-white"
                style={{ background: "var(--clay-accent)" }}
              >
                Done — clear trolley
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
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
        <h3 className="text-[17px] font-semibold" style={{ color: "var(--clay-ink)" }}>
          Clear the trolley?
        </h3>
        <p className="mt-1 text-[15px]" style={{ color: "var(--clay-muted)" }}>
          This removes {count} bought {count === 1 ? "item" : "items"} from the list. Unticked
          items stay for next time.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg py-3 text-[16px] font-medium"
            style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg py-3 text-[16px] font-semibold text-white"
            style={{ background: "var(--clay-accent)" }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
