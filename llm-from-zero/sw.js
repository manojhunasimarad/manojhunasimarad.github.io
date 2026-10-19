// Keeps the app working offline. The app's own files are saved when this version is installed;
// Python's files are saved the first time they are downloaded. A new version of the app installs
// itself in the background and is used from the next visit.
importScripts("config.js");
const C = self.LFZ_CONFIG;
const SHELL = "lfz-shell-" + C.build;
const RUNTIME = "lfz-python-" + C.pyodideVersion;
const scope = new URL(self.registration.scope);
const pyodideBase = new URL(C.pyodideUrl, scope).href;

// Python's core files are saved at install too, so the app opens offline from the second visit even
// though the first visit downloaded them before this worker was in charge. A failure here is not fatal:
// they are saved later, when the page asks for them.
async function warmPython() {
  const cache = await caches.open(RUNTIME);
  await Promise.all(C.pyodideCore.map(async name => {
    const url = pyodideBase + name;
    if (await cache.match(url)) return;
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) await cache.put(url, res);
  }));
}

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(c => c.addAll(C.precache)),
    warmPython().catch(() => {})
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("lfz-") && k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function fromCache(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.href.startsWith(pyodideBase)) { e.respondWith(fromCache(RUNTIME, req)); return; }
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === "navigate") {
    e.respondWith(caches.open(SHELL).then(c => c.match(new URL("index.html", scope).href)).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.open(SHELL).then(c => c.match(req, { ignoreSearch: true })).then(r => r || fetch(req)));
});
