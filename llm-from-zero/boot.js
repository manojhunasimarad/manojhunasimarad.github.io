// The browser version's start-up. It runs before app.js:
//   1. starts Python with the app's server code in one worker (api-worker.js),
//   2. answers the page's requests to /api/... from that worker instead of a server,
//   3. runs tests in a second worker (run-worker.js) that can be stopped when a test hangs,
//   4. loads app.js, the same page code the laptop version uses.
"use strict";

window.LFZ_WEB = true;
(function () {
  const CFG = Object.assign({}, window.LFZ_CONFIG, { base: new URL(".", location.href).href });
  CFG.pyodideUrl = new URL(CFG.pyodideUrl, location.href).href;
  CFG.ghTree = new URL(CFG.ghTree, location.href).href;
  CFG.ghRaw = new URL(CFG.ghRaw, location.href).href;
  if (CFG.ghRawAlt) CFG.ghRawAlt = new URL(CFG.ghRawAlt, location.href).href;
  const realFetch = window.fetch.bind(window);
  const step = text => { const el = document.getElementById("boot-step"); if (el) el.textContent = text; };

  /* ---------------------------------------------------------------- the server worker */
  const api = new Worker(CFG.base + "api-worker.js", { type: "module" });
  const waiting = new Map();
  let seq = 0;
  let started = null;
  const ready = new Promise((resolve, reject) => { started = { resolve, reject }; });
  api.onmessage = e => {
    const m = e.data;
    if (m.type === "status") step(m.text);
    else if (m.type === "ready") started.resolve(m.info);
    else if (m.type === "failed") started.reject(new Error(m.text));
    else if (m.type === "warn") { if (window.toast) window.toast(m.text); }
    else if (m.type === "reply") {
      const p = waiting.get(m.id);
      if (p) { waiting.delete(m.id); p(m); }
    }
  };
  api.onerror = e => started.reject(new Error(e.message || "The browser could not start the app's worker."));
  function ask(msg, transfer) {
    const id = ++seq;
    return new Promise(resolve => { waiting.set(id, resolve); api.postMessage(Object.assign({}, msg, { id }), transfer || []); });
  }
  api.postMessage({ kind: "boot", cfg: { pyodideUrl: CFG.pyodideUrl, base: CFG.base, files: CFG.files } });

  /* ---------------------------------------------------------------- the test worker */
  const clip = (text, limit) => { text = String(text == null ? "" : text).trim(); limit = limit || 1200; return text.length <= limit ? text : text.slice(0, limit) + " ..."; };
  const blank = (n, t, error) => ({ n, ok: false, shape: false, ran: clip(t.test, 700), expected: clip(t.expected_output), got: "", error, timeout: true });
  let sources = null;
  const runner = {
    w: null, pending: new Map(), seq: 0, ready: null, noted: false,
    spawn() {
      this.w = new Worker(CFG.base + "run-worker.js", { type: "module" });
      this.pending = new Map();
      this.w.onmessage = e => {
        const m = e.data, p = this.pending.get(m.id);
        if (!p) return;
        if (m.started) { if (p.onStart) p.onStart(); return; }
        if (m.note) {
          if (!this.noted && window.toast) window.toast(m.note.replace(/^Loading /, "Downloading ") + " into this browser. This happens once.");
          this.noted = true;
          return;
        }
        this.pending.delete(m.id);
        if (m.ok) p.resolve(m); else p.reject(new Error(m.error));
      };
      this.w.onerror = e => {
        for (const p of this.pending.values()) p.reject(new Error("The test runner stopped. " + (e.message || "")));
        this.pending.clear();
      };
      this.ready = (sources || (sources = Promise.all(["py/runner.py", "py/webrun.py"].map(p => realFetch(CFG.base + p).then(r => r.text())))))
        .then(([r, w]) => this.ask({ kind: "boot", pyodideUrl: CFG.pyodideUrl, runner: r, webrun: w }));
    },
    ask(msg, onStart) {
      const id = ++this.seq;
      return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject, onStart }); this.w.postMessage(Object.assign({}, msg, { id })); });
    },
    async runAll(code, tests, given, seconds) {
      await this.ready;
      this.noted = false;
      await this.ask({ kind: "imports", code: given + "\n" + code + "\n" + tests.map(t => t.test).join("\n") });
      const limit = Math.max(10, 2 * (seconds || 6));     // Python in a browser is slower than on the laptop
      const results = [];
      let stalled = false;
      for (let i = 0; i < tests.length; i++) {
        const n = i + 1, t = tests[i];
        if (stalled) { results.push(blank(n, t, "Not run, because an earlier test did not finish.")); continue; }
        let timer = 0, expire = null;
        const timeout = new Promise(resolve => { expire = resolve; });
        const run = this.ask({ kind: "test", n, t, code, given }, () => { timer = setTimeout(() => expire(null), limit * 1000); });
        const r = await Promise.race([run, timeout]);
        clearTimeout(timer);
        if (r === null) {
          this.w.terminate();
          for (const p of this.pending.values()) p.reject(new Error("stopped"));
          results.push(blank(n, t, "Stopped after " + limit + " seconds. Is there an endless loop?"));
          stalled = true;
          this.spawn();
          continue;
        }
        results.push(r.result);
      }
      return results;
    }
  };

  async function runFlow(body) {
    const prep = await ask({ kind: "prepare", ex: String(body.id || "") });
    if (prep.status !== 200) return prep;
    const p = prep.body;
    const code = String(body.code || "");
    let results;
    try {
      results = await runner.runAll(code, p.tests, p.given || "", p.timeout);
    } catch (e) {
      return { status: 500, body: { error: "The tests could not run: " + e.message } };
    }
    return ask({ kind: "call", method: "POST", path: "/api/run", body: JSON.stringify(Object.assign({}, body, { __results: results })) });
  }

  /* ---------------------------------------------------------------- the ML problem set, from GitHub */
  async function mlInstall() {
    const say = t => { const el = document.getElementById("install-msg"); if (el) el.textContent = t; };
    const want = /^questions\/([^/]+)\/(meta\.json|description\.md|example\.json|tests\.json|starter_code\.py|solution\.py|learn\.md)$/;
    say("Looking up the problem list on GitHub");
    let paths = [];
    try {
      const res = await realFetch(CFG.ghTree);
      if (res.ok) paths = ((await res.json()).tree || []).filter(x => x.type === "blob" && want.test(x.path)).map(x => x.path);
    } catch (e) { /* GitHub's API can be blocked or rate-limited: use the list saved with this version */ }
    if (paths.length < 100) {
      try { paths = (await (await realFetch(CFG.base + "ml-files.json")).json()).filter(p => want.test(p)); } catch (e) { paths = []; }
    }
    if (paths.length < 100) throw new Error("Could not reach GitHub. Check the connection and try again.");
    const sources = [CFG.ghRaw, CFG.ghRawAlt].filter(Boolean);
    const files = [];
    let next = 0, failed = 0, prefer = 0;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const GONE = {};
    const fetchOne = async path => {               // three tries at each source; a source that fails is avoided from then on
      let missing = 0;
      const first = prefer;                        // fixed here: other downloads change `prefer` meanwhile
      for (let k = 0; k < sources.length; k++) {
        const i = (first + k) % sources.length;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt) await pause(400 * attempt * attempt);
          try {
            const res = await realFetch(sources[i] + path);
            if (res.ok) { prefer = i; return await res.text(); }
            if (res.status === 404) { missing++; break; }
          } catch (e) { /* try again */ }
        }
      }
      return missing === sources.length ? GONE : null;           // GONE: removed from the repository since the list was made
    };
    const one = async () => {
      while (next < paths.length) {
        const path = paths[next++];
        const text = await fetchOne(path);
        if (text === null) { if (++failed >= 8) next = paths.length; }   // the connection is down: stop early
        else if (text !== GONE) files.push([path.slice("questions/".length), text]);
        if (files.length % 25 === 0) say("Downloading: " + files.length + " of " + paths.length + " files");
      }
    };
    await Promise.all(Array.from({ length: 8 }, one));
    if (failed) throw new Error("Some files could not be downloaded from GitHub, so nothing was saved. Check the connection and press Download again.");
    say("Saving the problems in this browser");
    for (let i = 0; i < files.length; i += 300) {
      const r = await ask({ kind: "mlfiles", files: files.slice(i, i + 300), last: i + 300 >= files.length });
      if (r.status !== 200 || i + 300 >= files.length) return r;
    }
    return { status: 400, body: { error: "Nothing was downloaded." } };
  }

  /* ---------------------------------------------------------------- requests from the page */
  async function answer(url, init) {
    await ready;
    const method = String(init.method || "GET").toUpperCase();
    const path = url.pathname;
    if (path.startsWith("/paper-file/")) {
      const r = await ask({ kind: "file", name: path.split("/").pop() });
      if (r.status !== 200) return new Response("Not found", { status: 404 });
      return new Response(new Blob([r.bytes], { type: "application/pdf" }), { status: 200, headers: { "Content-Type": "application/pdf" } });
    }
    let r;
    if (path === "/api/papers/upload") {
      const bytes = await new Response(init.body).arrayBuffer();
      r = await ask({ kind: "upload", name: url.searchParams.get("name") || "paper.pdf", bytes }, [bytes]);
    } else if (path === "/api/run" && method === "POST") {
      r = await runFlow(JSON.parse(init.body || "{}"));
    } else if (path === "/api/ml/install" && method === "POST") {
      r = await mlInstall().catch(e => ({ status: 400, body: { error: e.message } }));
    } else {
      r = await ask({ kind: "call", method, path, query: url.search, body: method === "GET" ? "" : String(init.body || "") });
    }
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }

  window.fetch = function (input, init) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin === location.origin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/paper-file/"))) return answer(url, init || {});
    return realFetch(input, init);
  };

  /* ---------------------------------------------------------------- start */
  ready.then(info => {
    step("Ready");
    const s = document.createElement("script");
    s.src = "app.js";
    document.body.appendChild(s);
    runner.spawn();                                   // the files are in the browser's cache by now
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") ask({ kind: "flush" }); });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    window.LFZ_INFO = info;
  }, err => {
    const box = document.getElementById("boot");
    if (!box) return;
    box.innerHTML = `<h1>The app could not start</h1>
      <p>${navigator.onLine ? "Python could not be loaded in this browser." : "This device is offline, and the app has not been opened here with a connection before. The first visit needs a connection to download Python (about 12 MB); after that it works offline."}</p>
      <p class="muted small"></p><p><button class="btn primary" onclick="location.reload()">Try again</button></p>`;
    box.querySelector(".muted").textContent = err.message;
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) return;                      // the first install is not an update
      const bar = document.getElementById("update-bar");
      if (bar) bar.hidden = false;
    });
  }
})();
