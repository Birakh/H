// Vault Finance — service worker
// Network-first, cache-fallback: always try to get the latest version when
// online (so a bug fix or new feature isn't hidden behind a stale cache), and
// only fall back to whatever was last cached when there's no connection.
// Bump CACHE_NAME whenever you want to force old caches to be evicted.
const CACHE_NAME = 'vault-finance-v1';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {}) // don't fail install if a shell asset is briefly unreachable
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return; // never intercept POST/PUT (e.g. GitHub API writes)

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('./index.html'))
      )
  );
});
