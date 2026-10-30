// sw.js — Service Worker: guarda la app en caché para que funcione SIN internet.
// Cuando cambies cualquier archivo, sube el número de versión para que el iPhone se actualice.
const VERSION = 'bitacora-v1.1.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/ui.js',
  './js/icons.js',
  './js/utils.js',
  './js/seed.js',
  './js/photos.js',
  './js/export.js',
  './js/report-pdf.js',
  './js/views/bitacora.js',
  './js/views/registro.js',
  './js/views/proyectos.js',
  './js/views/informes.js',
  './js/views/ajustes.js',
  './vendor/pdf-lib.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './img/logo-empresa.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Estrategia: caché primero (instantáneo y offline); si no está, red y se guarda.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
