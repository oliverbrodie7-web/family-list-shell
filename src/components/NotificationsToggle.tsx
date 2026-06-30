import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useHouseholdId } from "@/lib/household";
import { useMember } from "@/lib/member";
import {
  getCurrentSubscription,
  getStoredSubscriptionRow,
  isStandalone,
  pushSupported,
  subscribeAndSave,
  unsubscribeAndDelete,
} from "@/lib/push";

export function NotificationsToggle() {
  const { session } = useAuth();
  const { householdId } = useHouseholdId();
  const { member } = useMember();
  const [enabled, setEnabled] = useState(false);
  const [needsReregister, setNeedsReregister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        setReady(true);
        return;
      }
      const sub = await getCurrentSubscription();
      const permitted =
        typeof Notification !== "undefined" && Notification.permission === "granted";
      const hasSub = Boolean(sub) && permitted;

      let mismatch = false;
      if (hasSub && member) {
        const row = await getStoredSubscriptionRow();
        if (!row || row.member_id !== member.id || row.household_id !== householdId) {
          mismatch = true;
        }
      }
      if (cancelled) return;
      setEnabled(hasSub && !mismatch);
      setNeedsReregister(hasSub && mismatch);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [member, householdId]);

  const userId = session?.user?.id ?? null;

  const turnOn = async () => {
    if (!pushSupported()) {
      toast.error("This device doesn't support push notifications.");
      return;
    }
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isiOS && !isStandalone()) {
      toast.message("Add Our Pantry to your Home Screen first", {
        description:
          "On iPhone, notifications only work in the installed app. Tap Share → Add to Home Screen, then open it from there.",
      });
      return;
    }
    if (!userId || !householdId || !member) {
      toast.error("Still loading your account — try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.message("Notifications are off", {
          description:
            permission === "denied"
              ? "You've blocked notifications. Re-enable them in your device Settings → Notifications → Our Pantry."
              : "Permission wasn't granted. Tap the button again to try once more.",
        });
        return;
      }
      await subscribeAndSave({ userId, householdId, memberId: member.id });
      setEnabled(true);
      setNeedsReregister(false);
      toast.success("Notifications are on for this device");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't turn on notifications.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await unsubscribeAndDelete();
      setEnabled(false);
      setNeedsReregister(false);
      toast.success("Notifications turned off for this device");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't turn off notifications.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;
  if (!pushSupported()) return null;

  if (needsReregister) {
    return (
      <button
        onClick={turnOn}
        disabled={busy}
        aria-label="Re-register notifications for this member"
        className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition disabled:opacity-50"
      >
        <BellOff size={14} />
        <span>Re-enable notifications</span>
      </button>
    );
  }

  return (
    <button
      onClick={enabled ? turnOff : turnOn}
      disabled={busy}
      aria-label={enabled ? "Turn off notifications" : "Turn on notifications"}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        enabled
          ? "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-[var(--accent-green)]"
          : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {enabled ? <Bell size={14} /> : <BellOff size={14} />}
      <span>{enabled ? "Notifications on" : "Turn on notifications"}</span>
    </button>
  );
}
