import { useState, type FormEvent } from "react";
import { useMember } from "@/lib/member";
import { useAuth } from "@/lib/auth";
import { useHouseholdId } from "@/lib/household";
import { supabase } from "@/lib/supabase";

const MEMBER_COLORS = ["#C2693F", "#6F8F5E", "#D38A2E", "#8E6E8A", "#A86A4B", "#5E8A8F"];
function memberColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

export function ProfileSheet({ onClose }: { onClose: () => void }) {
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

    const link = `${window.location.origin}/join?token=${token}`;
    setInviteLink(link);
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-xl"
        style={{ background: "var(--clay-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--clay-border)" }}
        />

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-[18px] font-semibold text-white"
            style={{ background: memberColor(member.id) }}
          >
            {(member.name?.[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold" style={{ color: "var(--clay-ink)" }}>
              {member.name}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
              Signed in
            </p>
          </div>
        </div>

        {/* Edit name card */}
        <form
          onSubmit={save}
          className="rounded-[14px] bg-white p-4 space-y-2.5"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--clay-muted)" }}
          >
            Your name
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="w-full rounded-[10px] bg-white px-3.5 py-3 text-[16px] outline-none"
            style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
          />
          {error && (
            <p className="text-sm" style={{ color: "#B0452A" }}>
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
            className="w-full rounded-[12px] py-2.5 text-[14px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
            style={{ background: "var(--clay-accent)" }}
          >
            {saving ? "Saving…" : "Save name"}
          </button>
        </form>

        {/* Invite card */}
        <div
          className="mt-3 rounded-[14px] bg-white p-4 space-y-2.5"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <button
            onClick={createInvite}
            disabled={inviteLoading || !householdId}
            className="w-full rounded-[12px] py-2.5 text-[14px] font-semibold transition active:scale-[0.99] disabled:opacity-50"
            style={{
              background: "var(--clay-accent-soft)",
              color: "var(--clay-accent)",
            }}
          >
            {inviteLoading ? "Creating link…" : "Invite a family member"}
          </button>

          {inviteError && (
            <p className="text-sm" style={{ color: "#B0452A" }}>
              {inviteError}
            </p>
          )}

          {inviteLink && (
            <div className="space-y-2">
              <p className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
                Valid for 7 days.
              </p>
              <div
                className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2"
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
                <button
                  onClick={copyLink}
                  className="flex-1 rounded-[10px] py-2 text-[13px] font-semibold text-white transition active:scale-[0.99]"
                  style={{ background: "var(--clay-accent)" }}
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
                {typeof navigator !== "undefined" && !!navigator.share && (
                  <button
                    onClick={shareLink}
                    className="flex-1 rounded-[10px] py-2 text-[13px] font-medium transition active:scale-[0.99]"
                    style={{
                      border: "1px solid var(--clay-border)",
                      color: "var(--clay-ink)",
                    }}
                  >
                    Share
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions list card */}
        <section
          className="mt-3 overflow-hidden rounded-[14px] bg-white"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <RowButton
            label="Switch member"
            isFirst
            onClick={() => {
              forgetMember();
              onClose();
            }}
          />
          <RowButton
            label="Log out"
            muted
            onClick={async () => {
              forgetMember();
              await signOut();
            }}
          />
        </section>

        {!confirmDelete ? (
          <button
            onClick={() => {
              setDeleteError(null);
              setConfirmDelete(true);
            }}
            className="mt-3 w-full rounded-[12px] py-2.5 text-[13px] font-medium"
            style={{ color: "var(--clay-muted)" }}
          >
            Remove this profile
          </button>
        ) : (
          <div
            className="mt-3 space-y-2 rounded-[14px] p-3"
            style={{ border: "1px solid #E8C8B8", background: "#FBEDE3" }}
          >
            <p className="text-[13px]" style={{ color: "var(--clay-ink)" }}>
              Remove {member.name} from the family? This can't be undone.
            </p>
            {deleteError && (
              <p className="text-sm" style={{ color: "#B0452A" }}>
                {deleteError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-[10px] bg-white py-2 text-[13px] font-medium"
                style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
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
                className="flex-1 rounded-[10px] py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                style={{ background: "#B0452A" }}
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-[12px] py-2.5 text-[13px] font-medium"
          style={{ color: "var(--clay-muted)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function RowButton({
  label,
  onClick,
  muted,
  isFirst,
}: {
  label: string;
  onClick: () => void;
  muted?: boolean;
  isFirst?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[14px] font-medium transition active:bg-[color:var(--clay-bg)]"
      style={{
        color: muted ? "var(--clay-muted)" : "var(--clay-ink)",
        borderTop: isFirst ? "none" : "1px solid var(--clay-border)",
      }}
    >
      <span>{label}</span>
      <span style={{ color: "var(--clay-muted)" }}>›</span>
    </button>
  );
}
