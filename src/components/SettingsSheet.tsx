import { useState, type FormEvent } from "react";
import { Bell, BellOff } from "lucide-react";
import { useMember } from "@/lib/member";
import { useAuth } from "@/lib/auth";
import { useHouseholdId } from "@/lib/household";
import { supabase } from "@/lib/supabase";
import type { NotificationsState } from "@/lib/notifications";

const MEMBER_COLORS = ["#C2693F", "#6F8F5E", "#D38A2E", "#8E6E8A", "#A86A4B", "#5E8A8F"];
function memberColor(id: string | null | undefined) {
  if (!id) return "#C9BBA8";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

export function SettingsSheet({
  onClose,
  notifications,
}: {
  onClose: () => void;
  notifications: NotificationsState;
}) {
  const { member, updateCurrentName, forgetMember, deleteMember } = useMember();
  const { signOut } = useAuth();
  const { householdId } = useHouseholdId();
  const [name, setName] = useState(member?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!member) return null;
  const color = memberColor(member.id);
  const initial = (member.name?.[0] ?? "?").toUpperCase();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await updateCurrentName(name);
    setSaving(false);
    if (error) setError(error);
    else setSavedAt(Date.now());
  };

  const createInvite = async () => {
    if (!householdId) return;
    setInviteLoading(true);
    setInviteError(null);
    setInviteLink(null);
    setCopied(false);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("shopping_family_invites").insert({
      household_id: householdId,
      token,
      expires_at: expiresAt,
    });

    setInviteLoading(false);

    if (error) {
      setInviteError(error.message);
      return;
    }

    setInviteLink(`${window.location.origin}/join?token=${token}`);
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const shareLink = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "Join Our Pantry",
        text: "Join our family shopping list!",
        url: inviteLink,
      });
    }
  };

  const { ready, supported, enabled, needsReregister, busy, turnOn, turnOff } = notifications;

  let notifStatusLabel = "Off";
  if (!supported) notifStatusLabel = "Not supported";
  else if (!ready) notifStatusLabel = "…";
  else if (needsReregister) notifStatusLabel = "Needs re-enable";
  else if (enabled) notifStatusLabel = "On";

  const toggleNotifications = async () => {
    if (busy) return;
    if (enabled) await turnOff();
    else await turnOn();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
        style={{
          background: "var(--clay-bg)",
          border: "1px solid var(--clay-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--clay-border)" }}
        />

        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full text-[16px] font-semibold text-white"
            style={{ background: color }}
          >
            {initial}
          </span>
          <div className="flex-1">
            <h2
              className="font-serif text-[22px] leading-tight"
              style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
            >
              Settings
            </h2>
            <p className="text-[13px]" style={{ color: "var(--clay-muted)" }}>
              Signed in as {member.name}
            </p>
          </div>
        </div>

        {/* Notifications */}
        {supported && (
          <div
            className="mt-4 overflow-hidden rounded-[14px] bg-white"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <button
              onClick={toggleNotifications}
              disabled={busy || !ready}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-[var(--clay-accent-soft)] disabled:opacity-60"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  background: enabled ? "var(--clay-accent-soft)" : "#F1EAE0",
                  color: enabled ? "var(--clay-accent)" : "var(--clay-muted)",
                }}
              >
                {enabled ? <Bell size={16} /> : <BellOff size={16} />}
              </span>
              <span className="flex-1">
                <span
                  className="block text-[15px]"
                  style={{ color: "var(--clay-ink)" }}
                >
                  Push notifications
                </span>
                <span
                  className="block text-[12px]"
                  style={{ color: "var(--clay-muted)" }}
                >
                  {needsReregister
                    ? "Tap to re-enable for this profile"
                    : enabled
                      ? "On — you’ll hear about new items"
                      : "Off"}
                </span>
              </span>
              <span
                className="text-[13px] font-medium"
                style={{ color: enabled ? "var(--clay-accent)" : "var(--clay-muted)" }}
              >
                {notifStatusLabel}
              </span>
            </button>
          </div>
        )}

        {/* Edit name card */}
        <form
          onSubmit={save}
          className="mt-3 space-y-3 rounded-[14px] bg-white p-4"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <label
            className="block text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            Your name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="clay-input"
          />
          {error && (
            <p className="text-sm" style={{ color: "#B4441F" }}>
              {error}
            </p>
          )}
          {savedAt && !error && (
            <p className="text-sm" style={{ color: "var(--clay-success)" }}>
              Saved
            </p>
          )}
          <button
            type="submit"
            disabled={saving || name.trim() === member.name}
            className="clay-btn-primary"
          >
            {saving ? "Saving…" : "Save name"}
          </button>
        </form>

        {/* Invite card */}
        <div
          className="mt-3 space-y-2 rounded-[14px] bg-white p-4"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <button
            onClick={createInvite}
            disabled={inviteLoading || !householdId}
            className="clay-btn-secondary"
          >
            {inviteLoading ? "Creating link…" : "Invite a family member"}
          </button>

          {inviteError && (
            <p className="text-sm" style={{ color: "#B4441F" }}>
              {inviteError}
            </p>
          )}

          {inviteLink && (
            <div
              className="space-y-2 rounded-xl p-3"
              style={{
                background: "var(--clay-accent-soft)",
                border: "1px solid var(--clay-border)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--clay-muted)" }}>
                This link lets someone join your family. Valid for 7 days.
              </p>
              <div
                className="flex items-center gap-2 rounded-lg bg-white px-3 py-2"
                style={{ border: "1px solid var(--clay-border)" }}
              >
                <span
                  className="flex-1 truncate text-[13px]"
                  style={{ color: "var(--clay-ink)" }}
                >
                  {inviteLink}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={copyLink} className="clay-btn-primary flex-1">
                  {copied ? "Copied!" : "Copy link"}
                </button>
                {typeof navigator !== "undefined" && !!navigator.share && (
                  <button onClick={shareLink} className="clay-btn-secondary flex-1">
                    Share
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Switch member */}
        <div
          className="mt-3 overflow-hidden rounded-[14px] bg-white"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <SheetRow
            label="Switch member"
            first
            onClick={() => {
              forgetMember();
              onClose();
            }}
          />
        </div>

        {/* Quieter destructive group */}
        <div className="mt-6 space-y-2">
          {!confirmDelete ? (
            <button
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
              className="w-full rounded-[12px] py-3 text-[13px] font-medium transition"
              style={{ color: "var(--clay-muted)", background: "transparent" }}
            >
              Remove this profile
            </button>
          ) : (
            <div
              className="space-y-2 rounded-[14px] p-4"
              style={{ background: "#FBEDE5", border: "1px solid #E9C7B5" }}
            >
              <p className="text-[14px]" style={{ color: "#7A3520" }}>
                Remove {member.name} from the family? This can't be undone.
              </p>
              {deleteError && (
                <p className="text-sm" style={{ color: "#B4441F" }}>
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="clay-btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setDeleting(true);
                    const { error } = await deleteMember(member.id);
                    setDeleting(false);
                    if (error) {
                      setDeleteError(error);
                      return;
                    }
                    onClose();
                  }}
                  disabled={deleting}
                  className="flex-1 rounded-xl py-3 text-[15px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "#B4441F" }}
                >
                  {deleting ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={async () => {
              forgetMember();
              await signOut();
            }}
            className="w-full rounded-[12px] py-3 text-[13px] font-medium transition"
            style={{ color: "var(--clay-muted)", background: "transparent" }}
          >
            Log out
          </button>
        </div>

        <button onClick={onClose} className="clay-btn-ghost mt-3">
          Close
        </button>
      </div>
    </div>
  );
}

function SheetRow({
  label,
  onClick,
  subtle,
  first,
}: {
  label: string;
  onClick: () => void;
  subtle?: boolean;
  first?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[15px] transition active:bg-[var(--clay-accent-soft)]"
      style={{
        color: subtle ? "var(--clay-muted)" : "var(--clay-ink)",
        borderTop: first ? "none" : "1px solid var(--clay-border)",
      }}
    >
      <span>{label}</span>
      <span style={{ color: "var(--clay-muted)" }}>›</span>
    </button>
  );
}
