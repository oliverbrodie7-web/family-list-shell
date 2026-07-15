import { useEffect, useState } from "react";

// Subtle Warm Clay strip shown at the top of the app while the browser reports
// offline. Appears/disappears with the online/offline events. In-flow and thin
// so it never covers controls; it only occupies space while actually offline.
export function OfflineBar() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="w-full px-4 py-1.5 text-center text-[12px] font-medium"
      style={{
        background: "var(--clay-accent-soft)",
        color: "var(--clay-muted)",
        borderBottom: "1px solid var(--clay-border)",
      }}
    >
      You are offline. Changes will not save.
    </div>
  );
}
