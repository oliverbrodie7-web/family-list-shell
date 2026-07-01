import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useMember, type Member } from "@/lib/member";
import { hashPin, verifyPin } from "@/lib/pin";

const MEMBER_COLORS = ["#C2693F", "#6F8F5E", "#D38A2E", "#8E6E8A", "#A86A4B", "#5E8A8F"];

function memberColor(id: string | null | undefined) {
  if (!id) return "#C9BBA8";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

function initialOf(name: string) {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

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
    if (member) return;
    if (members.length === 0) setMode({ kind: "setup-first" });
    else setMode((m) => (m.kind === "add-another" || m.kind === "pin" ? m : { kind: "picker" }));
  }, [loading, members, member]);

  if (member) return <>{children}</>;

  if (mode.kind === "loading") {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center"
        style={{ background: "var(--clay-bg)" }}
      />
    );
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

function Shell({
  children,
  showWordmark,
}: {
  children: React.ReactNode;
  showWordmark?: boolean;
}) {
  return (
    <div
      className="flex min-h-[100dvh] items-start justify-center px-6 pt-[calc(env(safe-area-inset-top)+2.5rem)]"
      style={{ background: "var(--clay-bg)" }}
    >
      <div className="w-full max-w-sm">
        {showWordmark && (
          <h1
            className="mb-6 text-center font-display text-[28px] leading-none"
            style={{ color: "var(--clay-ink)", letterSpacing: "-0.015em" }}
          >
            Our Pantry
          </h1>
        )}
        {children}
      </div>
    </div>
  );
}

function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <h2
          className="text-[22px] font-semibold leading-tight"
          style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1.5 text-sm" style={{ color: "var(--clay-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {right}
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

function PinDots({ length }: { length: number }) {
  return (
    <div className="flex justify-center gap-2.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full transition"
          style={{
            background:
              i < length ? "var(--clay-accent)" : "var(--clay-border)",
          }}
        />
      ))}
    </div>
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
    <Shell showWordmark>
      <ScreenHeader title={title} subtitle={subtitle} />
      <div
        className="mt-5 rounded-[14px] bg-white p-5"
        style={{ border: "1px solid var(--clay-border)" }}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <FieldLabel htmlFor="setup-name">Name</FieldLabel>
          <input
            id="setup-name"
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
          {onCancel && (
            <button type="button" onClick={onCancel} className="clay-btn-ghost">
              Cancel
            </button>
          )}
        </form>
      </div>
    </Shell>
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
      className="block text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: "var(--clay-muted)" }}
    >
      {children}
    </label>
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
  const { deleteMember } = useMember();
  const [manage, setManage] = useState(false);
  const [pending, setPending] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Shell showWordmark>
      <ScreenHeader
        title="Who's this?"
        subtitle={manage ? "Tap a name to remove them." : "Tap your name to continue."}
        right={
          <button
            onClick={() => {
              setManage((v) => !v);
              setPending(null);
              setError(null);
            }}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium"
            style={{ color: "var(--clay-accent)" }}
          >
            {manage ? "Done" : "Manage"}
          </button>
        }
      />

      <div
        className="mt-5 overflow-hidden rounded-[14px] bg-white"
        style={{ border: "1px solid var(--clay-border)" }}
      >
        <ul>
          {members.map((m, idx) => {
            const color = memberColor(m.id);
            return (
              <li
                key={m.id}
                style={{
                  borderTop: idx === 0 ? "none" : "1px solid var(--clay-border)",
                }}
              >
                <button
                  onClick={() => (manage ? setPending(m) : onPick(m))}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-[var(--clay-accent-soft)]"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white"
                    style={{ background: color }}
                  >
                    {initialOf(m.name)}
                  </span>
                  <span
                    className="flex-1 text-[16px] font-medium"
                    style={{ color: "var(--clay-ink)" }}
                  >
                    {m.name}
                  </span>
                  {manage ? (
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: "#B4441F" }}
                    >
                      Remove
                    </span>
                  ) : (
                    <span className="text-[18px]" style={{ color: "var(--clay-muted)" }}>
                      ›
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {!manage && (
        <button
          onClick={onAddAnother}
          className="mt-3 flex w-full items-center justify-center rounded-[14px] px-4 py-3.5 text-[15px] font-medium transition"
          style={{
            border: "1px dashed #C9BBA8",
            color: "var(--clay-muted)",
            background: "transparent",
          }}
        >
          + Add another person
        </button>
      )}

      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
          onClick={() => !busy && setPending(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
            style={{ border: "1px solid var(--clay-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-4 h-1 w-10 rounded-full"
              style={{ background: "var(--clay-border)" }}
            />
            <p className="text-[15px]" style={{ color: "var(--clay-ink)" }}>
              Remove {pending.name} from the family? This can't be undone.
            </p>
            {error && (
              <p className="mt-2 text-sm" style={{ color: "#B4441F" }}>
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPending(null)}
                disabled={busy}
                className="clay-btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const { error } = await deleteMember(pending.id);
                  setBusy(false);
                  if (error) return setError(error);
                  setPending(null);
                }}
                disabled={busy}
                className="flex-1 rounded-xl py-3 text-[15px] font-semibold text-white disabled:opacity-60"
                style={{ background: "#B4441F" }}
              >
                {busy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const color = memberColor(member.id);

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
    <Shell showWordmark>
      <div className="flex flex-col items-center text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full text-[24px] font-semibold text-white"
          style={{ background: color }}
        >
          {initialOf(member.name)}
        </span>
        <h2
          className="mt-4 text-[22px] font-semibold leading-tight"
          style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
        >
          Hi, {member.name}
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: "var(--clay-muted)" }}>
          Enter your 4-digit PIN.
        </p>
      </div>

      <div
        className="mt-6 rounded-[14px] bg-white p-5"
        style={{ border: "1px solid var(--clay-border)" }}
      >
        <form onSubmit={submit} className="space-y-4">
          <PinDots length={pin.length} />
          <PinInput value={pin} onChange={setPin} autoFocus />
          {error && (
            <p className="text-center text-sm" style={{ color: "#B4441F" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pin.length !== 4 || checking}
            className="clay-btn-primary"
          >
            {checking ? "Checking…" : "Continue"}
          </button>
          <button type="button" onClick={onBack} className="clay-btn-ghost">
            Not me
          </button>
        </form>
      </div>
    </Shell>
  );
}
