import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export function TestPushButton() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!session?.user?.id) {
      toast.error("Not signed in");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push", {
        body: {
          title: "Our Pantry",
          body: "Test notification — it works! 🎉",
          target: { user_id: session.user.id },
        },
      });
      if (error) throw new Error(error.message);
      const summary = data as { found?: number; sent?: number; removed?: number; failed?: number };
      toast.success(
        `Sent: ${summary?.sent ?? 0}/${summary?.found ?? 0}` +
          (summary?.removed ? ` · removed ${summary.removed}` : "") +
          (summary?.failed ? ` · failed ${summary.failed}` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={send}
      disabled={busy}
      className="rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
      title="Temporary test button"
    >
      {busy ? "Sending…" : "Test push"}
    </button>
  );
}
