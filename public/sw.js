// Minimal service worker for PWA installability + basic offline resilience.
// Deliberately simple: network-first for navigations (so logged-in/dynamic
// pages always get fresh data when online), falling back to a cached shell
// when offline. Does NOT cache API responses or auth-sensitive data.
const CACHE_NAME = "nqn-shell-v1";
const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

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
