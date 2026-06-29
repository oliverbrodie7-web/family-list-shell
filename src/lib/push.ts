import { supabase } from "./supabase";

export const VAPID_PUBLIC_KEY =
  "BK-VhRP8Kp3F95MIpESaDj0665KZNR1Z7f5H4wj3xI0FVd6DLk0GCCWk2KODxJaxrG7cJTCb1ZNt10DJ8YAocOA";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean })
    .standalone === true;
  return Boolean(mql || iosStandalone);
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  // Try ready first (works if SW already registered & active)
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  // Otherwise register here (e.g. preview-guarded path didn't register)
  return navigator.serviceWorker.register("/sw.js");
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeAndSave(args: {
  userId: string;
  householdId: string;
}): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error("Push notifications aren't supported on this device.");

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }

  const endpoint = sub.endpoint;
  const p256dh = arrayBufferToBase64(sub.getKey("p256dh"));
  const auth = arrayBufferToBase64(sub.getKey("auth"));

  // Check for existing row with same endpoint
  const { data: existing } = await supabase
    .from("shopping_push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("shopping_push_subscriptions").insert({
      user_id: args.userId,
      household_id: args.householdId,
      endpoint,
      p256dh,
      auth,
    });
    if (error) throw new Error(error.message);
  }

  return sub;
}

export async function unsubscribeAndDelete(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // ignore unsubscribe errors; still remove the row
  }
  await supabase.from("shopping_push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function notifyHousehold(args: {
  householdId: string;
  title: string;
  body: string;
}): Promise<void> {
  try {
    const sub = await getCurrentSubscription();
    const exclude_endpoint = sub?.endpoint;
    const { error } = await supabase.functions.invoke("send-push", {
      body: {
        title: args.title,
        body: args.body,
        target: { household_id: args.householdId },
        ...(exclude_endpoint ? { exclude_endpoint } : {}),
      },
    });
    if (error) console.log("notifyHousehold: invoke error", error.message);
  } catch (e) {
    console.log("notifyHousehold: failed", (e as Error).message);
  }
}
