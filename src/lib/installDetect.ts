// Best-effort detection for the "install as a PWA" gate.

export type InstallEnv = "ios-safari" | "ios-inapp" | "android" | "other";

// Treat as INSTALLED (never gate) if running as a standalone PWA.
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}

// Classify the current browser environment from the user agent (best-effort).
export function detectInstallEnv(): InstallEnv {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";

  // iPadOS 13+ reports as MacIntel with touch — treat as iOS.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
  const isAndroid = /Android/i.test(ua);

  // Common in-app browser signatures (Facebook, Instagram, WhatsApp, etc.).
  const inAppBrowser =
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|Pinterest|LinkedIn|MicroMessenger|Twitter|GSA/i.test(
      ua,
    );

  if (isIOS) {
    // On iOS, only genuine Safari can "Add to Home Screen". Chrome/Firefox/Edge
    // on iOS (CriOS/FxiOS/EdgiOS) and in-app webviews cannot — so anything that
    // isn't clearly standalone Safari is routed to the "open in Safari" guidance.
    const isRealSafari =
      /Safari/i.test(ua) &&
      /Version\//i.test(ua) &&
      !/CriOS|FxiOS|EdgiOS|OPiOS|Mercury/i.test(ua) &&
      !inAppBrowser;
    return isRealSafari ? "ios-safari" : "ios-inapp";
  }

  if (isAndroid) return "android";
  return "other";
}
