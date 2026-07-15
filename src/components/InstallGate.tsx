import { useEffect, useState, type ReactNode } from "react";
import { INSTALL_GATE_MODE } from "@/lib/installGateConfig";
import { useAdvancedFeatures } from "@/lib/advancedFeatures";
import { isInstalled, detectInstallEnv, type InstallEnv } from "@/lib/installDetect";

// Wraps the app. When triggered, it REPLACES the app UI with a full-screen
// "install to Home Screen" guide. Installed users and mode "off" are never gated.
// During the safe rollout (mode "advanced-only") only advanced-unlocked users
// see the block, since it reads useAdvancedFeatures().showAdvanced.
//
// Platform matters: the gate only makes sense on phones (iOS Safari, Android
// Chrome), where "add to Home Screen" gives an app icon + notifications. DESKTOP
// — and ANY unrecognised/ambiguous platform — is deliberately never gated: there
// is no Home-Screen step to follow there, and blocking desktop would also kill
// the desktop-only "Copy for Woolies" flow. We err toward letting people in.
export function InstallGate({ children }: { children: ReactNode }) {
  const { showAdvanced } = useAdvancedFeatures();
  const [installed] = useState<boolean>(() => isInstalled());
  const [env] = useState<InstallEnv>(() => detectInstallEnv());

  if (INSTALL_GATE_MODE === "off") return <>{children}</>;
  if (installed) return <>{children}</>;

  // Desktop / unknown ("other") → let them straight in, no wall.
  if (env === "other") return <>{children}</>;

  const shouldGate =
    INSTALL_GATE_MODE === "everyone" ||
    (INSTALL_GATE_MODE === "advanced-only" && showAdvanced);

  if (!shouldGate) return <>{children}</>;
  // Only iOS (ios-safari / ios-inapp) and Android reach here.
  return <InstallGateScreen env={env} />;
}

function InstallGateScreen({ env }: { env: InstallEnv }) {
  const [copied, setCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<
    (Event & { prompt: () => void; userChoice: Promise<unknown> }) | null
  >(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(
        e as Event & { prompt: () => void; userChoice: Promise<unknown> },
      );
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* ignore */
    }
    setDeferredPrompt(null);
  };

  return (
    <div
      className="min-h-[100dvh] w-full overflow-y-auto"
      style={{ background: "var(--clay-bg)", color: "var(--clay-ink)" }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6 py-10">
        {/* Wordmark + intro */}
        <div className="text-center">
          <div
            className="font-display text-[34px] leading-none"
            style={{ color: "var(--clay-ink)", letterSpacing: "-0.015em" }}
          >
            Our Pantry
          </div>
          <h1
            className="font-display mt-5 text-[24px] leading-tight"
            style={{ color: "var(--clay-ink)" }}
          >
            Add Our Pantry to your Home Screen to get started
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--clay-muted)" }}>
            Our Pantry runs as an app on your Home Screen. To use it, add it using
            the steps below — it only takes a few seconds.
          </p>
        </div>

        {/* Environment-specific guidance */}
        <div className="mt-7">
          {env === "ios-safari" && <IosSafariSteps />}
          {env === "ios-inapp" && (
            <IosInAppSteps copied={copied} onCopy={copyLink} />
          )}
          {env === "android" && (
            <AndroidSteps
              canInstall={!!deferredPrompt}
              onInstall={triggerInstall}
            />
          )}
        </div>

      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[16px] bg-white p-5"
      style={{ border: "1px solid var(--clay-border)" }}
    >
      {children}
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
            style={{ background: "var(--clay-accent)" }}
          >
            {i + 1}
          </span>
          <span className="pt-0.5 text-[15px] leading-snug" style={{ color: "var(--clay-ink)" }}>
            {item}
          </span>
        </li>
      ))}
    </ol>
  );
}

function IosSafariSteps() {
  return (
    <Card>
      <h2 className="mb-3 text-[16px] font-semibold" style={{ color: "var(--clay-ink)" }}>
        Add to your Home Screen
      </h2>
      <Steps
        items={[
          <>Tap the <strong>Share</strong> button (the square with an arrow) — it's at the bottom of the screen in Safari.</>,
          <>Scroll down and tap <strong>Add to Home Screen</strong>.</>,
          <>Tap <strong>Add</strong> in the top-right.</>,
          <>Open Our Pantry from your new Home Screen icon.</>,
        ]}
      />
      <div className="mt-4 flex justify-center" aria-hidden>
        <span className="text-[13px]" style={{ color: "var(--clay-muted)" }}>
          ↓ Look for the Share button below
        </span>
      </div>
    </Card>
  );
}

function IosInAppSteps({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <Card>
      <h2 className="mb-2 text-[17px] font-semibold" style={{ color: "var(--clay-accent)" }}>
        Let's open this in Safari first
      </h2>
      <p className="text-[15px] leading-snug" style={{ color: "var(--clay-ink)" }}>
        To use Our Pantry, you'll need to open it in Safari first, then add it to
        your Home Screen. It looks like you're currently inside another app.
      </p>
      <p className="mt-3 text-[15px] leading-snug" style={{ color: "var(--clay-ink)" }}>
        Tap the <strong>•••</strong> or the <strong>Safari / compass</strong> icon in
        the corner and choose <strong>Open in Safari</strong>. (The exact button
        varies a little from app to app.)
      </p>
      <div className="mt-4">
        <button type="button" onClick={onCopy} className="clay-btn-primary">
          {copied ? "Link copied!" : "Copy link"}
        </button>
        <p className="mt-2 text-[13px]" style={{ color: "var(--clay-muted)" }}>
          {copied
            ? "Link copied — now open Safari and paste it in the address bar."
            : "Can't find it? Copy the link, then open Safari and paste it in."}
        </p>
      </div>
    </Card>
  );
}

function AndroidSteps({
  canInstall,
  onInstall,
}: {
  canInstall: boolean;
  onInstall: () => void;
}) {
  return (
    <Card>
      <h2 className="mb-2 text-[16px] font-semibold" style={{ color: "var(--clay-ink)" }}>
        Add to your Home screen
      </h2>
      <p className="mb-3 text-[15px] leading-snug" style={{ color: "var(--clay-ink)" }}>
        To use Our Pantry, add it to your Home Screen using the steps below.
      </p>
      <Steps
        items={[
          <>Tap the <strong>menu (⋮)</strong> in the top-right of Chrome.</>,
          <>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</>,
          <>Confirm with <strong>Add</strong>.</>,
          <>Open Our Pantry from your Home screen.</>,
        ]}
      />
      {canInstall && (
        <div className="mt-4">
          <button type="button" onClick={onInstall} className="clay-btn-primary">
            Install Our Pantry
          </button>
        </div>
      )}
    </Card>
  );
}
