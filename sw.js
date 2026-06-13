// KembaliTernak Service Worker v5
// Hanya cache file lokal — CDN dibiarkan load langsung oleh browser

const CACHE_NAME = 'kembali-ternak-v5';
const LOCAL_FILES = [
    './index.html',
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './icons/icon-384x384.png',
];

// CDN origins yang TIDAK diintercepted — biarkan browser handle langsung
const CDN_ORIGINS = [
    'unpkg.com',
    'cdn.jsdelivr.net',
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(LOCAL_FILES.map(f => cache.add(f).catch(() => {})))
        )
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Jangan intercept CDN — biarkan browser load & cache sendiri via HTTP cache
    if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) return;

    // Hanya handle same-origin (file lokal)
    if (url.origin !== self.location.origin) return;

    // Network-first untuk file lokal, fallback ke cache
    event.respondWith(
        fetch(req).then(resp => {
            if (resp && resp.status === 200) {
                caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
            }
            return resp;
        }).catch(() => caches.match(req))
    );
});

// Terima pesan SKIP_WAITING dari update banner
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
