const CACHE = 'patrimoine-v6';
const ASSETS = ['./', './index.html', './app.js', './simulateurs.js', './logo-hexa.png', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // ne pas cacher Supabase / CDN
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
