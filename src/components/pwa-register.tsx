"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker so the site is installable as a PWA.
 * Also explicitly checks for a newer service-worker file on every load —
 * browsers only re-check for SW updates periodically (often ~24h) on their
 * own, so an already-installed PWA could otherwise keep running a stale
 * worker (and any stale cached shell it created) for a long time after a
 * new deploy ships. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => undefined);
      })
      .catch(() => {
        // Non-fatal — the site still works fully without the service worker,
        // it just won't get offline-shell caching.
      });
  }, []);

  return null;
}
