// Central gate for "advanced features" — open to everyone, per member:
//
//   1. MASTER TOGGLE (per-device, per-member, no password): each member chooses
//      whether to show advanced features in their own view. Stored in
//      localStorage under "op_show_advanced_<memberId>". Defaults OFF.
//   2. PER-FEATURE PREFERENCES: each registry feature has its own per-member
//      toggle under "op_adv_feature_<featureId>_<memberId>". Defaults ON.
//
// Gate rules:
//   showAdvanced      = this member's master toggle
//   isFeatureOn(id)   = showAdvanced AND this member's per-feature preference
//
// The old household password unlock (shopping_households.advanced_unlocked) is
// retired: the column is no longer read anywhere and is simply unused.
//
// This provider also carries household-level context that rides along on the
// same fetch: isOwnerHousehold (owner-tier gating, e.g. the Feedback viewer)
// and the household's supermarket choice (used by pricing).

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
import { ADVANCED_FEATURES } from "./advancedFeaturesRegistry";

const showKey = (memberId: string) => `op_show_advanced_${memberId}`;
const featureKey = (featureId: string, memberId: string) =>
  `op_adv_feature_${featureId}_${memberId}`;

// Master toggle DEFAULTS OFF: only an explicit stored "true" turns it on, so
// members who already switched it on stay on and nobody's setting resets.
function readLocalShow(memberId: string | null | undefined): boolean {
  if (!memberId || typeof window === "undefined") return false;
  return window.localStorage.getItem(showKey(memberId)) === "true";
}

// Per-feature preference DEFAULTS TO ON when nothing is stored.
function readFeaturePref(featureId: string, memberId: string | null): boolean {
  if (!memberId || typeof window === "undefined") return true;
  return window.localStorage.getItem(featureKey(featureId, memberId)) !== "false";
}

interface AdvancedFeaturesValue {
  loading: boolean;
  /** This member's master toggle (raw stored value). */
  localShow: boolean;
  /** The master flag: purely this member's toggle. */
  showAdvanced: boolean;
  /** Set this member's master toggle (no password). */
  setShowAdvanced: (next: boolean) => void;
  /** Is this the owner household? (shopping_households.is_owner) */
  isOwnerHousehold: boolean;
  /** The household's chosen supermarket (shopping_households.supermarket). */
  supermarket: string;
  /** Save the household's supermarket choice. */
  setSupermarket: (next: string) => Promise<{ ok: boolean; error?: string }>;
  /** Per-feature gate: showAdvanced AND this member's feature pref. */
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
  const [isOwnerHousehold, setIsOwnerHousehold] = useState(false);
  const [supermarket, setSupermarketState] = useState("woolworths");
  const [localShow, setLocalShow] = useState(false);
  const [featurePrefs, setFeaturePrefs] = useState<Record<string, boolean>>({});

  // Household-level context (owner flag + supermarket). advanced_unlocked is
  // deliberately NOT selected — it no longer plays any part in gating.
  useEffect(() => {
    if (!householdId) {
      setIsOwnerHousehold(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("shopping_households")
      .select("is_owner, supermarket")
      .eq("id", householdId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
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

  // This member's master toggle + per-feature prefs.
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

  const showAdvanced = localShow;

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

  const isFeatureOn = useCallback(
    (featureId: string) => showAdvanced && (featurePrefs[featureId] ?? true),
    [showAdvanced, featurePrefs],
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

  return (
    <AdvancedFeaturesContext.Provider
      value={{
        loading,
        localShow,
        showAdvanced,
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
