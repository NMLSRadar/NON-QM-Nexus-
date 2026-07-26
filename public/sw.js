// Minimal service worker — exists ONLY so the site is installable as a PWA
// (a manifest + a registered service worker is what the install prompt
// requires). It intentionally does NOT cache or intercept page navigations
// at all anymore.
//
// History: an earlier version network-first-cached navigation HTML as an
// offline fallback. That repeatedly caused real, hard-to-diagnose bugs for
// installed-app users — Next.js references its JS bundles by a content
// hash that changes on every deploy, so any cached HTML from before a
// deploy points at chunk files that no longer exist. When that stale
// shell got served (even only as a fallback), the page would visually
// render but never hydrate, so every button on it silently did nothing.
// Bumping the cache version and no longer pre-caching "/" reduced how
// often this happened, but did not eliminate it: users who hadn't done a
// fresh cold-start since a deploy could still hit a stale cached copy.
// Every page in this app is `force-dynamic` and needs live data anyway
// (scenarios, lender tiers, pricing) — an offline shell has little real
// value here, so the fix is to just never cache navigations at all. Any
// existing installed client's old navigation cache is purged on activate.
const CACHE_NAME = "nqn-shell-v3";
const SHELL_URLS = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() =>
      caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
    )
  );
  self.clients.claim();
});

// No fetch handler: every request (including page navigations) passes
// straight through to the network untouched, exactly as if there were no
// service worker at all. Nothing is ever cached or served stale.
