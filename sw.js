// Dinachari's offline worker, for the whole site (scope "/").
// It answers only for Dinachari's own files, for the two Dalal Dojo pages (single files with no worker
// of their own), their Google fonts, and the few LLM From Zero modules Dinachari imports. Kitchen From
// Zero and LLM From Zero have their own workers under their folders; for their pages theirs win, and
// this one passes everything of theirs straight to the network.
// VERSION changes whenever a file below changes (node day/tools/stamp.mjs), so phones get the update.
const VERSION = 'day-1.0.0-f6c964910ccd';
const RUNTIME = 'day-runtime';
const SHELL = [
  '/', '/manifest.webmanifest',
  '/day/app.mjs', '/day/core.mjs', '/day/sources.mjs', '/day/sync.mjs', '/day/views.mjs', '/day/dial.mjs', '/day/app.css',
  '/day/fonts/AtkinsonHyperlegibleNext.woff',
  '/day/icons/icon-192.png', '/day/icons/icon-512.png', '/day/icons/maskable-512.png', '/day/icons/monochrome-512.png',
  '/day/icons/badge-96.png', '/day/icons/favicon-32.png', '/day/icons/apple-touch-icon.png',
  '/day/icons/sc-wake.png', '/day/icons/sc-sleep.png', '/day/icons/sc-timer.png', '/day/icons/sc-review.png'
];
const SIDE_PAGES = ['/dalal-dojo/', '/dalal-dojo-lessons/'];
const LLM_MODULES = /^\/llm-from-zero\/(journey-core|clock-core|etl-core|auth|cloud-sync|studio-core|learning-engine|self-core)\.mjs$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('day-') && k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page: the network if it answers within a few seconds (so updates arrive), else the saved copy.
async function networkFirst(req, key, cacheName, wait = 3500) {
  const cache = await caches.open(cacheName);
  const net = fetch(req).then(res => { if (res && res.ok) cache.put(key, res.clone()); return res; });
  const saved = await cache.match(key, { ignoreSearch: true });
  if (!saved) return net;
  try { return await Promise.race([net, new Promise(r => setTimeout(() => r(saved), wait))]); }
  catch { return saved; }
}
// Code, styles, fonts and icons: the saved copy at once, refreshed in the background.
async function savedFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = (await caches.match(req, { ignoreSearch: true })) || null;
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || new Response('Offline', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    const p = url.pathname;
    if (p === '/' || p === '/index.html') { e.respondWith(networkFirst(req, '/', VERSION)); return; }
    if (p.startsWith('/day/') || p === '/manifest.webmanifest') { e.respondWith(savedFirst(req, VERSION)); return; }
    const side = SIDE_PAGES.find(s => p === s || p === s + 'index.html');
    if (side) { e.respondWith(networkFirst(req, side, RUNTIME, 5000)); return; }
    if (LLM_MODULES.test(p)) { e.respondWith(networkFirst(req, p, RUNTIME, 4000)); return; }
    return;
  }
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(savedFirst(req, RUNTIME));
});

// A tap on a notification (or one of its buttons): bring Dinachari forward and do the thing.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const act = e.action || (e.notification.data && e.notification.data.act) || '';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hub = wins.find(c => { const p = new URL(c.url).pathname; return p === '/' || p === '/index.html'; });
    if (hub) { await hub.focus(); hub.postMessage({ type: 'do', act }); return; }
    await self.clients.openWindow('/' + (act ? '?do=' + encodeURIComponent(act) : ''));
  })());
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
