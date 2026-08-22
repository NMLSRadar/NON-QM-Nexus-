"use client";

import { useEffect } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes while the tab/app is visible

export function hasActiveBuildReloadBlocker(root: ParentNode = document): boolean {
  return root.querySelector('[data-block-build-reload="true"]') !== null;
}

/**
 * Self-heals an installed PWA session that's been left running across a
 * new deploy. History: this app's pages are all `force-dynamic` and rely on
 * live data (scenarios, lender tiers, pricing); an already-open session
 * that never re-navigates keeps running whatever JS bundle was loaded when
 * it was opened — a real, already-installed app can sit backgrounded/
 * suspended for a long time, so users could keep hitting a fixed bug (or
 * missing a new feature) indefinitely without ever knowing a fix had
 * already shipped. This checks the server's actual current build id
 * (via /api/version, always a fresh network request — never cached) and
 * forces one hard reload if it no longer matches the build id baked into
 * the JS that's currently running, so a shipped fix reaches an
 * already-open session within one check cycle instead of requiring the
 * user to manually force-quit/reopen (or worse, uninstall/reinstall) the
 * app themselves.
 */
export function BuildVersionGuard() {
  useEffect(() => {
    const builtSha = process.env.NEXT_PUBLIC_BUILD_SHA;
    if (!builtSha) return;

    let reloaded = false;
    async function check() {
      if (reloaded || document.visibilityState !== "visible" || hasActiveBuildReloadBlocker()) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { sha: string | null };
        // Re-check after the request: the user may have started dictating or
        // typing while the version request was in flight. Active work must
        // never be destroyed by a background deployment refresh.
        if (data.sha && data.sha !== builtSha && !hasActiveBuildReloadBlocker()) {
          reloaded = true;
          window.location.reload();
        }
      } catch {
        // Offline or a transient network hiccup — never block the app on this.
      }
    }

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return null;
}
