import { createFileRoute } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { AppShell } from "@/components/AppShell";

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
  return session ? <AppShell /> : <LoginScreen />;
}
