const CACHE_NAME = 'gleanword-v5';
const ASSETS_TO_CACHE = [
    '/GleanWord/',
    '/index.html',
    '/novel.css?v=5',
    '/novel.js?v=5',
    '/manifest.json',
    '/novel-192.png',
    '/novel-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Replace lines 32 - 38:
self.addEventListener('fetch', (event) => {
    // Always fetch fresh HTML from the network first
    if (event.request.mode === 'navigate' || event.request.url.includes('index.html')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for images, CSS, JS
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});