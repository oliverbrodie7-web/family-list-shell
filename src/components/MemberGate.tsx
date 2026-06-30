import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useMember, type Member } from "@/lib/member";
import { hashPin, verifyPin } from "@/lib/pin";

type Mode =
  | { kind: "loading" }
  | { kind: "setup-first" }
  | { kind: "picker" }
  | { kind: "pin"; member: Member }
  | { kind: "add-another" };

export function MemberGate({
  householdId,
  children,
}: {
  householdId: string;
  children: React.ReactNode;
}) {
  const { member, members, loading, refresh, rememberMember } = useMember();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });

  useEffect(() => {
    if (loading) {
      setMode({ kind: "loading" });
      return;
    }
    if (member) return; // children render
    if (members.length === 0) setMode({ kind: "setup-first" });
    else setMode((m) => (m.kind === "add-another" || m.kind === "pin" ? m : { kind: "picker" }));
  }, [loading, members, member]);

  if (member) return <>{children}</>;

  if (mode.kind === "loading") {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-white" />;
  }

  if (mode.kind === "setup-first" || mode.kind === "add-another") {
    return (
      <SetupScreen
        householdId={householdId}
        title={mode.kind === "setup-first" ? "Set up your profile" : "Add another person"}
        subtitle={
          mode.kind === "setup-first"
            ? "Tell us your name and pick a 4-digit PIN."
            : "Enter their name and a 4-digit PIN."
        }
        onCancel={mode.kind === "add-another" ? () => setMode({ kind: "picker" }) : undefined}
        onCreated={async (newMember) => {
          await refresh();
          rememberMember(newMember);
        }}
      />
    );
  }

  if (mode.kind === "picker") {
    return (
      <PickerScreen
        members={members}
        onPick={(m) => setMode({ kind: "pin", member: m })}
        onAddAnother={() => setMode({ kind: "add-another" })}
      />
    );
  }

  return (
    <PinScreen
      member={mode.member}
      onBack={() => setMode({ kind: "picker" })}
      onSuccess={() => rememberMember(mode.member)}
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

function SetupScreen({
  householdId,
  title,
  subtitle,
  onCreated,
  onCancel,
}: {
  householdId: string;
  title: string;
  subtitle: string;
  onCreated: (m: Member) => void;
  onCancel?: () => void;
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
      const { data, error } = await supabase
        .from("shopping_members")
        .insert({ household_id: householdId, name: trimmed, pin_hash })
        .select("id, household_id, name, pin_hash, created_at")
        .single();
      if (error) {
        setError(error.message);
        setSubmitting(false);
        return;
      }
      onCreated(data as Member);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">{subtitle}</p>
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
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl py-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            Cancel
          </button>
        )}
      </form>
    </Shell>
  );
}

function PickerScreen({
  members,
  onPick,
  onAddAnother,
}: {
  members: Member[];
  onPick: (m: Member) => void;
  onAddAnother: () => void;
}) {
  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Who's this?</h1>
      <p className="mt-2 text-sm text-neutral-500">Tap your name to continue.</p>
      <div className="mt-8 space-y-2">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m)}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-4 text-left text-base font-medium text-neutral-900 transition active:scale-[0.99] hover:border-[var(--accent-green)]"
          >
            <span>{m.name}</span>
            <span className="text-neutral-400">›</span>
          </button>
        ))}
        <button
          onClick={onAddAnother}
          className="w-full rounded-xl border border-dashed border-neutral-300 px-4 py-4 text-base font-medium text-neutral-600 transition hover:border-[var(--accent-green)] hover:text-[var(--accent-green)]"
        >
          + Add another person
        </button>
      </div>
    </Shell>
  );
}

function PinScreen({
  member,
  onBack,
  onSuccess,
}: {
  member: Member;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) return;
    setChecking(true);
    setError(null);
    const ok = await verifyPin(pin, member.pin_hash);
    if (!ok) {
      setError("PIN incorrect, try again.");
      setPin("");
      setChecking(false);
      return;
    }
    onSuccess();
  };

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Hi, {member.name}</h1>
      <p className="mt-2 text-sm text-neutral-500">Enter your 4-digit PIN.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <PinInput value={pin} onChange={setPin} autoFocus />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pin.length !== 4 || checking}
          className="w-full rounded-xl bg-[var(--accent-green)] py-3 text-base font-medium text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {checking ? "Checking…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-xl py-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
        >
          Not me
        </button>
      </form>
    </Shell>
  );
}
