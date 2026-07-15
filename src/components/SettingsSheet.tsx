import { useState, type FormEvent } from "react";
import { Bell, BellOff } from "lucide-react";
import { useMember } from "@/lib/member";
import { useAuth } from "@/lib/auth";
import { useHouseholdId } from "@/lib/household";
import { useAdvancedFeatures } from "@/lib/advancedFeatures";
import { ADVANCED_FEATURES } from "@/lib/advancedFeaturesRegistry";
import { FeedbackViewer } from "./FeedbackViewer";
import { InviteSteps } from "./InviteSteps";
import { JoinFamilyModal } from "./JoinFamilyModal";
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLinkOption, setShowLinkOption] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    localShow,
    setShowAdvanced,
    isOwnerHousehold,
    isFeatureOn,
    setFeatureOn,
    supermarket,
    setSupermarket,
  } = useAdvancedFeatures();
  const [marketBusy, setMarketBusy] = useState(false);
  const [feedbackViewerOpen, setFeedbackViewerOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

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

  const createInviteCode = async () => {
    setCodeLoading(true);
    setCodeError(null);
    setInviteCode(null);
    setCodeCopied(false);
    try {
      const { data, error } = await supabase.functions.invoke("create-invite-code");
      setCodeLoading(false);
      if (error || !data?.code) {
        setCodeError("Couldn't create a code, please try again.");
        return;
      }
      setInviteCode(data.code as string);
    } catch {
      setCodeLoading(false);
      setCodeError("Couldn't create a code, please try again.");
    }
  };

  const copyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      /* ignore */
    }
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
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1rem)]"
        style={{
          background: "var(--clay-bg)",
          border: "1px solid var(--clay-border)",
          WebkitOverflowScrolling: "touch",
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
              className="font-serif text-[24px] leading-tight"
              style={{ color: "var(--clay-ink)", letterSpacing: "-0.01em" }}
            >
              Settings
            </h2>
            <p className="text-[15px]" style={{ color: "var(--clay-muted)" }}>
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
                  className="block text-[16px]"
                  style={{ color: "var(--clay-ink)" }}
                >
                  Push notifications
                </span>
                <span
                  className="block text-[13px]"
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
                className="text-[14px] font-medium"
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
            className="block text-[12px] font-semibold uppercase tracking-[0.08em]"
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
            <p className="text-[15px]" style={{ color: "#B4441F" }}>
              {error}
            </p>
          )}
          {savedAt && !error && (
            <p className="text-[15px]" style={{ color: "var(--clay-success)" }}>
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

        {/* Invite card — code-first */}
        <div
          className="mt-3 space-y-3 rounded-[14px] bg-white p-4"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <div>
            <h3
              className="text-[16px] font-semibold"
              style={{ color: "var(--clay-ink)" }}
            >
              Invite a family member
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: "var(--clay-muted)" }}>
              Get a short code they can type into the app on their phone.
            </p>
          </div>

          <button
            onClick={createInviteCode}
            disabled={codeLoading}
            className="clay-btn-primary"
          >
            {codeLoading
              ? "Creating code…"
              : inviteCode
                ? "Create another code"
                : "Create invite code"}
          </button>

          {codeError && (
            <p className="text-[15px]" style={{ color: "#B4441F" }}>
              {codeError}
            </p>
          )}

          {inviteCode && (
            <div
              className="space-y-3 rounded-xl p-4 text-center"
              style={{
                background: "var(--clay-accent-soft)",
                border: "1px solid var(--clay-border)",
              }}
            >
              <p
                className="font-serif text-[30px] leading-none tracking-[0.08em]"
                style={{ color: "var(--clay-ink)", letterSpacing: "0.12em" }}
              >
                {inviteCode}
              </p>
              <p className="text-[13px]" style={{ color: "var(--clay-muted)" }}>
                Share this code with your family member. It works for one join
                and expires in 7 days.
              </p>
              <button onClick={copyCode} className="clay-btn-primary">
                {codeCopied ? "Copied!" : "Copy code"}
              </button>
            </div>
          )}

          {inviteCode && <InviteSteps code={inviteCode} />}

          <button
            type="button"
            onClick={() => setShowLinkOption((v) => !v)}
            className="text-[13px] font-medium"
            style={{ color: "var(--clay-muted)" }}
          >
            {showLinkOption ? "Hide link option" : "Or share a link instead"}
          </button>

          {showLinkOption && (
            <div className="space-y-2">
              <button
                onClick={createInvite}
                disabled={inviteLoading || !householdId}
                className="clay-btn-secondary"
              >
                {inviteLoading ? "Creating link…" : "Create invite link"}
              </button>

              {inviteError && (
                <p className="text-[15px]" style={{ color: "#B4441F" }}>
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
                  <div
                    className="flex items-center gap-2 rounded-lg bg-white px-3 py-2"
                    style={{ border: "1px solid var(--clay-border)" }}
                  >
                    <span
                      className="flex-1 truncate text-[14px]"
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
          )}
        </div>

        {/* Join a family with a code */}
        <div
          className="mt-3 overflow-hidden rounded-[14px] bg-white"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <SheetRow
            label="Join a family with a code"
            first
            onClick={() => setJoinOpen(true)}
          />
        </div>

        {/* Advanced features */}
        <div
          className="mt-3 space-y-3 rounded-[14px] bg-white p-4"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <div>
            <h3
              className="text-[16px] font-semibold"
              style={{ color: "var(--clay-ink)" }}
            >
              Advanced features
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: "var(--clay-muted)" }}>
              Advanced features are extras that are still settling in. Turn them on
              if you want them, off if you'd rather keep things simple.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!localShow)}
            aria-pressed={localShow}
            className="flex w-full items-center justify-between gap-3"
          >
            <span className="text-[15px]" style={{ color: "var(--clay-ink)" }}>
              Show advanced features
            </span>
            <span
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
              style={{
                background: localShow ? "var(--clay-accent)" : "var(--clay-border)",
              }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full bg-white transition"
                style={{ transform: localShow ? "translateX(22px)" : "translateX(2px)" }}
              />
            </span>
          </button>

          {localShow ? (
            /* Per-feature toggles — subordinate to the master switch */
            <div
              className="ml-2 space-y-2.5 border-l-2 pl-3"
              style={{ borderColor: "var(--clay-border)" }}
            >
              {ADVANCED_FEATURES.map((f) => {
                const on = isFeatureOn(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFeatureOn(f.id, !on)}
                    aria-pressed={on}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px]" style={{ color: "var(--clay-ink)" }}>
                        {f.name}
                      </span>
                      <span
                        className="mt-0.5 block text-[12px] leading-snug"
                        style={{ color: "var(--clay-muted)" }}
                      >
                        {f.description}
                      </span>
                    </span>
                    <span
                      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition"
                      style={{
                        background: on ? "var(--clay-accent)" : "var(--clay-border)",
                      }}
                    >
                      <span
                        className="inline-block h-4 w-4 rounded-full bg-white transition"
                        style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Master off: show what's on offer, no toggles */
            <div
              className="ml-2 space-y-1 border-l-2 pl-3"
              style={{ borderColor: "var(--clay-border)" }}
            >
              {ADVANCED_FEATURES.map((f) => (
                <p key={f.id} className="text-[13px]" style={{ color: "var(--clay-muted)" }}>
                  {f.name}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* My supermarket — shown when the pricing feature is on */}
        {isFeatureOn("pricing") && (
          <div
            className="mt-3 space-y-3 rounded-[14px] bg-white p-4"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <div>
              <h3 className="text-[16px] font-semibold" style={{ color: "var(--clay-ink)" }}>
                My supermarket
              </h3>
              <p className="mt-1 text-[13px]" style={{ color: "var(--clay-muted)" }}>
                Used for price estimates on your list.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { id: "woolworths", name: "Woolworths", note: null },
                { id: "coles", name: "Coles", note: "Coming soon" },
                { id: "aldi", name: "Aldi", note: "Manual prices" },
              ].map((m) => {
                const selected = supermarket === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={marketBusy}
                    onClick={async () => {
                      if (selected) return;
                      setMarketBusy(true);
                      await setSupermarket(m.id);
                      setMarketBusy(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3.5 py-2.5 text-left transition"
                    style={{
                      border: selected
                        ? "1.5px solid var(--clay-accent)"
                        : "1px solid var(--clay-border)",
                      background: selected ? "var(--clay-accent-soft)" : "#FFFFFF",
                    }}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px]" style={{ color: "var(--clay-ink)" }}>
                        {m.name}
                      </span>
                      {m.note && (
                        <span className="text-[12px]" style={{ color: "var(--clay-muted)" }}>
                          {m.note}
                        </span>
                      )}
                    </span>
                    <span
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                      style={{
                        border: selected
                          ? "1.5px solid var(--clay-accent)"
                          : "1.5px solid var(--clay-border)",
                        background: selected ? "var(--clay-accent)" : "transparent",
                      }}
                    >
                      {selected && (
                        <span className="h-[7px] w-[7px] rounded-full bg-white" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Feedback viewer — owner household only (independent of advanced state) */}
        {isOwnerHousehold && (
          <div
            className="mt-3 overflow-hidden rounded-[14px] bg-white"
            style={{ border: "1px solid var(--clay-border)" }}
          >
            <SheetRow
              label="Feedback"
              first
              onClick={() => setFeedbackViewerOpen(true)}
            />
          </div>
        )}

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
              className="w-full rounded-[12px] py-3 text-[14px] font-medium transition"
              style={{ color: "var(--clay-muted)", background: "transparent" }}
            >
              Remove this profile
            </button>
          ) : (
            <div
              className="space-y-2 rounded-[14px] p-4"
              style={{ background: "#FBEDE5", border: "1px solid #E9C7B5" }}
            >
              <p className="text-[15px]" style={{ color: "#7A3520" }}>
                Remove {member.name} from the family? This can't be undone.
              </p>
              {deleteError && (
                <p className="text-[15px]" style={{ color: "#B4441F" }}>
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
            className="w-full rounded-[12px] py-3 text-[14px] font-medium transition"
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

    {feedbackViewerOpen && (
      <FeedbackViewer onClose={() => setFeedbackViewerOpen(false)} />
    )}

    {joinOpen && <JoinFamilyModal onClose={() => setJoinOpen(false)} />}
    </>
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
