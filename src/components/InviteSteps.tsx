import { useState } from "react";

// Step-by-step "how to join" tutorial shown beneath a generated invite code, so
// the inviter can see/share exactly what the recipient must do. Reused in the
// Settings invite card and the Input-screen invite modal.
export function InviteSteps({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const steps: string[] = [
    "Open Our Pantry — they'll be guided to add it to their Home Screen.",
    "Create an account (or just open the app if they already have one).",
    'When asked, choose "Join a family" — or go to Settings → "Join a family with a code" any time.',
    `Enter this code: ${code}`,
    "They'll set their name and PIN, and land in your shared pantry.",
  ];

  const copyMessage = async () => {
    const msg =
      `Join our Our Pantry shopping list! Here's how:\n\n` +
      `1. Open Our Pantry and add it to your Home Screen.\n` +
      `2. Create an account (or open the app if you already have one).\n` +
      `3. Choose "Join a family" (or Settings → "Join a family with a code").\n` +
      `4. Enter this code: ${code}\n` +
      `5. Set your name and PIN — you'll land in our shared pantry.`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="rounded-xl bg-white p-3.5 text-left"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      <p
        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--clay-muted)" }}
      >
        How your family member joins
      </p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug" style={{ color: "var(--clay-ink)" }}>
            <span className="font-semibold" style={{ color: "var(--clay-accent)" }}>
              {i + 1}.
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={copyMessage}
        className="clay-btn-secondary mt-3"
      >
        {copied ? "Copied!" : "Copy steps + code"}
      </button>
    </div>
  );
}
