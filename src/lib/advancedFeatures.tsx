// Central gate for "advanced features" — a two-layer model:
//
//   1. HOUSEHOLD UNLOCK (shared, password-gated): shopping_households.advanced_unlocked.
//      Turning it on requires ADVANCED_PASSWORD. Once true, advanced features are
//      AVAILABLE to everyone in the household.
//   2. PER-MEMBER VISIBILITY (per-device, free): each member independently chooses
//      whether to SHOW advanced features in their own view. Stored in localStorage
//      under "op_show_advanced_<memberId>". No password needed.
//
// Every advanced feature should gate on useAdvancedFeatures().showAdvanced, which is
//   (household.advanced_unlocked === true) AND (this member's local pref === true).
//
// This is a context provider so the Settings sheet (which unlocks / toggles) and the
// rest of the app (which reads showAdvanced) stay in sync without refetching.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useMember } from "./member";
import { ADVANCED_PASSWORD } from "./advancedConfig";

const showKey = (memberId: string) => `op_show_advanced_${memberId}`;

function readLocalShow(memberId: string | null | undefined): boolean {
  if (!memberId || typeof window === "undefined") return false;
  return window.localStorage.getItem(showKey(memberId)) === "true";
}

interface AdvancedFeaturesValue {
  loading: boolean;
  /** Household-level: are advanced features available to this family at all? */
  householdUnlocked: boolean;
  /** This member's per-device pref (only meaningful once householdUnlocked). */
  localShow: boolean;
  /** The single flag every advanced feature checks. */
  showAdvanced: boolean;
  /** Unlock the household with the password; also turns the unlocker's view on. */
  unlockHousehold: (password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Toggle just THIS member's per-device visibility (no password). */
  setShowAdvanced: (next: boolean) => void;
}

const AdvancedFeaturesContext = createContext<AdvancedFeaturesValue | undefined>(undefined);

export function AdvancedFeaturesProvider({
  householdId,
  children,
}: {
  householdId: string | null;
  children: ReactNode;
}) {
  const { member } = useMember();
  const memberId = member?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [householdUnlocked, setHouseholdUnlocked] = useState(false);
  const [localShow, setLocalShow] = useState(false);

  // Layer 1: household-level unlock flag.
  useEffect(() => {
    if (!householdId) {
      setHouseholdUnlocked(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("shopping_households")
      .select("advanced_unlocked")
      .eq("id", householdId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setHouseholdUnlocked(data?.advanced_unlocked === true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  // Layer 2: this member's per-device visibility preference.
  useEffect(() => {
    setLocalShow(readLocalShow(memberId));
  }, [memberId]);

  const setShowAdvanced = useCallback(
    (next: boolean) => {
      if (!memberId || typeof window === "undefined") return;
      window.localStorage.setItem(showKey(memberId), next ? "true" : "false");
      setLocalShow(next);
    },
    [memberId],
  );

  const unlockHousehold = useCallback(
    async (password: string): Promise<{ ok: boolean; error?: string }> => {
      if (password !== ADVANCED_PASSWORD) {
        return { ok: false, error: "That password isn't right" };
      }
      if (!householdId) return { ok: false, error: "No household found" };
      const { error } = await supabase
        .from("shopping_households")
        .update({ advanced_unlocked: true })
        .eq("id", householdId);
      if (error) return { ok: false, error: error.message };
      setHouseholdUnlocked(true);
      setShowAdvanced(true); // the member who unlocks it sees advanced by default
      return { ok: true };
    },
    [householdId, setShowAdvanced],
  );

  const showAdvanced = householdUnlocked && localShow;

  return (
    <AdvancedFeaturesContext.Provider
      value={{
        loading,
        householdUnlocked,
        localShow,
        showAdvanced,
        unlockHousehold,
        setShowAdvanced,
      }}
    >
      {children}
    </AdvancedFeaturesContext.Provider>
  );
}

export function useAdvancedFeatures() {
  const ctx = useContext(AdvancedFeaturesContext);
  if (!ctx) {
    throw new Error("useAdvancedFeatures must be used within AdvancedFeaturesProvider");
  }
  return ctx;
}
