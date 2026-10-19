// The app's server, running in a worker of this page: Python (Pyodide) with the app's own server code.
// The page sends one request at a time; each is answered in order. Data is kept in IndexedDB.

let py = null;
let api = null;
let queue = Promise.resolve();
let syncing = Promise.resolve();
let FS = null;

const post = m => postMessage(m);
const status = text => post({ type: "status", text });

function mkdirs(path) {
  const parts = path.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += "/" + p;
    try { FS.mkdir(cur); } catch (e) { /* exists */ }
  }
}

// Write what changed in memory to IndexedDB. Only the folder given is compared and written, which for
// your progress takes a few milliseconds, so a change is saved before the tab can be closed. Calls are
// chained so two never overlap.
const DATA = "/lfz/app/data", ML = "/lfz/ml_practice";
function flush(path) {
  syncing = syncing.then(() => new Promise(resolve => {
    const mount = FS.lookupPath(path || DATA).node.mount;
    mount.type.syncfs(mount, false, err => {
      if (err) post({ type: "warn", text: "Saving to this browser failed: " + err });
      resolve();
    });
  }));
  return syncing;
}

// SQLite's own WebAssembly build, used by the sqlite3 module in py/sqlite3. A database lives in memory
// and is copied to its file after every committed change.
function makeSql(sqlite3) {
  const dbs = [];
  return {
    open(path) {
      let bytes = null;
      try { if (path !== ":memory:") bytes = FS.readFile(path); } catch (e) { bytes = null; }
      const db = new sqlite3.oo1.DB(":memory:");
      if (bytes && bytes.length) {
        const p = sqlite3.wasm.allocFromTypedArray(bytes);
        const rc = sqlite3.capi.sqlite3_deserialize(db.pointer, "main", p, bytes.length, bytes.length,
          sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE);
        db.checkRc(rc);
      }
      dbs.push({ db, path });
      return dbs.length - 1;
    },
    exec(h, sql, paramsJson) {
      const { db } = dbs[h];
      const params = JSON.parse(paramsJson);
      const rows = [], cols = [];
      db.exec({ sql, bind: params.length ? params : undefined, rowMode: "array", resultRows: rows, columnNames: cols });
      const big = v => (typeof v === "bigint" ? Number(v) : v);
      return JSON.stringify({
        cols, rows: rows.map(r => r.map(big)),
        lastrowid: Number(sqlite3.capi.sqlite3_last_insert_rowid(db.pointer)), changes: db.changes()
      });
    },
    script(h, sql) { dbs[h].db.exec(sql); },
    save(h) {
      const { db, path } = dbs[h];
      if (path === ":memory:") return;
      FS.writeFile(path, sqlite3.capi.sqlite3_js_db_export(db.pointer));
    }
  };
}

async function boot(cfg) {
  status("Loading Python");
  const { loadPyodide } = await import(cfg.pyodideUrl + "pyodide.mjs");
  py = await loadPyodide({ indexURL: cfg.pyodideUrl });
  FS = py.FS;
  status("Loading SQLite");
  // The databases are kept in Pyodide's file system (saved to IndexedDB), so SQLite's own browser
  // storage is not used; turning it off stops SQLite from starting helper workers for it.
  globalThis.sqlite3ApiConfig = { disable: { vfs: { opfs: true, "opfs-vfs": true, "opfs-wl": true, "opfs-sahpool": true } } };
  const { default: sqlite3InitModule } = await import(cfg.base + "vendor/sqlite/sqlite3.mjs");
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  globalThis.lfzSql = makeSql(sqlite3);

  status("Opening your progress");
  for (const d of [DATA, ML, "/lfz/shim/sqlite3", "/lfz/app/content", "/lfz/tmp"]) mkdirs(d);
  FS.mount(FS.filesystems.IDBFS, {}, DATA);
  FS.mount(FS.filesystems.IDBFS, {}, ML);
  await new Promise((resolve, reject) => FS.syncfs(true, err => (err ? reject(err) : resolve())));

  status("Loading the course");
  await Promise.all(cfg.files.map(async ([src, dest]) => {
    const res = await fetch(cfg.base + src);
    if (!res.ok) throw new Error("Could not load " + src + " (" + res.status + ")");
    FS.writeFile(dest, new Uint8Array(await res.arrayBuffer()));
  }));
  py.runPython("import sys\nsys.path.insert(0, '/lfz/shim')\nsys.path.insert(0, '/lfz/app')");
  api = py.pyimport("webapi");
  const info = JSON.parse(api.start());
  await flush(DATA);
  return info;
}

async function handle(m) {
  switch (m.kind) {
    case "call": {
      const out = JSON.parse(api.call(m.method, m.path, m.query || "", m.body || ""));
      await flush(DATA);          // a few milliseconds when nothing changed; the page hears back once it is saved
      return out;
    }
    case "prepare":
      return JSON.parse(api.prepare(m.ex));
    case "upload": {
      const tmp = "/lfz/tmp/upload.pdf";
      FS.writeFile(tmp, new Uint8Array(m.bytes));
      const out = JSON.parse(api.upload(m.name, tmp));
      await flush(DATA);
      return out;
    }
    case "file": {
      const path = api.paper_path(m.name);
      if (!path) return { status: 404, body: null };
      const bytes = FS.readFile(path);
      return { status: 200, bytes: bytes.buffer, transfer: true };
    }
    case "mlfiles": {
      const root = api.ml_dir();
      for (const [rel, text] of m.files) {
        const path = root + "/" + rel;
        mkdirs(path.slice(0, path.lastIndexOf("/")));
        FS.writeFile(path, text);
      }
      if (!m.last) return { status: 200, body: { ok: true } };
      const out = JSON.parse(api.ml_loaded());
      await flush(ML);
      await flush(DATA);
      return out;
    }
    case "flush":
      await flush(DATA);
      return { status: 200, body: { ok: true } };
  }
  return { status: 400, body: { error: "Unknown request." } };
}

onmessage = e => {
  const m = e.data;
  if (m.kind === "boot") {
    queue = queue.then(() => boot(m.cfg)).then(
      info => post({ type: "ready", info }),
      err => post({ type: "failed", text: String(err && err.message || err), stack: String(err && err.stack || "") }));
    return;
  }
  queue = queue.then(() => handle(m)).then(out => {
    if (out && out.transfer) postMessage({ type: "reply", id: m.id, status: out.status, bytes: out.bytes }, [out.bytes]);
    else postMessage({ type: "reply", id: m.id, status: out.status, body: out.body });
  }, err => post({ type: "reply", id: m.id, status: 500, body: { error: String(err && err.message || err) } }));
};
