/* MFP · Service Worker
   Sube VERSION cada vez que publiques cambios para que los usuarios reciban la actualización. */
const VERSION = 'mfp-v1.0.9';
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const PRECACHE = [
  '/', '/index.html', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png',
  '/apple-touch-icon.png', '/favicon-32.png'
];

// Librerías de CDN que se guardan al primer uso (stale-while-revalidate)
const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
// Mapa y modelos faciales: cache-first (pesados y estáticos)
const TILE_HOSTS = ['tile.openstreetmap.org'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navegación: red primero, con respaldo offline al index
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL); c.put('/index.html', fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match('/index.html')) || (await caches.match('/'));
      }
    })());
    return;
  }

  // Mismo origen: cache primero, actualiza en segundo plano
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }

  // APIs dinámicas (clima, divisas, geolocalización IP, direcciones): siempre red, sin caché
  // open-meteo, er-api, frankfurter, ipwho.is, nominatim → se dejan pasar tal cual.

  // Librerías CDN y teselas del mapa
  if (CDN_HOSTS.includes(url.hostname) || url.hostname.endsWith('githubusercontent.com') ||
      TILE_HOSTS.some(h => url.hostname.endsWith(h))) {
    e.respondWith(staleWhileRevalidate(req, RUNTIME));
  }
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || net;
}
