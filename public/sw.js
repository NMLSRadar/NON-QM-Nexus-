// Minimal service worker for PWA installability + basic offline resilience.
// Deliberately simple: network-first for navigations (so logged-in/dynamic
// pages always get fresh data when online), falling back to a cached shell
// when offline. Does NOT cache API responses or auth-sensitive data.
//
// IMPORTANT: never pre-cache the "/" (or any) HTML page at install time.
// Next.js references its JS bundles by a content hash that changes on every
// deploy; an HTML shell cached from an old install/deploy points at chunk
// files that no longer exist once a new version ships, so serving that
// stale shell (even only as an offline fallback) can leave an already-
// installed PWA with a page that *renders* but never hydrates — every
// button on it silently does nothing, because React itself never loaded.
// Only truly static, deploy-independent assets (manifest, icons) are safe
// to pre-cache; the navigation cache below is populated/refreshed lazily
// from real network responses instead, so it can never be older than the
// user's last successful online visit.
const CACHE_NAME = "nqn-shell-v2";
const SHELL_URLS = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Only handle same-origin navigations; let everything else (API calls,
  // Supabase, cross-origin assets) pass straight through untouched.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/")))
  );
});
