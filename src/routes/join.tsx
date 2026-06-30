import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { hashPin } from "@/lib/pin";

const STORAGE_KEY = "shopping_remembered_member_id";

type Stage =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "setup"; householdId: string };

export const Route = createFileRoute("/join")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Join family — Our Pantry" },
      { name: "description", content: "Join your family's shopping list." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = useSearch({ from: "/join" });
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();

    async function run() {
      if (!token) {
        setStage({ kind: "error", message: "This invite link is invalid or has expired — ask whoever invited you for a new link." });
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("redeem-invite", {
          body: { token },
        });
        if (error || !data || data.error) {
          setStage({
            kind: "error",
            message:
              (data?.error as string | undefined) ??
              "This invite link is invalid or has expired — ask whoever invited you for a new link.",
          });
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
          // fall back: verifyOtp with email + token type "email"
          const { error: otpErr2 } = await supabase.auth.verifyOtp({
            type: "email",
            email,
            token: token_hash,
          });
          if (otpErr2) {
            setStage({ kind: "error", message: "Could not sign in. Please try the link again." });
            return;
          }
        }
        setStage({ kind: "setup", householdId: household_id });
      } catch (e) {
        setStage({
          kind: "error",
          message: e instanceof Error ? e.message : "Something went wrong.",
        });
      }
    }
  }, [token]);

  if (stage.kind === "loading") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Joining your family…</h1>
        <p className="mt-2 text-sm text-neutral-500">One moment.</p>
      </Shell>
    );
  }

  if (stage.kind === "error") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Can't join</h1>
        <p className="mt-3 text-sm text-neutral-600">{stage.message}</p>
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-8 w-full rounded-xl border border-neutral-200 bg-white py-3 text-base font-medium text-neutral-700 transition active:scale-[0.99]"
        >
          Go to app
        </button>
      </Shell>
    );
  }

  return (
    <SetupNewMember
      householdId={stage.householdId}
      onDone={() => navigate({ to: "/" })}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-white px-6 pt-[calc(env(safe-area-inset-top)+3rem)]">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function PinInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="one-time-code"
      maxLength={4}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center text-2xl tracking-[0.6em] text-neutral-900 outline-none transition focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green-soft)]"
    />
  );
}

function SetupNewMember({
  householdId,
  onDone,
}: {
  householdId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("Please enter a name");
    if (pin.length !== 4) return setError("PIN must be 4 digits");
    if (pin !== confirm) return setError("PINs don't match");
    setSubmitting(true);
    try {
      const pin_hash = await hashPin(pin);
      const { data, error: insErr } = await supabase
        .from("shopping_members")
        .insert({ household_id: householdId, name: trimmed, pin_hash })
        .select("id")
        .single();
      if (insErr || !data) {
        setError(insErr?.message ?? "Could not create profile");
        setSubmitting(false);
        return;
      }
      localStorage.setItem(STORAGE_KEY, data.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Set up your profile</h1>
      <p className="mt-2 text-sm text-neutral-500">
        You've joined the family. Tell us your name and pick a 4-digit PIN.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={40}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green-soft)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-600">Choose 4-digit PIN</label>
          <PinInput value={pin} onChange={setPin} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-600">Confirm PIN</label>
          <PinInput value={confirm} onChange={setConfirm} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-xl bg-[var(--accent-green)] py-3 text-base font-medium text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </Shell>
  );
}
