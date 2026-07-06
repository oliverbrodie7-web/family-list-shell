import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export function useHouseholdId() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!userId) {
      setHouseholdId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("shopping_household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        setHouseholdId(data?.household_id ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  return { householdId, loading, error, refetch };
}
