import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Flag, Plus, Loader2, List, Check, Mic, Undo2 } from "lucide-react";

import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { BatchConfirmSheet, type BatchRow } from "./BatchConfirmSheet";
import { BulkAddSheet } from "./BulkAddSheet";
import { FeedbackModal } from "./FeedbackModal";
import { JoinFamilyModal } from "./JoinFamilyModal";
import { InviteModal } from "./InviteModal";
import { notifyHousehold } from "@/lib/push";
import { useMember } from "@/lib/member";
import { bumpRegular, topRegulars, normalizeName } from "@/lib/regulars";
import { normaliseItemName } from "@/lib/itemNormalise";
import { useDuplicateNotice } from "./DuplicateNotice";
import { useCenterNotice } from "./CenterNotice";
import { safeWrite } from "@/lib/safeWrite";
import { TabSwitcher, type Tab } from "./TabSwitcher";
import { useAdvancedFeatures } from "@/lib/advancedFeatures";
import { applyPriceEstimate } from "@/lib/priceLookup";

import { softSpring, snappySpring } from "@/lib/motion";


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

export function InputTab({ householdId, tab, onTabChange }: { householdId: string | null; tab: Tab; onTabChange: (t: Tab) => void }) {
  const { session } = useAuth();
  const { member } = useMember();
  const userId = session?.user?.id;
  const memberName = member?.name ?? "Someone";
  const { isFeatureOn, supermarket } = useAdvancedFeatures();
  const pricingOn = isFeatureOn("pricing");
  const { showDuplicate, duplicateNotice } = useDuplicateNotice();
  const { showNotice, centerNotice } = useCenterNotice();
  const [text, setText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [priority, setPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [batchItems, setBatchItems] = useState<string[] | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showNewUserCard, setShowNewUserCard] = useState(false);

  // Show the new-user family card only during the member's first 48 hours
  // (first-seen timestamp recorded per-member in localStorage).
  useEffect(() => {
    const mid = member?.id;
    if (!mid || typeof window === "undefined") {
      setShowNewUserCard(false);
      return;
    }
    const key = `op_first_seen_${mid}`;
    let ts = Number(window.localStorage.getItem(key));
    if (!ts) {
      ts = Date.now();
      window.localStorage.setItem(key, String(ts));
    }
    setShowNewUserCard(Date.now() < ts + 48 * 60 * 60 * 1000);
  }, [member?.id]);
  
  const [regularsTick, setRegularsTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const justAddedRef = useRef<HTMLElement>(null);

  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceHeard, setVoiceHeard] = useState<string | null>(null);
  const recRef = useRef<any>(null);

  const expiryTimersRef = useRef<Map<string, number>>(new Map());

  const scheduleRecentExpiry = useCallback((id: string) => {
    const existing = expiryTimersRef.current.get(id);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      setRecent((r) => r.filter((it) => it.id !== id));
      expiryTimersRef.current.delete(id);
    }, 60_000);
    expiryTimersRef.current.set(id, timer);
  }, []);

  const registerUndo = useCallback(
    (id: string, _name: string) => {
      scheduleRecentExpiry(id);
    },
    [scheduleRecentExpiry],
  );

  useEffect(() => {
    return () => {
      for (const t of expiryTimersRef.current.values()) window.clearTimeout(t);
      expiryTimersRef.current.clear();
    };
  }, []);

  const undoAdd = async (id: string, name: string) => {
    const timer = expiryTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      expiryTimersRef.current.delete(id);
    }
    setRecent((r) => r.filter((it) => it.id !== id));
    try {
      await supabase.from("shopping_list_items").delete().eq("id", id);
      toast.success(`Removed ${name}`, { id: "undo-feedback", duration: 1800 });
    } catch {
      // fail gracefully — row already removed
    }
  };




  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const regulars = useMemo(
    () => topRegulars(8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regularsTick],
  );

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 1 || q.includes(",")) return [];
    const pool = Array.from(new Set(regulars.map((r) => r.name)));
    return pool
      .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      .slice(0, 5);
  }, [text, regulars]);

  const categorize = async (
    raw: string,
  ): Promise<{ display_name: string; category: Category }> => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "categorize-item",
        { body: { text: raw } },
      );
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

  // Current UNTICKED item names for the household (duplicate gate). Ticked
  // (in-trolley) items never block — re-adding those is a fresh need.
  // { ok:false } means the fetch failed (offline/error) — the caller must NOT
  // insert blind; it fails honestly with the add notice instead.
  const fetchUntickedNames = async (): Promise<{ ok: boolean; names: string[] }> => {
    if (!householdId) return { ok: true, names: [] };
    const res = await safeWrite(() =>
      supabase
        .from("shopping_list_items")
        .select("display_name")
        .eq("household_id", householdId)
        .eq("is_checked", false),
    );
    if (!res.ok) return { ok: false, names: [] };
    return {
      ok: true,
      names: ((res.data ?? []) as { display_name: string }[]).map((r) => r.display_name),
    };
  };

  const insertSingle = async (
    raw: string,
    qty: number | null,
    isPriority: boolean,
  ) => {
    // Duplicate gate: block BEFORE anything fires (no temp row, no
    // categorisation, no insert, no price lookup, no undo chip).
    const norm = normaliseItemName(raw);
    const check = await fetchUntickedNames();
    if (!check.ok) {
      // Duplicate check couldn't be verified — never insert blind.
      showNotice(`No connection. ${raw} was not added.`);
      return;
    }
    const dupe = check.names.find((n) => normaliseItemName(n) === norm);
    if (dupe) {
      showDuplicate(dupe);
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`;
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
      ].slice(0, 6),
    );

    const { display_name, category } = await categorize(raw);
    const ins = await safeWrite(() =>
      supabase
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
        .single(),
    );

    if (!ins.ok || !ins.data) {
      setRecent((r) => r.filter((it) => it.id !== tempId));
      showNotice(`No connection. ${display_name} was not added.`);
      return;
    }
    const data = ins.data;
    setRecent((r) =>
      r.map((it) =>
        it.id === tempId
          ? { ...(data as RecentItem), categorizing: false }
          : it,
      ),
    );
    bumpRegular(display_name);
    setRegularsTick((t) => t + 1);
    registerUndo((data as RecentItem).id, display_name);

    // Fire-and-forget price estimate (advanced pricing only; never blocks adds).
    if (pricingOn) {
      void applyPriceEstimate((data as RecentItem).id, display_name, supermarket);
    }

    if (householdId) {
      void notifyHousehold({
        householdId,
        memberId: member?.id ?? null,
        title: "Our Pantry",
        body: `${memberName} added ${display_name}`,
      });
    }
  };

  const quickAdd = async (name: string) => {
    if (!householdId || !userId) return;
    void insertSingle(name, null, false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !householdId || !userId || submitting) return;
    setError(null);

    const parts = parseCommaList(trimmed);
    const isMulti = parts.length > 1;

    if (isMulti) {
      if (parts.length > MAX_INLINE_BATCH) {
        setError(
          `That's ${parts.length} items. Remove some, or use Bulk add for longer lists.`,
        );
        return;
      }
      setBatchItems(parts);
      return;
    }

    setSubmitting(true);
    const qty = quantity.trim() === "" ? null : Number(quantity);
    const isPriority = priority;

    setText("");
    setQuantity("");
    setPriority(false);
    inputRef.current?.focus();
    setSubmitting(false);

    notifyAdded(trimmed);
    await insertSingle(trimmed, qty, isPriority);
  };

  const pickSuggestion = (name: string) => {
    setText("");
    setQuantity("");
    setPriority(false);
    inputRef.current?.focus();
    void insertSingle(name, null, false);
  };

  const toggleRecentPriority = async (id: string, next: boolean) => {
    if (id.startsWith("temp-")) return;
    setRecent((r) =>
      r.map((it) => (it.id === id ? { ...it, is_priority: next } : it)),
    );
    await supabase
      .from("shopping_list_items")
      .update({ is_priority: next })
      .eq("id", id);
  };

  const confirmBatch = async (rows: BatchRow[]) => {
    if (!householdId || !userId || rows.length === 0) {
      setBatchItems(null);
      return;
    }

    // Duplicate gate: dedupe WITHIN the batch first (keep first occurrence),
    // then drop entries already on the active (unticked) list.
    const seen = new Set<string>();
    const batchUnique = rows.filter((r) => {
      const key = normaliseItemName(r.display_name.trim() || r.raw);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const check = await fetchUntickedNames();
    if (!check.ok) {
      // Duplicate check couldn't be verified — never insert blind. Keep the
      // sheet open so the pasted text isn't lost.
      showNotice("No connection. Nothing was added.");
      return;
    }
    const existingSet = new Set(check.names.map((n) => normaliseItemName(n)));
    const survivors = batchUnique.filter(
      (r) => !existingSet.has(normaliseItemName(r.display_name.trim() || r.raw)),
    );
    const skipped = batchUnique.filter(
      (r) => existingSet.has(normaliseItemName(r.display_name.trim() || r.raw)),
    );
    if (skipped.length > 0) {
      const names = skipped.map((r) => r.display_name.trim() || r.raw).join(", ");
      if (survivors.length === 0) {
        toast(`Nothing added — already on your list: ${names}`, { duration: 3500 });
      } else {
        toast(`Skipped (already on your list): ${names}`, { duration: 3500 });
      }
    }
    if (survivors.length === 0) {
      setBatchItems(null);
      setBulkOpen(false);
      return;
    }

    const payload = survivors.map((r) => {
      const qtyNum =
        r.quantity.trim() === ""
          ? null
          : Math.max(1, parseInt(r.quantity, 10) || 1);
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

    const ins = await safeWrite(() =>
      supabase
        .from("shopping_list_items")
        .insert(payload)
        .select("id, display_name, quantity, is_priority, category"),
    );

    if (!ins.ok) {
      // Insert nothing; keep the sheet open so the text isn't lost.
      showNotice("No connection. Nothing was added.");
      return;
    }

    const added = ((ins.data as RecentItem[] | null) ?? []).map((d) => ({
      ...(d as RecentItem),
      categorizing: false,
    }));
    for (const row of added) bumpRegular(row.display_name);
    setRegularsTick((t) => t + 1);
    for (const row of added) registerUndo(row.id, row.display_name);

    if (pricingOn) {
      for (const row of added) {
        void applyPriceEstimate(row.id, row.display_name, supermarket);
      }
    }


    setRecent((r) => [...added.reverse(), ...r].slice(0, 6));
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
    setText("");
    setQuantity("");
    setPriority(false);
  };

  const notifyAdded = (name: string) => {
    toast.success(`${name} added`, { id: "add-feedback", duration: 2000 });
  };

  const parseSpokenList = (raw: string): string[] => {
    const knownMulti = new Set<string>();
    // Normalise "and" and semicolons to commas.
    const normalised = raw
      .replace(/\b(and|und|&)\b/gi, ",")
      .replace(/[;]/g, ",");
    const segments = normalised
      .split(",")
      .map((s) => s.trim().replace(/[.!?]+$/g, "").trim())
      .filter(Boolean);

    const out: string[] = [];
    for (const seg of segments) {
      const words = seg.split(/\s+/).filter(Boolean);
      if (words.length <= 2) {
        out.push(seg);
        continue;
      }
      // Greedy match of known multi-word items, else split per word.
      let i = 0;
      while (i < words.length) {
        let matched = false;
        for (let len = Math.min(3, words.length - i); len >= 2; len--) {
          const candidate = words.slice(i, i + len).join(" ").toLowerCase();
          if (knownMulti.has(candidate)) {
            out.push(words.slice(i, i + len).join(" "));
            i += len;
            matched = true;
            break;
          }
        }
        if (!matched) {
          out.push(words[i]);
          i += 1;
        }
      }
    }
    return out.filter(Boolean);
  };

  const buzz = (pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      /* no-op */
    }
  };

  const voiceHeardTimer = useRef<number | null>(null);
  const showHeard = (text: string) => {
    setVoiceHeard(text);
    if (voiceHeardTimer.current) window.clearTimeout(voiceHeardTimer.current);
    voiceHeardTimer.current = window.setTimeout(() => setVoiceHeard(null), 4000);
  };

  const handleVoiceTranscript = async (transcript: string) => {
    const items = parseSpokenList(transcript);
    if (items.length === 0) {
      setVoiceState('idle');
      setVoiceMessage("Didn't catch that, try again");
      return;
    }
    showHeard(transcript);
    setVoiceMessage(null);
    setVoiceState('idle');

    const qty = quantity.trim() === "" ? null : Number(quantity);
    const isPriority = priority;
    setQuantity("");
    setPriority(false);

    // Haptic buzz — brief for single, double-pulse for many.
    buzz(items.length === 1 ? 30 : [25, 60, 25]);

    if (items.length === 1) {
      notifyAdded(items[0]);
    } else {
      toast.success(`Added ${items.length} items`, { id: "add-feedback", duration: 2400 });
    }

    // Stagger inserts so items visibly cascade into "Just added".
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const isSingle = items.length === 1;
      window.setTimeout(() => {
        void insertSingle(it, isSingle ? qty : null, isSingle ? isPriority : false);
      }, i * 140);
    }

    // Bring the "Just added" area into view a beat after the first item lands.
    window.setTimeout(() => {
      justAddedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 180);
  };


  const startVoice = () => {
    // Toggle off if already listening.
    if (voiceState === 'listening' && recRef.current) {
      try { recRef.current.stop(); } catch {}
      return;
    }
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setVoiceMessage("Voice input isn't supported on this device.");
      return;
    }
    const rec = new SpeechRecognitionAPI();
    rec.lang = 'en-GB';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    setVoiceMessage(null);
    setVoiceHeard(null);

    let finalText = '';
    let errored = false;

    rec.onstart = () => setVoiceState('listening');
    rec.onresult = (e: any) => {
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript + ' ';
        }
      }
    };
    rec.onerror = (e: any) => {
      errored = true;
      recRef.current = null;
      const code = e?.error ?? '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setVoiceMessage("Microphone access is off — enable it in your settings.");
      } else if (code === 'no-speech') {
        setVoiceMessage("Didn't catch that, try again.");
      } else if (code === 'aborted') {
        // silent
      } else {
        setVoiceMessage("Couldn't hear you — try again.");
      }
      setVoiceState('idle');
    };
    rec.onend = () => {
      recRef.current = null;
      if (errored) return;
      const trimmed = finalText.trim();
      if (!trimmed) {
        setVoiceState('idle');
        setVoiceMessage("Didn't catch that, try again.");
        return;
      }
      setVoiceState('processing');
      void handleVoiceTranscript(trimmed);
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setVoiceMessage("Couldn't start listening — try again.");
      setVoiceState('idle');
    }
  };


  const chipAdd = (name: string) => {
    notifyAdded(name);
    quickAdd(name);
  };


  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10">
      {/* ---------- HERO BLOCK ---------- */}
      <div className="flex flex-1 flex-col items-center justify-start pt-6">
        <h1
          className="font-display mb-5 text-center text-[30px] leading-tight"
          style={{ color: "var(--clay-ink)" }}
        >
          What do you need?
        </h1>

        {/* ---------- HERO INPUT ---------- */}
        <form onSubmit={submit} className="w-full space-y-2.5">
        <div className="relative">
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
              className="flex-1 bg-transparent py-2.5 text-[16px] outline-none placeholder:opacity-60"
              style={{ color: "var(--clay-ink)" }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <motion.button
              type="submit"
              disabled={!text.trim() || !householdId || submitting}
              whileTap={{ scale: 0.86 }}
              transition={snappySpring}
              aria-label="Add item"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition"
              style={{ background: "#C2693F" }}
            >
              <Plus size={22} strokeWidth={2.5} />
            </motion.button>
          </div>

          {suggestions.length > 0 && (
            <div
              className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[12px] bg-white shadow-sm"
              style={{ border: "1px solid var(--clay-border)" }}
            >
              <ul>
                {suggestions.map((s) => (
                  <li
                    key={s}
                    className="border-t first:border-t-0"
                    style={{ borderColor: "var(--clay-border)" }}
                  >
                    <SuggestionRow
                      label={s}
                      onAdd={() => {
                        notifyAdded(s);
                        pickSuggestion(s);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pl-1">
          <motion.button
            type="button"
            onClick={() => setBulkOpen(true)}
            whileTap={{ scale: 0.92 }}
            transition={snappySpring}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium transition"
            style={{
              border: "1px solid var(--clay-border)",
              color: "var(--clay-muted)",
            }}
          >
            <List size={13} />
            Bulk add
          </motion.button>
        </div>
      </form>

      {/* ---------- VOICE INPUT ---------- */}
      <div className="mt-3 w-full">
        <motion.button
          type="button"
          onClick={startVoice}
          disabled={!householdId || voiceState === 'processing'}
          whileTap={{ scale: 0.97 }}
          transition={snappySpring}
          aria-label={voiceState === 'listening' ? 'Stop listening' : 'Add by voice'}
          aria-pressed={voiceState === 'listening'}
          className="relative flex w-full items-center justify-center gap-2.5 rounded-[14px] px-4 py-3.5 text-[15px] font-medium transition disabled:opacity-60"
          style={{
            background:
              voiceState === 'listening' ? '#C2693F' : 'var(--clay-accent-soft)',
            color: voiceState === 'listening' ? '#FFFFFF' : '#C2693F',
            border:
              voiceState === 'listening'
                ? '1px solid #C2693F'
                : '1px solid var(--clay-border)',
          }}
        >
          {voiceState === 'listening' && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-[14px]"
              style={{ background: '#C2693F' }}
              animate={{ opacity: [0.35, 0.15, 0.35] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <span className="relative flex items-center gap-2.5">
            <Mic size={18} strokeWidth={2.25} />
            {voiceState === 'listening'
              ? 'Listening… tap to stop'
              : voiceState === 'processing'
                ? 'Adding…'
                : 'Say your list'}
          </span>
        </motion.button>
        <AnimatePresence>
          {voiceHeard && voiceState === 'idle' && (
            <motion.div
              key={voiceHeard}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={snappySpring}
              className="mt-2.5 flex items-start gap-2 rounded-[12px] px-3.5 py-2.5"
              style={{
                background: 'var(--clay-accent-soft)',
                border: '1px solid #E8CBB4',
              }}
            >
              <Mic size={14} className="mt-0.5 shrink-0" style={{ color: '#C2693F' }} />
              <p className="text-[14px] leading-snug" style={{ color: 'var(--clay-ink)' }}>
                <span className="font-semibold" style={{ color: '#C2693F' }}>Heard: </span>
                {voiceHeard}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {voiceMessage && (
          <p className="mt-2 px-1 text-[13px]" style={{ color: '#B4441F' }}>
            {voiceMessage}
          </p>
        )}
      </div>



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





      {/* ---------- INPUT / LIST SWITCH ---------- */}
      <section className="mt-6 w-full">
        <TabSwitcher tab={tab} onChange={onTabChange} />
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="text-[13px] underline"
            style={{ color: "#9A8E7F", textUnderlineOffset: "3px" }}
          >
            Got an idea? Suggest a feature
          </button>
        </div>

        {showNewUserCard && (
          <div
            className="mt-3 rounded-[14px] p-3.5"
            style={{
              background: "var(--clay-accent-soft)",
              border: "1px solid var(--clay-border)",
            }}
          >
            <p className="text-[14px]" style={{ color: "var(--clay-ink)" }}>
              Sharing a pantry with family?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setJoinOpen(true)}
                className="clay-btn-secondary flex-1"
              >
                Join a family
              </button>
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="clay-btn-secondary flex-1"
              >
                Invite someone
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---------- JUST ADDED ---------- */}
      {recent.length > 0 && (
        <section ref={justAddedRef} className="mt-4 w-full scroll-mt-4">
          <p
            className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            Just added
          </p>
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {recent.slice(0, 4).map((it, idx) => (
                <motion.li
                  key={it.id}
                  layout
                  initial={{ opacity: 0, height: 0, y: -20, scale: 0.97 }}
                  animate={{ opacity: 1, height: "auto", y: 0, scale: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ ...softSpring, delay: idx * 0.05 }}
                  className="overflow-hidden rounded-[16px] bg-white"
                  style={{ border: "1px solid var(--clay-border)" }}
                >
                  {/* TOP — info */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className="truncate text-[15px]"
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
                    <div className="shrink-0">
                      {it.categorizing || !it.category ? (
                        <span
                          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wider"
                          style={{
                            background: "var(--clay-border)",
                            color: "var(--clay-muted)",
                          }}
                        >
                          <Loader2 size={10} className="animate-spin" />
                          sorting
                        </span>
                      ) : (
                        <motion.span
                          key={it.category}
                          initial={{ scale: 0.7, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={snappySpring}
                          className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                          style={{
                            background: "var(--clay-accent-soft)",
                            color: "var(--clay-accent)",
                          }}
                        >
                          {CATEGORY_LABELS[it.category] ?? it.category}
                        </motion.span>
                      )}
                    </div>
                  </div>

                  {/* divider */}
                  <div style={{ borderTop: "1px solid var(--clay-border)" }} />

                  {/* BOTTOM — actions */}
                  <div className="flex">
                    <motion.button
                      type="button"
                      onClick={() =>
                        toggleRecentPriority(it.id, !it.is_priority)
                      }
                      whileTap={{ scale: 0.97 }}
                      transition={snappySpring}
                      aria-label="Toggle priority"
                      className="flex flex-1 items-center justify-center gap-1.5 py-3.5 text-[13px] font-medium transition"
                      style={{
                        color: it.is_priority
                          ? "var(--clay-accent)"
                          : "var(--clay-muted)",
                        background: it.is_priority
                          ? "var(--clay-accent-soft)"
                          : "transparent",
                      }}
                    >
                      <Flag
                        size={14}
                        fill={it.is_priority ? "currentColor" : "none"}
                      />
                      Priority
                    </motion.button>

                    <div
                      style={{
                        width: "1px",
                        background: "var(--clay-border)",
                      }}
                    />

                    <motion.button
                      type="button"
                      onClick={() => undoAdd(it.id, it.display_name)}
                      whileTap={{ scale: 0.97 }}
                      transition={snappySpring}
                      aria-label={`Undo ${it.display_name}`}
                      className="flex flex-1 items-center justify-center gap-1.5 py-3.5 text-[13px] font-medium transition"
                      style={{ color: "var(--clay-accent)" }}
                    >
                      <Undo2 size={14} />
                      Undo
                    </motion.button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}


      </div>


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

      {feedbackOpen && (
        <FeedbackModal householdId={householdId} onClose={() => setFeedbackOpen(false)} />
      )}

      {joinOpen && <JoinFamilyModal onClose={() => setJoinOpen(false)} />}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}

      {duplicateNotice}
      {centerNotice}

    </div>
  );
}


function AddChip({

  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  const [added, setAdded] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handle = () => {
    onAdd();
    setAdded(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAdded(false), 1000);
  };

  return (
    <motion.button
      type="button"
      onClick={handle}
      whileTap={{ scale: 0.9 }}
      transition={snappySpring}
      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[14px] transition-colors duration-200"
      style={{
        border: `1px solid ${added ? "var(--clay-accent)" : "var(--clay-border)"}`,
        background: added ? "var(--clay-accent)" : "#FFFFFF",
        color: added ? "#FFFFFF" : "var(--clay-ink)",
      }}
    >
      {added && <Check size={12} strokeWidth={3} />}
      {label}
    </motion.button>
  );
}

function SuggestionRow({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  const [added, setAdded] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handle = () => {
    onAdd();
    setAdded(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAdded(false), 1000);
  };

  return (
    <motion.button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handle}
      whileTap={{ scale: 0.96 }}
      transition={snappySpring}
      className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[16px] transition-colors duration-200"
      style={{
        background: added ? "var(--clay-accent)" : "transparent",
        color: added ? "#FFFFFF" : "var(--clay-ink)",
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {added && <Check size={14} strokeWidth={3} />}
        <span className="truncate">{label}</span>
      </span>
      {!added && <Plus size={14} style={{ color: "var(--clay-accent)" }} />}
    </motion.button>
  );
}


// Silence unused import in case tree-shaking complains
void normalizeName;
