import { useEffect, useState } from "react";
import { Bell, BellOff, Settings } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { useHouseholdId } from "@/lib/household";
import { useMember } from "@/lib/member";
import { useNotifications } from "@/lib/notifications";
import { InputTab } from "./InputTab";
import { ListTab } from "./ListTab";
import { Toaster } from "@/components/ui/sonner";
import { SettingsSheet } from "./SettingsSheet";
import { WhatsNewPopup } from "./WhatsNewPopup";
import { checkForUpdateDaily } from "@/lib/pwa-update";
import { CURRENT_VERSION } from "@/lib/currentVersion";
import { supabase } from "@/lib/supabase";
import type { Tab } from "./TabSwitcher";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("input");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { householdId } = useHouseholdId();
  const { member } = useMember();
  const notifications = useNotifications();

  useEffect(() => {
    checkForUpdateDaily();
    // Fire-and-forget: record the current version note if not already stored.
    // Idempotent server-side; safe to call every load.
    (async () => {
      try {
        await supabase.functions.invoke("publish-version", {
          body: {
            version: CURRENT_VERSION.version,
            title: CURRENT_VERSION.title,
            notes: CURRENT_VERSION.notes,
          },
        });
      } catch {
        /* silent */
      }
    })();
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

      <main className="flex flex-1 flex-col pb-[max(env(safe-area-inset-bottom),1rem)]">
        {tab === "input" ? (
          <InputTab householdId={householdId} tab={tab} onTabChange={setTab} />
        ) : (
          <ListTab householdId={householdId} active={tab === "list"} tab={tab} onTabChange={setTab} />
        )}
      </main>

      <Toaster position="top-center" offset={72} />
      <WhatsNewPopup />


    </div>
    </MotionConfig>
  );
}
