// OfficeLink SL — Service Worker (PWA offline + cache strategy)
const CACHE_VERSION = 4;
const CACHE_NAME = `officelink-v${CACHE_VERSION}`;
const STATIC_CACHE = `officelink-static-v${CACHE_VERSION}`;

// Essential resources to pre-cache for offline usage
// NOTE: Vite-built JS/CSS assets have hashed filenames and are cached on first fetch
// via the stale-while-revalidate strategy below.
const PRECACHE_URLS = [
  './',
  './index.html',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Skip non-http(s) requests (e.g. chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // Skip cross-origin analytics / tracking
  if (url.hostname.includes('google-analytics.com') || url.hostname.includes('googletagmanager.com')) return;

  // Cache-first for static assets (fonts, images, icons)
  if (/\.(woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 503 }))
      )
    );
    return;
  }

  // Cache-first for CDN requests (Three.js, KaTeX, highlight.js, etc.)
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('unpkg.com')) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Cache-first for Vite hashed assets (assets/chunk-AbCd1234.js)
  // These are immutable — the hash guarantees content hasn't changed
  if (url.pathname.includes('/assets/') && /\.[a-f0-9]{8,}\.(js|css)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Stale-while-revalidate for other JS/CSS (non-hashed dev mode files)
  if (/\.(js|css)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached || new Response('Offline', { status: 503 }));

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Network-first for HTML and other app resources
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) =>
        cached || (url.pathname.endsWith('/') || url.pathname.endsWith('.html')
          ? caches.match('./index.html')
          : new Response('Offline', { status: 503 }))
      ))
  );
});

// Handle messages from app
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'clearCache') {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
  // Notify clients when a new version is available
  if (e.data === 'checkUpdate') {
    self.registration.update();
  }
});
