import { useState, type FormEvent } from "react";
import { useMember } from "@/lib/member";
import { useAuth } from "@/lib/auth";
import { useHouseholdId } from "@/lib/household";
import { supabase } from "@/lib/supabase";

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { member, updateCurrentName, forgetMember } = useMember();
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" />
        <h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
        <p className="mt-1 text-sm text-neutral-500">Signed in as {member.name}</p>

        <form onSubmit={save} className="mt-5 space-y-3">
          <label className="block text-xs font-medium text-neutral-600">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green-soft)]"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {savedAt && !error && <p className="text-sm text-[var(--accent-green)]">Saved</p>}
          <button
            type="submit"
            disabled={saving || name.trim() === member.name}
            className="w-full rounded-xl bg-[var(--accent-green)] py-3 text-base font-medium text-white transition active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save name"}
          </button>
        </form>

        <div className="mt-6 space-y-2 border-t border-neutral-100 pt-4">
          <button
            onClick={createInvite}
            disabled={inviteLoading || !householdId}
            className="w-full rounded-xl border border-neutral-200 py-3 text-base font-medium text-neutral-800 transition hover:bg-neutral-50 active:scale-[0.99] disabled:opacity-50"
          >
            {inviteLoading ? "Creating link…" : "Invite a family member"}
          </button>

          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}

          {inviteLink && (
            <div className="space-y-2 rounded-xl border border-[var(--accent-green-soft)] bg-[var(--accent-green-soft)]/10 p-3">
              <p className="text-xs text-neutral-600">
                This link lets someone join your family. Valid for 7 days.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
                <span className="flex-1 truncate text-sm text-neutral-700">{inviteLink}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className="flex-1 rounded-lg bg-[var(--accent-green)] py-2 text-sm font-medium text-white transition active:scale-[0.99]"
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
                {typeof navigator !== "undefined" && !!navigator.share && (
                  <button
                    onClick={shareLink}
                    className="flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 active:scale-[0.99]"
                  >
                    Share
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              forgetMember();
              onClose();
            }}
            className="w-full rounded-xl border border-neutral-200 py-3 text-base font-medium text-neutral-800 transition hover:bg-neutral-50"
          >
            Switch member
          </button>
          <button
            onClick={async () => {
              forgetMember();
              await signOut();
            }}
            className="w-full rounded-xl py-3 text-base font-medium text-red-600 transition hover:bg-red-50"
          >
            Log out
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-3 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
