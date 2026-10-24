// Runs the learner's code against one test at a time. The page stops this whole worker when a test
// does not finish in time and starts a fresh one, so an endless loop cannot hang the app.

let py = null;
let webrun = null;

let base = "";
let sqliteShim = "";
let sqliteReady = null;

async function boot(m) {
  const { loadPyodide } = await import(m.pyodideUrl + "pyodide.mjs");
  py = await loadPyodide({ indexURL: m.pyodideUrl });
  base = m.base;
  sqliteShim = m.sqlite;
  py.FS.mkdirTree("/lfz/run");
  py.FS.writeFile("/lfz/run/runner.py", m.runner);
  py.FS.writeFile("/lfz/run/webrun.py", m.webrun);
  py.runPython("import sys\nsys.path.insert(0, '/lfz/run')");
  webrun = py.pyimport("webrun");
}

// Pyodide has no sqlite3 module; the SQL exercises get the same one the app's server uses.
function ensureSqlite() {
  if (!sqliteReady) {
    sqliteReady = (async () => {
      const { loadSqlite, makeSql } = await import(base + "sqlbridge.js");
      globalThis.lfzSql = makeSql(await loadSqlite(base), py.FS);
      py.FS.mkdirTree("/lfz/run/sqlite3");
      py.FS.writeFile("/lfz/run/sqlite3/__init__.py", sqliteShim);
    })();
  }
  return sqliteReady;
}

let queue = Promise.resolve();
onmessage = e => {
  const m = e.data;
  queue = queue.then(async () => {
    try {
      if (m.kind === "boot") { await boot(m); postMessage({ id: m.id, ok: true }); return; }
      if (m.kind === "imports") {
        if (/\bimport\s+sqlite3\b|\bfrom\s+sqlite3\b/.test(m.code)) await ensureSqlite();
        // Packages the code imports that Pyodide has (NumPy, SciPy, ...) are downloaded the first time.
        // One it does not have is left alone: the test then shows the ModuleNotFoundError.
        try {
          await py.loadPackagesFromImports(m.code, {
            messageCallback: msg => { if (/^Loading /.test(msg)) postMessage({ id: m.id, note: msg }); },
            errorCallback: () => {}
          });
        } catch (err) { /* reported by the test itself */ }
        postMessage({ id: m.id, ok: true });
        return;
      }
      if (m.kind === "test") {
        postMessage({ id: m.id, started: true });
        const out = webrun.run_test(m.n, JSON.stringify(m.t), m.code, m.given);
        postMessage({ id: m.id, ok: true, result: JSON.parse(out) });
      }
    } catch (err) {
      postMessage({ id: m.id, ok: false, error: String(err && err.message || err) });
    }
  });
};
