// Once-per-day PWA update check. Reloads only when a new SW is actually waiting.
const LAST_CHECK_KEY = "op_last_update_check";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function userBusy() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function reloadWhenIdle() {
  const go = () => {
    if (userBusy()) {
      setTimeout(go, 4000);
      return;
    }
    window.location.reload();
  };
  setTimeout(go, 400);
}

export function checkForUpdateDaily() {
  try {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const last = localStorage.getItem(LAST_CHECK_KEY);
    if (last === todayStr()) return;
    localStorage.setItem(LAST_CHECK_KEY, todayStr());

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // Reload when the new SW takes control.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        reloadWhenIdle();
      });

      const activate = (sw: ServiceWorker) => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          sw.postMessage({ type: "SKIP_WAITING" });
        }
      };

      // If one is already waiting, activate it.
      if (reg.waiting) activate(reg.waiting);

      // Watch for a new one installing after update().
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => activate(sw));
      });

      reg.update().catch(() => {});
    }).catch(() => {});
  } catch {
    /* fail silently */
  }
}
