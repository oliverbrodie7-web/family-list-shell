import { useState } from "react";
import { PlusCircle, ShoppingCart } from "lucide-react";
import { useHouseholdId } from "@/lib/household";
import { useMember } from "@/lib/member";
import { InputTab } from "./InputTab";
import { ListTab } from "./ListTab";
import { Toaster } from "@/components/ui/sonner";
import { NotificationsToggle } from "./NotificationsToggle";
import { ProfileSheet } from "./ProfileSheet";

type Tab = "input" | "list";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("input");
  const [profileOpen, setProfileOpen] = useState(false);
  const { householdId } = useHouseholdId();
  const { member } = useMember();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-neutral-100 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <h1 className="text-base font-semibold tracking-tight text-neutral-900">
          {tab === "input" ? "Add items" : "Shopping list"}
        </h1>
        <div className="flex items-center gap-2">
          <NotificationsToggle />
          <button
            onClick={() => setProfileOpen(true)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            {member?.name ?? "Profile"}
          </button>
        </div>
      </header>
      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}

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
      <Toaster position="bottom-center" offset={88} />

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
