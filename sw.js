// Vault Finance — service worker
// Network-first, cache-fallback: always try to get the latest version when
// online (so a bug fix or new feature isn't hidden behind a stale cache), and
// only fall back to whatever was last cached when there's no connection.
// The cache name below is a PLACEHOLDER: `node release.js` stamps release/sw.js with a name derived from the content, so it changes exactly
// when the app changes (and old caches are evicted). Do not edit it by hand.
const CACHE_NAME = 'vault-finance-8096037a';
const APP_SHELL  = ['./', './index.html', './manifest.webmanifest'];
// Third-party libraries the app depends on at runtime (currently just the Excel
// export library). Cached separately from APP_SHELL and best-effort per-file —
// if the CDN is briefly unreachable during install, that must not prevent the
// core app shell (index.html) from being cached and usable offline.
const CDN_ASSETS = ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // file by file: one missing file (say the manifest) must not stop the app itself from being cached for offline use
      await Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => {})));
      await Promise.all(CDN_ASSETS.map(url => cache.add(url).catch(() => {})));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Network-first, with two guards:
//  • only a SUCCESSFUL answer (res.ok) is ever cached — a 404 or 500 from the host must not replace a good cached copy, or be served offline later (the one exception: the pinned CDN
//    library comes back "opaque" when loaded by a plain <script> tag, so it is cached if it is that exact URL);
//  • a connection that hangs no longer hangs the app: after NETWORK_TIMEOUT_MS the cached copy is used (a server error 5xx falls back to the cache too; a 4xx is the real answer and is returned).
const NETWORK_TIMEOUT_MS = 10000;
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('network timeout')), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}
const cacheable = (req, res) => !!res && (res.ok || (res.type === 'opaque' && CDN_ASSETS.includes(req.url)));
async function networkFirst(event) {
  const req = event.request;
  const fromCache = async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('./index.html') : null);
  try {
    const res = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    if (cacheable(req, res)) { const copy = res.clone(); event.waitUntil(caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {})); return res; }
    if (res.status >= 500) { const c = await fromCache(); if (c) return c; }
    return res;
  } catch (e) {
    // a page may fall back to the cached app; a script, stylesheet or image must not be answered with index.html (the browser would try to run HTML as code) — it simply fails
    return (await fromCache()) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return; // never intercept POST/PUT (e.g. GitHub API writes)
  // Other sites' data — the oil-price relays, the GitHub API, … — is never cached and never answered from the cache: an old answer must not look live, and a failure must
  // look like a failure (offline / timeout) instead of coming back as the app's own index.html. Only this app and its own CDN library are cached.
  if (new URL(event.request.url).origin !== self.location.origin && !CDN_ASSETS.includes(event.request.url)) return;
  event.respondWith(networkFirst(event));
});
