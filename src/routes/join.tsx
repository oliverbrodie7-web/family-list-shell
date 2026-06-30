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
        <Wordmark />
        <h1
          className="mt-6 text-[22px] font-semibold tracking-tight"
          style={{ color: "var(--clay-ink)" }}
        >
          Joining your family…
        </h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--clay-muted)" }}>
          One moment.
        </p>
      </Shell>
    );
  }

  if (stage.kind === "error") {
    return (
      <Shell>
        <Wordmark />
        <h1
          className="mt-6 text-[22px] font-semibold tracking-tight"
          style={{ color: "var(--clay-ink)" }}
        >
          Can't join
        </h1>
        <p className="mt-3 text-[14px]" style={{ color: "var(--clay-ink)" }}>
          {stage.message}
        </p>
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-8 w-full rounded-[12px] bg-white py-3 text-[14px] font-medium transition active:scale-[0.99]"
          style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
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
    <div
      className="flex min-h-[100dvh] items-start justify-center px-5 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-8"
      style={{ background: "var(--clay-bg)" }}
    >
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function Wordmark() {
  return (
    <p
      className="text-center text-[20px] leading-none"
      style={{ fontFamily: "Fraunces, serif", color: "var(--clay-ink)" }}
    >
      Our Pantry
    </p>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: "var(--clay-muted)" }}
    >
      {children}
    </p>
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
      className="w-full rounded-[12px] bg-white px-4 py-3 text-center text-2xl tracking-[0.6em] outline-none"
      style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
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
      <Wordmark />
      <h1
        className="mt-6 text-[22px] font-semibold tracking-tight"
        style={{ color: "var(--clay-ink)" }}
      >
        Set up your profile
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--clay-muted)" }}>
        You've joined the family. Tell us your name and pick a 4-digit PIN.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-6 rounded-[14px] bg-white p-5 space-y-3.5"
        style={{ border: "1px solid var(--clay-border)" }}
      >
        <FieldLabel>Name</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={40}
          className="w-full rounded-[10px] bg-white px-3.5 py-3 text-[16px] outline-none"
          style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
        />
        <FieldLabel>Choose 4-digit PIN</FieldLabel>
        <PinInput value={pin} onChange={setPin} />
        <FieldLabel>Confirm PIN</FieldLabel>
        <PinInput value={confirm} onChange={setConfirm} />
        {error && (
          <p className="text-sm" style={{ color: "#B0452A" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 w-full rounded-[12px] py-3 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: "var(--clay-accent)" }}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </Shell>
  );
}
