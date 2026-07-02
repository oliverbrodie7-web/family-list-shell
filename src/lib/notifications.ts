import { useEffect, useState, useCallback } from "react";
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

export type NotificationsState = {
  ready: boolean;
  supported: boolean;
  enabled: boolean;
  needsReregister: boolean;
  busy: boolean;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
};

export function useNotifications(): NotificationsState {
  const { session } = useAuth();
  const { householdId } = useHouseholdId();
  const { member } = useMember();
  const [enabled, setEnabled] = useState(false);
  const [needsReregister, setNeedsReregister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const supported = pushSupported();

  const refresh = useCallback(async () => {
    if (!supported) {
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
    setEnabled(hasSub && !mismatch);
    setNeedsReregister(hasSub && mismatch);
    setReady(true);
  }, [supported, member, householdId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const userId = session?.user?.id ?? null;

  const turnOn = useCallback(async () => {
    if (!supported) {
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
              : "Permission wasn't granted. Try again.",
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
  }, [supported, userId, householdId, member]);

  const turnOff = useCallback(async () => {
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
  }, []);

  return { ready, supported, enabled, needsReregister, busy, turnOn, turnOff };
}
