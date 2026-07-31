"use client";

import { useEffect, useState } from "react";

/** Minimal shape of the `beforeinstallprompt` event — not yet in lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** Renders nothing until Chrome/Edge (desktop or Android) fires
 * `beforeinstallprompt` — that only happens when the site is NOT already
 * installed and the browser supports the native install flow, so the button
 * is naturally absent on iOS Safari (no such event exists there) and on any
 * browser session that's already running as the installed app. Also hides
 * itself immediately on `appinstalled`, and re-checks display-mode so a
 * user who installs in one tab doesn't keep seeing the CTA in another. */
export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's own standalone flag — no beforeinstallprompt there, but
      // this keeps the check consistent if this component is ever reused.
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(isStandalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed || !installEvent) return null;

  const handleInstall = async () => {
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    // Whether accepted or dismissed, this specific prompt instance can only
    // be used once — clear it either way. If dismissed, the browser may
    // fire a fresh beforeinstallprompt on a later visit.
    if (outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="gold-cta-glow shrink-0 rounded-full bg-gradient-to-r from-amber-300 to-amber-600 px-4 py-1.5 text-xs font-semibold tracking-wide text-black shadow-md transition hover:shadow-lg hover:brightness-110 sm:text-sm"
    >
      Install App
    </button>
  );
}
