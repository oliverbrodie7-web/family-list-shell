import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { InviteSteps } from "./InviteSteps";

// "Invite someone" generator as a bottom sheet — reuses the same create-invite-code
// Edge Function as the Settings invite card, plus the shared InviteSteps tutorial.
export function InviteModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createCode = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("create-invite-code");
      setLoading(false);
      if (fnErr || !data?.code) {
        setError("Couldn't create a code, please try again.");
        return;
      }
      setCode(data.code as string);
    } catch {
      setLoading(false);
      setError("Couldn't create a code, please try again.");
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
        style={{ background: "var(--clay-bg)", border: "1px solid var(--clay-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--clay-border)" }}
        />

        <h2
          className="font-serif text-[22px] leading-tight"
          style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
        >
          Invite a family member
        </h2>
        <p className="mt-1 text-[14px]" style={{ color: "var(--clay-muted)" }}>
          Get a short code they can type into the app on their phone.
        </p>

        <button onClick={createCode} disabled={loading} className="clay-btn-primary mt-4">
          {loading ? "Creating code…" : code ? "Create another code" : "Create invite code"}
        </button>

        {error && (
          <p className="mt-3 text-[15px]" style={{ color: "#B4441F" }}>
            {error}
          </p>
        )}

        {code && (
          <div className="mt-4 space-y-3">
            <div
              className="space-y-3 rounded-xl p-4 text-center"
              style={{ background: "var(--clay-accent-soft)", border: "1px solid var(--clay-border)" }}
            >
              <p
                className="font-serif text-[30px] leading-none"
                style={{ color: "var(--clay-ink)", letterSpacing: "0.12em" }}
              >
                {code}
              </p>
              <p className="text-[13px]" style={{ color: "var(--clay-muted)" }}>
                Share this code. It works for one join and expires in 7 days.
              </p>
              <button onClick={copyCode} className="clay-btn-primary">
                {copied ? "Copied!" : "Copy code"}
              </button>
            </div>
            <InviteSteps code={code} />
          </div>
        )}

        <button onClick={onClose} className="clay-btn-ghost mt-4">
          Close
        </button>
      </div>
    </div>
  );
}
