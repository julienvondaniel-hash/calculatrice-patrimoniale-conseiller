const CACHE = 'monkappro-v34';
const ASSETS = ['./', './index.html', './app.js', './simulateurs.js', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

// Recrée une réponse "propre" (sans redirection) — corrige l'erreur Safari
async function clean(resp) {
  if (!resp || !resp.redirected) return resp;
  const body = await resp.blob();
  return new Response(body, { status: 200, statusText: 'OK', headers: resp.headers });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async url => {
      try { const r = await fetch(url, { cache: 'reload', redirect: 'follow' }); await c.put(url, await clean(r)); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return; // laisse passer Supabase / Stripe / CDN

  // Navigations
  if (req.mode === 'navigate') {
    // Vraies pages statiques (légales, landing) : réseau d'abord, NE PAS servir l'app-shell
    if (/\.html$/.test(u.pathname) && !/index\.html$/.test(u.pathname)) {
      e.respondWith(fetch(req).then(r => clean(r)).catch(() => caches.match(req)));
      return;
    }
    // Reste : on sert toujours l'app-shell (jamais une réponse redirigée)
    e.respondWith((async () => {
      const cached = await caches.match('./index.html');
      if (cached) return cached;
      try { return await clean(await fetch(req)); } catch (_) { return caches.match('./index.html'); }
    })());
    return;
  }

  // config.js : réseau d'abord (pour prendre en compte les clés mises à jour), cache en secours
  if (u.pathname.endsWith('/config.js')) {
    e.respondWith(fetch(req).then(r => { caches.open(CACHE).then(c => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
    return;
  }

  // Reste : cache d'abord
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
