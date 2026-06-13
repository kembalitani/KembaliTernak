// KembaliTernak Service Worker v6
// Cache lokal + CDN libraries untuk full offline support

const CACHE_NAME = 'kembali-ternak-v6';

const LOCAL_FILES = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './icons/icon-384x384.png',
];

const CDN_FILES = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/@phosphor-icons/web',
    'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap',
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            // Cache lokal files dulu, CDN boleh gagal (akan di-cache saat pertama load)
            Promise.allSettled([
                ...LOCAL_FILES.map(f => cache.add(f).catch(() => {})),
                ...CDN_FILES.map(f => cache.add(f).catch(() => {})),
            ])
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

    // Strategi: Cache-first untuk CDN, Network-first untuk lokal
    const url = new URL(req.url);
    const isCDN = url.origin !== self.location.origin;

    if (isCDN) {
        // CDN: cache-first (kalau ada di cache, pakai. kalau tidak, fetch & simpan)
        event.respondWith(
            caches.match(req).then(cached => {
                if (cached) return cached;
                return fetch(req).then(resp => {
                    if (resp && resp.status === 200) {
                        caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
                    }
                    return resp;
                }).catch(() => cached); // kalau fetch gagal & tidak ada cache → null
            })
        );
    } else {
        // Lokal: network-first, fallback ke cache
        event.respondWith(
            fetch(req).then(resp => {
                if (resp && resp.status === 200) {
                    caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
                }
                return resp;
            }).catch(() => caches.match(req))
        );
    }
});

// Terima pesan SKIP_WAITING dari update banner
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
