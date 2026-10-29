// Bump CACHE whenever you change app files so phones pick up the update.
const CACHE = 'asl-v6';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'logo.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache-first; also caches the MediaPipe files after the first load so it works offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = e.request.url;
  if (!u.startsWith(self.location.origin) && !u.includes('cdn.jsdelivr.net')) return; // never cache call servers
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
