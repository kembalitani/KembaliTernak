// KembaliTernak Service Worker v8
// v8 fixes vs v7:
// - Pre-cache CDN dengan mode:'cors' agar response TIDAK opaque (hemat quota iOS)
// - Runtime fetch CDN juga pakai cors, fallback no-cors
// - Phosphor Icons webfont files ditambahkan ke CDN_FILES
// - Guard opaque response (status=0 || type=opaque) di fetch handler
// - Graceful fallback 503 jika resource tidak tersedia offline

const CACHE_NAME = 'kembali-ternak-v8';

const LOCAL_FILES = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './icons/icon-384x384.png',
];

// Semua CDN ini mendukung CORS — gunakan mode:'cors' agar response bisa di-cache
// dengan benar tanpa opaque penalty (setiap opaque response dihitung ~7MB di iOS Safari)
const CDN_FILES = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    // Phosphor Icons — CSS + webfonts (fill adalah yang paling banyak dipakai app ini)
    'https://unpkg.com/@phosphor-icons/web@2.1.1/src/index.css',
    'https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/PhosphorIconsFill-Regular.woff2',
    'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/PhosphorIcons-Regular.woff2',
    'https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/PhosphorIconsBold-Regular.woff2',
    // Google Fonts CSS (font files .woff2 di-cache saat pertama kali dimuat online)
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap',
];

// Helper: fetch dengan CORS, fallback no-cors jika server tidak support
async function fetchCORS(url) {
    try {
        const resp = await fetch(new Request(url, { mode: 'cors' }));
        if (resp.ok || resp.status === 0) return resp;
        throw new Error('non-ok status: ' + resp.status);
    } catch (e) {
        // Fallback ke no-cors (opaque response) — hanya jika CORS gagal
        return fetch(new Request(url, { mode: 'no-cors' }));
    }
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            // Local files: harus berhasil
            await Promise.allSettled(
                LOCAL_FILES.map(f => cache.add(f).catch(e => console.warn('SW local cache fail:', f, e)))
            );
            // CDN files: boleh gagal (akan di-cache saat online pertama kali)
            await Promise.allSettled(
                CDN_FILES.map(async url => {
                    try {
                        const resp = await fetchCORS(url);
                        await cache.put(url, resp);
                    } catch (e) {
                        console.warn('SW CDN pre-cache gagal (ok jika offline):', url);
                    }
                })
            );
        })
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

    if (isCDN) {
        // CDN: cache-first. Jika tidak ada di cache, fetch & simpan.
        event.respondWith(
            caches.match(req).then(async cached => {
                if (cached) return cached;
                try {
                    const resp = await fetchCORS(req.url);
                    // Cache response CORS (status 200) atau opaque (status 0 / type opaque)
                    if (resp && (resp.status === 200 || resp.type === 'opaque')) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(req, resp.clone());
                    }
                    return resp;
                } catch (e) {
                    // Offline dan tidak ada cache — return 503
                    return new Response('', { status: 503, statusText: 'Offline - resource not cached' });
                }
            })
        );
    } else {
        // Lokal: network-first, fallback ke cache
        event.respondWith(
            fetch(req)
                .then(resp => {
                    if (resp && resp.status === 200) {
                        caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
                    }
                    return resp;
                })
                .catch(() => caches.match(req))
        );
    }
});

// Terima pesan SKIP_WAITING dari update banner
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
