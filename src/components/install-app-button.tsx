"use client";

import { useEffect, useRef, useState } from "react";
import { Share, PlusSquare, X } from "lucide-react";

/** Minimal shape of the `beforeinstallprompt` event — not yet in lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallEventName =
  | "prompt_shown"
  | "prompt_accepted"
  | "prompt_dismissed"
  | "installed"
  | "ios_instructions_shown"
  | "ios_instructions_dismissed";

/** Best-effort install-funnel analytics — never blocks or throws into the UI. */
function trackInstallEvent(event: InstallEventName, platform: "android_desktop" | "ios") {
  fetch("/api/pwa/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, platform }),
  }).catch(() => undefined);
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isClassicIos = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  // iPadOS 13+ reports as "MacIntel" with touch support — the only reliable
  // way to tell it apart from an actual Mac.
  const isIpadOsDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isClassicIos || isIpadOsDesktopMode;
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Install App CTA — two mutually exclusive paths, both self-hiding once the
 * app is already installed:
 *  - Android/desktop Chrome/Edge: waits for the native `beforeinstallprompt`
 *    event (absent on any browser/OS that doesn't support it, so the button
 *    naturally never renders there) and triggers the real install dialog.
 *  - iOS (Safari and other WebKit browsers, which never fire
 *    `beforeinstallprompt` or `appinstalled`): shows a lightweight
 *    "Add to Home Screen" walkthrough instead, since there's no native
 *    prompt to trigger.
 * Every step of both funnels is logged via trackInstallEvent for the admin
 * install-analytics view.
 */
export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const shownTracked = useRef(false);
  const guideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setInstalled(isStandaloneDisplay());
    setIsIos(isIosDevice());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      if (!shownTracked.current) {
        shownTracked.current = true;
        trackInstallEvent("prompt_shown", "android_desktop");
      }
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      trackInstallEvent("installed", "android_desktop");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Close the iOS guide popover on an outside click.
  useEffect(() => {
    if (!showIosGuide) return;
    const onClick = (event: MouseEvent) => {
      if (guideRef.current && !guideRef.current.contains(event.target as Node)) {
        setShowIosGuide(false);
        trackInstallEvent("ios_instructions_dismissed", "ios");
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showIosGuide]);

  if (installed) return null;

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    trackInstallEvent(outcome === "accepted" ? "prompt_accepted" : "prompt_dismissed", "android_desktop");
    if (outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  const ctaClass =
    "gold-cta-glow shrink-0 rounded-full bg-gradient-to-r from-amber-300 to-amber-600 px-4 py-1.5 text-xs font-semibold tracking-wide text-black shadow-md transition hover:shadow-lg hover:brightness-110 sm:text-sm";

  if (isIos) {
    return (
      <div ref={guideRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            const next = !showIosGuide;
            setShowIosGuide(next);
            if (next) trackInstallEvent("ios_instructions_shown", "ios");
            else trackInstallEvent("ios_instructions_dismissed", "ios");
          }}
          className={ctaClass}
        >
          Install App
        </button>
        {showIosGuide ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-amber-500/30 bg-black/95 p-4 text-left text-white shadow-2xl backdrop-blur">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-sm font-semibold gold-text-gradient">Add to Home Screen</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setShowIosGuide(false);
                  trackInstallEvent("ios_instructions_dismissed", "ios");
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-2 text-xs text-slate-200">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-300">
                  1
                </span>
                Tap the Share icon <Share className="inline h-3.5 w-3.5 text-amber-300" /> in Safari&apos;s toolbar
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-300">
                  2
                </span>
                Scroll down and tap <PlusSquare className="inline h-3.5 w-3.5 text-amber-300" /> &quot;Add to Home Screen&quot;
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-300">
                  3
                </span>
                Tap &quot;Add&quot; in the top-right corner
              </li>
            </ol>
          </div>
        ) : null}
      </div>
    );
  }

  if (!installEvent) return null;

  return (
    <button type="button" onClick={handleInstall} className={ctaClass}>
      Install App
    </button>
  );
}
