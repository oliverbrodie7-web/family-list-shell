import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { SetupNewMember } from "./PostSignupFork";

// Reusable "Join a family with a code" flow for existing users.
// Reuses the EXACT signup-fork join sequence (redeem-invite → signOut →
// verifyOtp → SetupNewMember). Because the user already belongs to a household,
// it shows an explicit switch-warning BEFORE joining.
type Stage =
  | { kind: "warning" }
  | { kind: "code" }
  | { kind: "joining" }
  | { kind: "setup"; householdId: string };

export function JoinFamilyModal({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: "warning" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return setError("Please enter your code.");

    setStage({ kind: "joining" });
    try {
      // Swap session cleanly so we land on the shared family account.
      await supabase.auth.signOut();

      const { data, error: fnErr } = await supabase.functions.invoke(
        "redeem-invite",
        { body: { code: cleanCode } },
      );
      if (fnErr || !data || (data as { error?: string }).error) {
        setError(
          "That code is invalid, expired, or already used — ask for a new one.",
        );
        setStage({ kind: "code" });
        return;
      }

      const { email, token_hash, household_id } = data as {
        email: string;
        token_hash: string;
        household_id: string;
      };

      const { error: otpErr } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash,
      });
      if (otpErr) {
        const { error: otpErr2 } = await supabase.auth.verifyOtp({
          type: "email",
          email,
          token: token_hash,
        });
        if (otpErr2) {
          setError("Couldn't sign in. Please try the code again.");
          setStage({ kind: "code" });
          return;
        }
      }

      setStage({ kind: "setup", householdId: household_id });
    } catch {
      setError("Something went wrong. Please try again.");
      setStage({ kind: "code" });
    }
  };

  // Member setup for the joined household — full-screen, same as the signup fork.
  if (stage.kind === "setup") {
    return <SetupNewMember householdId={stage.householdId} />;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[360px] rounded-[18px] bg-white p-6 shadow-xl"
        style={{ border: "1px solid var(--clay-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {stage.kind === "warning" && (
          <div className="space-y-4">
            <div>
              <h2
                className="font-serif text-[22px] leading-tight"
                style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
              >
                Join another family?
              </h2>
              <p className="mt-2 text-[15px] leading-snug" style={{ color: "var(--clay-ink)" }}>
                Joining another family will switch this device to their shared
                pantry. Your current list stays with your old family and won't come
                with you.
              </p>
              <p className="mt-2 text-[14px]" style={{ color: "var(--clay-muted)" }}>
                Continue?
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="clay-btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStage({ kind: "code" });
                }}
                className="clay-btn-primary flex-1"
              >
                Join family
              </button>
            </div>
          </div>
        )}

        {stage.kind === "code" && (
          <form onSubmit={submitCode} className="space-y-3">
            <div>
              <h2
                className="font-serif text-[22px] leading-tight"
                style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
              >
                Join a family
              </h2>
              <p className="mt-1 text-[14px]" style={{ color: "var(--clay-muted)" }}>
                Got a code from a family member? Enter it here to join their pantry.
                It looks like PANTRY-XXXX.
              </p>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PANTRY-XXXX"
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              className="clay-input text-center"
              style={{ fontSize: "22px", letterSpacing: "0.12em", fontWeight: 600 }}
            />
            {error && (
              <p className="text-[15px]" style={{ color: "#B4441F" }}>
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStage({ kind: "warning" });
                }}
                className="clay-btn-secondary flex-1"
              >
                Back
              </button>
              <button type="submit" className="clay-btn-primary flex-1">
                Join
              </button>
            </div>
          </form>
        )}

        {stage.kind === "joining" && (
          <div className="py-4 text-center">
            <h2
              className="font-serif text-[22px] leading-tight"
              style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
            >
              Joining your family…
            </h2>
            <p className="mt-2 text-[14px]" style={{ color: "var(--clay-muted)" }}>
              One moment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
