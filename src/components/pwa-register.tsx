"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker so the site is installable as a PWA. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal — the site still works fully without the service worker,
      // it just won't get offline-shell caching.
    });
  }, []);

  return null;
}
