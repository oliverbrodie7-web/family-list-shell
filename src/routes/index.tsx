import { createFileRoute } from "@tanstack/react-router";
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
  const { householdId, loading } = useHouseholdId();
  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-white" />;
  }
  if (!householdId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white px-6 text-center text-sm text-neutral-500">
        No household found for this account.
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
