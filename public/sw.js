// OfficeLink SL — Service Worker (PWA offline + cache strategy)
const CACHE_NAME = 'officelink-v3';
const STATIC_CACHE = 'officelink-static-v3';

// Essential resources to pre-cache for offline usage
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

  // Cache-first for CDN requests (Three.js, libraries)
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Stale-while-revalidate for JS/CSS bundles
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
});
