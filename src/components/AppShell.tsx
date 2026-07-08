import { useState, useEffect } from "react";
import { PlusCircle, ShoppingCart, Bell, BellOff, Settings } from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import { snappySpring } from "@/lib/motion";
import { useHouseholdId } from "@/lib/household";
import { useMember } from "@/lib/member";
import { useNotifications } from "@/lib/notifications";
import { InputTab } from "./InputTab";
import { ListTab } from "./ListTab";
import { Toaster } from "@/components/ui/sonner";
import { SettingsSheet } from "./SettingsSheet";

type Tab = "input" | "list";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("input");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const { householdId } = useHouseholdId();
  const { member } = useMember();
  const notifications = useNotifications();

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const bottomInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Only lift when keyboard clearly present (>120px)
      setKbOffset(bottomInset > 120 ? bottomInset : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const bellOn = notifications.enabled && !notifications.needsReregister;

  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 230, damping: 22, mass: 0.9 }}>
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="min-w-0 flex-1">
          {tab === "list" && (
            <h1 className="font-serif text-[20px] leading-none" style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}>
              Shopping list
            </h1>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {member?.name && (
            <span
              className="text-[14px] font-medium"
              style={{ color: "var(--clay-ink)" }}
            >
              {member.name}
            </span>
          )}
          {notifications.supported && notifications.ready && (
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label={bellOn ? "Notifications on" : "Notifications off"}
              className="flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95"
            >
              {bellOn ? (
                <Bell size={16} fill="#C2693F" color="#C2693F" strokeWidth={0} />
              ) : (
                <BellOff size={16} color="var(--clay-muted)" strokeWidth={1.75} />
              )}
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95"
          >
            <Settings size={18} color="var(--clay-muted)" strokeWidth={1.75} />
          </button>
        </div>
      </header>
      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} notifications={notifications} />
      )}

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
      <Toaster position="top-center" offset={72} />

    </div>
    </MotionConfig>
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
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      transition={snappySpring}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-sm font-medium transition ${
        active ? "text-[var(--accent-green)]" : "text-neutral-400"
      }`}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  );
}
