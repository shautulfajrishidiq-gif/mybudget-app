// Service worker Ngatur Duit: cache file aplikasi (shell) saja.
// Data keuangan TIDAK pernah di-cache di sini; selalu diambil langsung dari server.
const CACHE = 'ngaturduit-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/logo.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
    self.skipWaiting();
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
    const req = e.request, url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== location.origin) return; // API Google & CDN: langsung ke jaringan
    // Halaman & script: jaringan dulu supaya update dari GitHub langsung terlihat, cache hanya cadangan saat offline
    e.respondWith(
        fetch(req).then(res => {
            if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
            return res;
        }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/index.html') : undefined)))
    );
});
