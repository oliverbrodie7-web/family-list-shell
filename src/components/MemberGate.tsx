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

const MEMBER_COLORS = ["#C2693F", "#6F8F5E", "#D38A2E", "#8E6E8A", "#A86A4B", "#5E8A8F"];

function memberColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

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

function Avatar({ name, id, size = 40 }: { name: string; id: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        background: memberColor(id),
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
    >
      {(name?.[0] ?? "?").toUpperCase()}
    </span>
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
      <Wordmark />
      <h1
        className="mt-6 text-[22px] font-semibold tracking-tight"
        style={{ color: "var(--clay-ink)" }}
      >
        {title}
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--clay-muted)" }}>
        {subtitle}
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
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-[12px] py-2 text-[13px] font-medium"
            style={{ color: "var(--clay-muted)" }}
          >
            Cancel
          </button>
        )}
      </form>
    </Shell>
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
    <Shell>
      <Wordmark />
      <div className="mt-6 flex items-start justify-between gap-3">
        <div>
          <h1
            className="text-[22px] font-semibold tracking-tight"
            style={{ color: "var(--clay-ink)" }}
          >
            Who's this?
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--clay-muted)" }}>
            {manage ? "Tap a name to remove them." : "Tap your name to continue."}
          </p>
        </div>
        <button
          onClick={() => {
            setManage((v) => !v);
            setPending(null);
            setError(null);
          }}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
          style={{ color: "var(--clay-accent)", background: "var(--clay-accent-soft)" }}
        >
          {manage ? "Done" : "Manage"}
        </button>
      </div>

      <section
        className="mt-5 overflow-hidden rounded-[14px] bg-white"
        style={{ border: "1px solid var(--clay-border)" }}
      >
        <ul>
          {members.map((m, idx) => (
            <li
              key={m.id}
              style={{ borderTop: idx === 0 ? "none" : "1px solid var(--clay-border)" }}
            >
              <button
                onClick={() => (manage ? setPending(m) : onPick(m))}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-[color:var(--clay-bg)]"
              >
                <Avatar name={m.name} id={m.id} />
                <span
                  className="flex-1 text-[15px] font-medium"
                  style={{ color: "var(--clay-ink)" }}
                >
                  {m.name}
                </span>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: manage ? "#B0452A" : "var(--clay-muted)" }}
                >
                  {manage ? "Remove" : "›"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!manage && (
        <button
          onClick={onAddAnother}
          className="mt-3 w-full rounded-[14px] bg-white py-3.5 text-[14px] font-medium transition active:scale-[0.99]"
          style={{
            border: "1px dashed var(--clay-border)",
            color: "var(--clay-muted)",
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
            className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-xl"
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
              <p className="mt-2 text-sm" style={{ color: "#B0452A" }}>
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPending(null)}
                disabled={busy}
                className="flex-1 rounded-[12px] py-3 text-[14px] font-medium"
                style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
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
                className="flex-1 rounded-[12px] py-3 text-[14px] font-semibold text-white disabled:opacity-60"
                style={{ background: "#B0452A" }}
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
      <Wordmark />
      <div className="mt-8 flex flex-col items-center text-center">
        <Avatar name={member.name} id={member.id} size={64} />
        <h1
          className="mt-4 text-[22px] font-semibold tracking-tight"
          style={{ color: "var(--clay-ink)" }}
        >
          Hi, {member.name}
        </h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--clay-muted)" }}>
          Enter your 4-digit PIN.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="mt-6 rounded-[14px] bg-white p-5 space-y-3"
        style={{ border: "1px solid var(--clay-border)" }}
      >
        <PinInput value={pin} onChange={setPin} autoFocus />
        {error && (
          <p className="text-sm" style={{ color: "#B0452A" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pin.length !== 4 || checking}
          className="w-full rounded-[12px] py-3 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: "var(--clay-accent)" }}
        >
          {checking ? "Checking…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-[12px] py-2 text-[13px] font-medium"
          style={{ color: "var(--clay-muted)" }}
        >
          Not me
        </button>
      </form>
    </Shell>
  );
}
