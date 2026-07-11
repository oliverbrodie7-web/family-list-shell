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
import { ADVANCED_FEATURES } from "./advancedFeaturesRegistry";

const showKey = (memberId: string) => `op_show_advanced_${memberId}`;
const featureKey = (featureId: string, memberId: string) =>
  `op_adv_feature_${featureId}_${memberId}`;

function readLocalShow(memberId: string | null | undefined): boolean {
  if (!memberId || typeof window === "undefined") return false;
  return window.localStorage.getItem(showKey(memberId)) === "true";
}

// Per-feature preference DEFAULTS TO ON when nothing is stored, so adding a
// feature to the registry (or shipping this system) changes nothing visibly.
function readFeaturePref(featureId: string, memberId: string | null): boolean {
  if (!memberId || typeof window === "undefined") return true;
  return window.localStorage.getItem(featureKey(featureId, memberId)) !== "false";
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
  /** Is this the owner household? (shopping_households.is_owner) */
  isOwnerHousehold: boolean;
  /** The household's chosen supermarket (shopping_households.supermarket). */
  supermarket: string;
  /** Save the household's supermarket choice. */
  setSupermarket: (next: string) => Promise<{ ok: boolean; error?: string }>;
  /** Per-feature gate: householdUnlocked AND showAdvanced AND this member's feature pref. */
  isFeatureOn: (featureId: string) => boolean;
  /** Set this member's per-feature preference (registry features only). */
  setFeatureOn: (featureId: string, next: boolean) => void;
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
  const [isOwnerHousehold, setIsOwnerHousehold] = useState(false);
  const [supermarket, setSupermarketState] = useState("woolworths");
  const [localShow, setLocalShow] = useState(false);
  const [featurePrefs, setFeaturePrefs] = useState<Record<string, boolean>>({});

  // Layer 1: household-level flags (advanced unlock + owner household).
  useEffect(() => {
    if (!householdId) {
      setHouseholdUnlocked(false);
      setIsOwnerHousehold(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("shopping_households")
      .select("advanced_unlocked, is_owner, supermarket")
      .eq("id", householdId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setHouseholdUnlocked(data?.advanced_unlocked === true);
        setIsOwnerHousehold(data?.is_owner === true);
        setSupermarketState(
          typeof data?.supermarket === "string" && data.supermarket
            ? data.supermarket
            : "woolworths",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  // Layer 2: this member's per-device visibility preference + per-feature prefs.
  useEffect(() => {
    setLocalShow(readLocalShow(memberId));
    const prefs: Record<string, boolean> = {};
    for (const f of ADVANCED_FEATURES) prefs[f.id] = readFeaturePref(f.id, memberId);
    setFeaturePrefs(prefs);
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
      const { data, error } = await supabase
        .from("shopping_households")
        .update({ advanced_unlocked: true })
        .eq("id", householdId)
        .select("id");
      if (error || !data || data.length === 0) {
        return { ok: false, error: "Couldn't save — please try again." };
      }
      setHouseholdUnlocked(true);
      setShowAdvanced(true); // the member who unlocks it sees advanced by default
      return { ok: true };
    },
    [householdId, setShowAdvanced],
  );

  const showAdvanced = householdUnlocked && localShow;

  // Per-feature setter: writes only this feature's key, so the master toggle
  // never erases per-feature preferences (master off hides, doesn't forget).
  const setFeatureOn = useCallback(
    (featureId: string, next: boolean) => {
      if (!memberId || typeof window === "undefined") return;
      window.localStorage.setItem(featureKey(featureId, memberId), next ? "true" : "false");
      setFeaturePrefs((prev) => ({ ...prev, [featureId]: next }));
    },
    [memberId],
  );

  const setSupermarket = useCallback(
    async (next: string): Promise<{ ok: boolean; error?: string }> => {
      if (!householdId) return { ok: false, error: "No household found" };
      const { data, error } = await supabase
        .from("shopping_households")
        .update({ supermarket: next })
        .eq("id", householdId)
        .select("id");
      if (error || !data || data.length === 0) {
        return { ok: false, error: "Couldn't save — please try again." };
      }
      setSupermarketState(next);
      return { ok: true };
    },
    [householdId],
  );

  const isFeatureOn = useCallback(
    (featureId: string) =>
      householdUnlocked && showAdvanced && (featurePrefs[featureId] ?? true),
    [householdUnlocked, showAdvanced, featurePrefs],
  );

  return (
    <AdvancedFeaturesContext.Provider
      value={{
        loading,
        householdUnlocked,
        localShow,
        showAdvanced,
        unlockHousehold,
        setShowAdvanced,
        isOwnerHousehold,
        supermarket,
        setSupermarket,
        isFeatureOn,
        setFeatureOn,
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
