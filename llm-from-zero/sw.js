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
    const res = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(15000) });
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
  // Never cache local-model discovery, model answers or dynamic native APIs.
  if (/^\/(studio-api|api)\//.test(url.pathname)) return;
  if (url.href.startsWith(pyodideBase)) { e.respondWith(fromCache(RUNTIME, req)); return; }
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === "navigate") {
    // Hash routes need no SPA rewrite. Preserve studio.html and audio/index.html
    // instead of replacing every navigation with the Python practice shell.
    e.respondWith(caches.open(SHELL).then(c => c.match(req, { ignoreSearch: true })).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.open(SHELL).then(c => c.match(req, { ignoreSearch: true })).then(r => r || fetch(req)));
});

self.addEventListener('message', e => {
  if (e.data?.type !== 'studio-ready') return;
  e.waitUntil(caches.open(SHELL).then(async cache => {
    const essential = ['studio.html','studio.mjs','studio-core.mjs','learning-engine.mjs','learning-ui.mjs','quiz-core.mjs','quiz-ui.mjs','content/quiz.json','learning.css','content/learning-graph.json','studio.css','style.css','content/studio.json','content/lessons.json'];
    const hits = await Promise.all(essential.map(p => cache.match(new URL(p, scope).href)));
    e.source?.postMessage({type:'studio-ready',ok:hits.every(Boolean)});
  }));
});
