// Written by build_web.py. Read by the page (boot.js) and by the offline worker (sw.js).
self.LFZ_CONFIG = {
 "build": "4.0.0-d54e967ce2",
 "version": "4.0.0",
 "pyodideVersion": "0.29.4",
 "pyodideUrl": "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/",
 "pyodideCore": [
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json"
 ],
 "ghTree": "https://api.github.com/repos/Open-Deep-ML/DML-OpenProblem/git/trees/main?recursive=1",
 "ghRaw": "https://raw.githubusercontent.com/Open-Deep-ML/DML-OpenProblem/main/",
 "ghRawAlt": "https://cdn.jsdelivr.net/gh/Open-Deep-ML/DML-OpenProblem@main/",
 "files": [
  [
   "py/server.py",
   "/lfz/app/server.py"
  ],
  [
   "py/engine.py",
   "/lfz/app/engine.py"
  ],
  [
   "py/runner.py",
   "/lfz/app/runner.py"
  ],
  [
   "py/mdlite.py",
   "/lfz/app/mdlite.py"
  ],
  [
   "py/papers.py",
   "/lfz/app/papers.py"
  ],
  [
   "py/agent.py",
   "/lfz/app/agent.py"
  ],
  [
   "py/sync.py",
   "/lfz/app/sync.py"
  ],
  [
   "py/webapi.py",
   "/lfz/app/webapi.py"
  ],
  [
   "py/sqlite3/__init__.py",
   "/lfz/shim/sqlite3/__init__.py"
  ],
  [
   "content/certs.json",
   "/lfz/app/content/certs.json"
  ],
  [
   "content/exercises.json",
   "/lfz/app/content/exercises.json"
  ],
  [
   "content/lessons.json",
   "/lfz/app/content/lessons.json"
  ],
  [
   "content/lists.json",
   "/lfz/app/content/lists.json"
  ],
  [
   "content/manifest.json",
   "/lfz/app/content/manifest.json"
  ],
  [
   "content/quiz.json",
   "/lfz/app/content/quiz.json"
  ],
  [
   "content/roles.json",
   "/lfz/app/content/roles.json"
  ],
  [
   "content/skills.json",
   "/lfz/app/content/skills.json"
  ]
 ],
 "precache": [
  "./",
  "index.html",
  "config.js",
  "boot.js",
  "app.js",
  "style.css",
  "api-worker.js",
  "run-worker.js",
  "sqlbridge.js",
  "manifest.webmanifest",
  "vendor/mathjax/tex-svg.js",
  "vendor/sqlite/sqlite3.mjs",
  "vendor/sqlite/sqlite3.wasm",
  "vendor/qr/qrcode.js",
  "vendor/qr/jsQR.js",
  "py/webrun.py",
  "py/server.py",
  "py/engine.py",
  "py/runner.py",
  "py/mdlite.py",
  "py/papers.py",
  "py/agent.py",
  "py/sync.py",
  "py/webapi.py",
  "py/sqlite3/__init__.py",
  "content/certs.json",
  "content/exercises.json",
  "content/lessons.json",
  "content/lists.json",
  "content/manifest.json",
  "content/quiz.json",
  "content/roles.json",
  "content/skills.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.png"
 ]
};
