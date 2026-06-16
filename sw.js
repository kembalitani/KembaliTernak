// KembaliTernak Service Worker v9
// v9: Ganti strategi lokal ke cache-first + background revalidation
//     agar app bisa dibuka offline tanpa ERR_FAILED.
//     Update tetap jalan: SW baru install di background, banner muncul saat siap.

const CACHE_NAME = 'kembali-ternak-v9';

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
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
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

    const url = new URL(req.url);
    const isCDN = url.origin !== self.location.origin;

    // Semua resource: cache-first, update cache di background (stale-while-revalidate)
    // Ini memastikan app selalu bisa dibuka offline.
    // Update konten didapat via mekanisme SW baru (install → waiting → user konfirmasi).
    event.respondWith(
        caches.match(req).then(cached => {
            const networkFetch = fetch(req).then(resp => {
                if (resp && resp.status === 200) {
                    caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
                }
                return resp;
            }).catch(() => null);

            // Ada di cache → langsung serve, fetch di background
            if (cached) {
                networkFetch; // background update, tidak ditunggu
                return cached;
            }
            // Belum ada di cache (first load online) → tunggu network
            return networkFetch.then(resp => resp || new Response('Offline', { status: 503 }));
        })
    );
});

// Terima pesan SKIP_WAITING dari update banner
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
