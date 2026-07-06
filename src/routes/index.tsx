import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { AppShell } from "@/components/AppShell";
import { MemberProvider } from "@/lib/member";
import { MemberGate } from "@/components/MemberGate";
import { useHouseholdId } from "@/lib/household";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Family Shopping" },
      { name: "description", content: "A simple, fast shopping list for the family." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-white" />;
  }
  if (!session) return <LoginScreen />;
  return <HouseholdGate />;
}

function HouseholdGate() {
  const { householdId, loading, refetch } = useHouseholdId();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const createHousehold = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-household", {
        body: { familyName: "My Family" },
      });
      if (error || !data?.household_id) {
        setCreateError("We couldn't finish setting up your pantry. Please try again.");
        setCreating(false);
        return;
      }
      refetch();
    } catch {
      setCreateError("We couldn't finish setting up your pantry. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!loading && !householdId && !attempted && !creating) {
      setAttempted(true);
      void createHousehold();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, householdId, attempted, creating]);

  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-white" />;
  }

  if (!householdId) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center px-6"
        style={{ background: "var(--clay-bg)" }}
      >
        <div className="w-full max-w-sm text-center">
          <h1
            className="font-display text-[28px] leading-tight"
            style={{ color: "var(--clay-ink)", letterSpacing: "-0.015em" }}
          >
            {createError ? "Something went wrong" : "Setting up your pantry…"}
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--clay-muted)" }}>
            {createError ?? "Just a moment while we get everything ready."}
          </p>
          {createError && (
            <button
              type="button"
              onClick={() => void createHousehold()}
              disabled={creating}
              className="clay-btn-primary mt-5"
            >
              {creating ? "Trying again…" : "Try again"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <MemberProvider householdId={householdId}>
      <MemberGate householdId={householdId}>
        <AppShell />
      </MemberGate>
    </MemberProvider>
  );
}
