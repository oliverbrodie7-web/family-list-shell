import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { hashPin } from "@/lib/pin";

const REMEMBERED_KEY = "shopping_remembered_member_id";

type Stage =
  | { kind: "fork" }
  | { kind: "code" }
  | { kind: "joining" }
  | { kind: "join-setup"; householdId: string }
  | { kind: "starting" };

export function PostSignupFork({ onStarted }: { onStarted: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: "fork" });
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const startingRef = useRef(false);

  const chooseStart = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    setStage({ kind: "starting" });
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "create-household",
        { body: { familyName: "My Family" } },
      );
      if (fnErr || !data?.household_id) {
        setError("We couldn't set up your family. Please try again.");
        setStage({ kind: "fork" });
        startingRef.current = false;
        return;
      }
      onStarted();
    } catch {
      setError("We couldn't set up your family. Please try again.");
      setStage({ kind: "fork" });
      startingRef.current = false;
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return setError("Please enter your code.");

    setStage({ kind: "joining" });
    try {
      // Swap session cleanly: sign out of the just-created account so we can
      // land on the shared family account below.
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

      setStage({ kind: "join-setup", householdId: household_id });
    } catch {
      setError("Something went wrong. Please try again.");
      setStage({ kind: "code" });
    }
  };

  if (stage.kind === "join-setup") {
    return <SetupNewMember householdId={stage.householdId} />;
  }

  return (
    <Shell>
      {stage.kind === "fork" && (
        <>
          <Header
            title="Welcome to Our Pantry"
            subtitle="Start your own family list, or join one you've been invited to."
          />
          <div
            className="mt-5 space-y-3 rounded-[14px] bg-white p-5"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <button onClick={chooseStart} className="clay-btn-primary">
              Start a new family
            </button>
            <button
              onClick={() => {
                setError(null);
                setStage({ kind: "code" });
              }}
              className="clay-btn-secondary"
            >
              Join a family
            </button>
            {error && (
              <p className="text-sm" style={{ color: "#B4441F" }}>
                {error}
              </p>
            )}
          </div>
        </>
      )}

      {stage.kind === "starting" && (
        <>
          <Header
            title="Setting up your family…"
            subtitle="Just a moment while we get everything ready."
          />
        </>
      )}

      {stage.kind === "code" && (
        <>
          <Header
            title="Join a family"
            subtitle="Enter the code you were given. It looks like PANTRY-XXXX."
          />
          <form
            onSubmit={submitCode}
            className="mt-5 space-y-3 rounded-[14px] bg-white p-5"
            style={{ border: "1px solid var(--clay-border)" }}
          >
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
              style={{
                fontSize: "22px",
                letterSpacing: "0.12em",
                fontWeight: 600,
              }}
            />
            {error && (
              <p className="text-sm" style={{ color: "#B4441F" }}>
                {error}
              </p>
            )}
            <button type="submit" className="clay-btn-primary">
              Join
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCode("");
                setStage({ kind: "fork" });
              }}
              className="clay-btn-ghost"
            >
              Back
            </button>
          </form>
        </>
      )}

      {stage.kind === "joining" && (
        <>
          <Header
            title="Joining your family…"
            subtitle="One moment."
          />
        </>
      )}
    </Shell>
  );
}

function SetupNewMember({ householdId }: { householdId: string }) {
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
      localStorage.setItem(REMEMBERED_KEY, data.id);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <Header
        title="Set up your profile"
        subtitle="You've joined the family. Tell us your name and pick a 4-digit PIN."
      />
      <div
        className="mt-5 rounded-[14px] bg-white p-5"
        style={{ border: "1px solid var(--clay-border)" }}
      >
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
      </div>
    </Shell>
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

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center">
      <h2
        className="font-serif text-[26px] leading-tight"
        style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-[15px]" style={{ color: "var(--clay-muted)" }}>
          {subtitle}
        </p>
      )}
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
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
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
