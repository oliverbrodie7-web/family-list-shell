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
        setStage({
          kind: "error",
          message:
            "This invite link is invalid or has expired — ask whoever invited you for a new link.",
        });
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
          const { error: otpErr2 } = await supabase.auth.verifyOtp({
            type: "email",
            email,
            token: token_hash,
          });
          if (otpErr2) {
            setStage({
              kind: "error",
              message: "Could not sign in. Please try the link again.",
            });
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
        <Card>
          <h2
            className="text-[24px] font-semibold leading-tight"
            style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
          >
            Joining your family…
          </h2>
          <p className="mt-1.5 text-[15px]" style={{ color: "var(--clay-muted)" }}>
            One moment.
          </p>
        </Card>
      </Shell>
    );
  }

  if (stage.kind === "error") {
    return (
      <Shell>
        <Card>
          <h2
            className="text-[24px] font-semibold leading-tight"
            style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
          >
            Can't join
          </h2>
          <p className="mt-2 text-[15px]" style={{ color: "var(--clay-muted)" }}>
            {stage.message}
          </p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="clay-btn-secondary mt-5"
          >
            Go to app
          </button>
        </Card>
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
      className="flex min-h-[100dvh] items-start justify-center px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)]"
      style={{ background: "var(--clay-bg)" }}
    >
      <div className="w-full max-w-sm">
        <h1
          className="mb-6 text-center font-display text-[30px] leading-none"
          style={{ color: "var(--clay-ink)", letterSpacing: "-0.015em" }}
        >
          Our Pantry
        </h1>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[14px] bg-white p-5"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[12px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: "var(--clay-muted)" }}
    >
      {children}
    </label>
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
      className="clay-input text-center"
      style={{
        fontSize: "28px",
        letterSpacing: "0.55em",
        paddingLeft: "0.55em",
        fontWeight: 600,
      }}
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
      <div className="mb-4 text-center">
        <h2
          className="text-[24px] font-semibold leading-tight"
          style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
        >
          Set up your profile
        </h2>
        <p className="mt-1.5 text-[15px]" style={{ color: "var(--clay-muted)" }}>
          You've joined the family. Tell us your name and pick a 4-digit PIN.
        </p>
      </div>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <FieldLabel htmlFor="join-name">Name</FieldLabel>
          <input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={40}
            className="clay-input"
          />
          <FieldLabel>Choose 4-digit PIN</FieldLabel>
          <PinInput value={pin} onChange={setPin} />
          <FieldLabel>Confirm PIN</FieldLabel>
          <PinInput value={confirm} onChange={setConfirm} />
          {error && (
            <p className="text-sm" style={{ color: "#B4441F" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting} className="clay-btn-primary">
            {submitting ? "Saving…" : "Continue"}
          </button>
        </form>
      </Card>
    </Shell>
  );
}
