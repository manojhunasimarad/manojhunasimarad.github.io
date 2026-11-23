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

// "Download everything for offline": the app, all content, Python and the packages in C.offlinePackages
// (with their dependencies, from Pyodide's lock file). Already-saved files are skipped, so it is cheap to repeat.
async function downloadAll(client) {
  const say = m => client?.postMessage({type: 'offline-progress', ...m});
  try {
    const shell = await caches.open(SHELL);
    let n = 0;
    for (const p of C.precache) {
      const url = new URL(p, scope).href;
      if (!(await shell.match(url))) { const r = await fetch(url, {cache: 'reload'}); if (r.ok) await shell.put(url, r); }
      say({step: 'app', done: ++n, total: C.precache.length});
    }
    await warmPython();
    const runtime = await caches.open(RUNTIME);
    const lockRes = await fromCache(RUNTIME, new Request(pyodideBase + 'pyodide-lock.json'));
    const lock = await lockRes.json();
    const want = new Set();
    const add = name => { const k = String(name).toLowerCase(), p = lock.packages[k]; if (!p || want.has(k)) return; want.add(k); (p.depends || []).forEach(add); };
    (C.offlinePackages || []).forEach(add);
    n = 0;
    for (const k of want) {
      const url = pyodideBase + lock.packages[k].file_name;
      if (!(await runtime.match(url))) { const r = await fetch(url, {mode: 'cors'}); if (r.ok) await runtime.put(url, r); else throw new Error('could not download ' + k); }
      say({step: 'python', done: ++n, total: want.size, name: k});
    }
    say({finished: true, ok: true, packages: [...want]});
  } catch (err) { say({finished: true, ok: false, error: String(err && err.message || err)}); }
}

self.addEventListener('message', e => {
  if (e.data?.type === 'offline-all') { e.waitUntil(downloadAll(e.source)); return; }
  if (e.data?.type !== 'studio-ready') return;
  e.waitUntil(caches.open(SHELL).then(async cache => {
    const essential = ['studio.html','studio.mjs','theme.js','sync-ui.mjs','cloud-sync.mjs','offline.mjs','studio-core.mjs','learning-engine.mjs','learning-ui.mjs','quiz-core.mjs','quiz-ui.mjs','content/quiz.json','learning.css','content/learning-graph.json','studio.css','style.css','content/studio.json','content/lessons.json'];
    const hits = await Promise.all(essential.map(p => cache.match(new URL(p, scope).href)));
    e.source?.postMessage({type:'studio-ready',ok:hits.every(Boolean)});
  }));
});
