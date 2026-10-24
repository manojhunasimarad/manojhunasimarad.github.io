// SQLite's own WebAssembly build, used by the sqlite3 module in py/sqlite3 (a Python module with the
// standard library's interface). Shared by the two workers: the app's server (api-worker.js) keeps its
// databases in files, and the test runner (run-worker.js) uses in-memory databases for the SQL exercises.
// A database lives in memory and is copied to its file after every committed change.

export async function loadSqlite(base) {
  // The databases are kept in Pyodide's file system (saved to IndexedDB), so SQLite's own browser
  // storage is not used; turning it off stops SQLite from starting helper workers for it.
  globalThis.sqlite3ApiConfig = { disable: { vfs: { opfs: true, "opfs-vfs": true, "opfs-wl": true, "opfs-sahpool": true } } };
  const { default: sqlite3InitModule } = await import(base + "vendor/sqlite/sqlite3.mjs");
  return sqlite3InitModule({ print: () => {}, printErr: () => {} });
}

export function makeSql(sqlite3, FS) {
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
    },
    close(h) {
      const d = dbs[h];
      if (!d || d.path !== ":memory:" || !d.db) return;      // file databases stay open for the server's lifetime
      d.db.close();
      d.db = null;
    }
  };
}
