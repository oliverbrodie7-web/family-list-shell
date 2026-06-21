import { useState } from "react";
import { PlusCircle, ShoppingCart, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHouseholdId } from "@/lib/household";
import { InputTab } from "./InputTab";
import { ListTab } from "./ListTab";

type Tab = "input" | "list";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("input");
  const { signOut } = useAuth();
  const { householdId } = useHouseholdId();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
        <h1 className="text-base font-semibold tracking-tight text-neutral-900">
          {tab === "input" ? "Add items" : "Shopping list"}
        </h1>
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
        >
          <LogOut size={18} />
        </button>
      </header>

      <main className="flex flex-1 flex-col pb-24">
        {tab === "input" ? (
          <InputTab householdId={householdId} />
        ) : (
          <ListTab householdId={householdId} active={tab === "list"} />
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-100 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur"
      >
        <div className="mx-auto flex max-w-md items-center justify-around">
          <TabButton
            active={tab === "input"}
            onClick={() => setTab("input")}
            icon={<PlusCircle size={26} strokeWidth={2} />}
            label="Input"
          />
          <TabButton
            active={tab === "list"}
            onClick={() => setTab("list")}
            icon={<ShoppingCart size={24} strokeWidth={2} />}
            label="List"
          />
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition ${
        active ? "text-[var(--accent-green)]" : "text-neutral-400"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 text-neutral-300">{icon}</div>
      <p className="text-base font-medium text-neutral-700">{title}</p>
      <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
    </div>
  );
}
