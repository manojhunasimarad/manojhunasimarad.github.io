// Sync across devices through one secret GitHub Gist that you own. No server of ours, no account
// besides GitHub, free. Each kind of data is one file in the gist and has its own merge rule, the
// same rules the backup files already use, so syncing is "import the other device's backup, then
// save mine", done automatically:
//
//   lfz-studio.json      Learn & listen notes        newer note wins (mergeProgress)
//   lfz-learning.json    learning plan, quizzes      newer record wins (mergeLearning)
//   lfz-etl-check.json   ETL "check what you know"   newer decision wins
//   lfz-etl.json         ETL goal and known topics   newer save wins
//   lfz-practice.json    practice app (exercises,    the practice app's own merge (py/sync.py):
//                        recall, solutions)          logs are joined, nothing is removed
//
// Every sync reads the gist, merges each file into this browser, then writes back only the files
// that changed. A PATCH that names some files leaves the others alone, so the studio page (which
// has no Python) can sync its parts without touching the practice file.
//
// The token lives in this browser's localStorage. Make it a fine-grained token with only
// "Gists: read and write" (it can then read or change your gists, nothing else). A secret gist is
// unlisted, not encrypted: anyone with its URL can read it. Nothing here is a password, but do not
// paste secrets into notes.

import {mergeProgress} from './studio-core.mjs';
import {emptyState, mergeLearning} from './learning-engine.mjs';

export const SYNC_KEY = 'lfz-sync-v1';
export const DESCRIPTION = 'LLM From Zero: learning progress sync (manojhunasimarad.github.io)';
const API = 'https://api.github.com';
const MAX_BYTES = 9_000_000;  // a gist file can be larger, but a phone should not download that on every visit

export class SyncError extends Error {}

export const TOKEN_KEY = 'lfz-sync-token';  // work mode: the token lives in sessionStorage only
const sessionDefault = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };

export function readSettings(storage = globalThis.localStorage, session = sessionDefault()) {
  let s = {};
  try { s = JSON.parse(storage.getItem(SYNC_KEY)) || {}; } catch {}
  if (s.work && !s.token && session) s.token = session.getItem(TOKEN_KEY) || undefined;
  return s;
}
export function writeSettings(settings, storage = globalThis.localStorage) {
  const {token, ...rest} = settings;   // in work mode the token never reaches localStorage
  storage.setItem(SYNC_KEY, JSON.stringify(settings.work ? rest : settings));
}

// ------------------------------------------------------------------ GitHub
export function gistClient(token, fetchImpl = globalThis.fetch) {
  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchImpl(API + path, {method, headers: body ? {...headers, 'Content-Type': 'application/json'} : headers,
        body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
    } catch (e) { throw new SyncError('GitHub is not reachable. You may be offline; your changes stay in this browser.'); }
    if (res.status === 401) throw new SyncError('GitHub refused the token: it is wrong or expired. Make a new one.');
    if (res.status === 403 || res.status === 429) throw new SyncError('GitHub refused: the token needs "Gists: read and write", or the hourly limit was reached.');
    if (res.status === 404) throw new SyncError('The sync gist was not found. Forget this device and connect again.');
    if (!res.ok) throw new SyncError(`GitHub answered ${res.status}.`);
    return res.json();
  }
  return {
    async find() {
      for (let page = 1; page <= 5; page++) {
        const list = await call('GET', `/gists?per_page=100&page=${page}`);
        const hit = list.find(g => g.description === DESCRIPTION);
        if (hit) return hit.id;
        if (list.length < 100) return null;
      }
      return null;
    },
    async create() {
      const g = await call('POST', '/gists', {description: DESCRIPTION, public: false, files: {'lfz-readme.md': {content:
        '# LLM From Zero sync\n\nWritten by https://manojhunasimarad.github.io/llm-from-zero/ to keep learning progress the same on every device.\nEach JSON file is one kind of progress. Do not edit by hand; delete the gist to start over.\n'}}});
      return g.id;
    },
    async read(id) {
      const g = await call('GET', `/gists/${id}`);
      const files = {};
      for (const [name, f] of Object.entries(g.files || {})) {
        if (!name.endsWith('.json')) continue;
        if (f.size > MAX_BYTES) throw new SyncError(`${name} in the gist is over 9 MB; sync stopped to protect your data plan.`);
        if (f.truncated) {  // the API inlines up to 1 MB; the raw file has the rest
          const raw = await fetchImpl(f.raw_url, {cache: 'no-store'}).catch(() => null);
          if (!raw || !raw.ok) throw new SyncError(`Could not download ${name} from the gist.`);
          files[name] = await raw.text();
        } else files[name] = f.content;
      }
      return {files, updated: g.updated_at};
    },
    async write(id, files) {
      const body = {files: Object.fromEntries(Object.entries(files).map(([n, c]) => [n, {content: c}]))};
      const g = await call('PATCH', `/gists/${id}`, body);
      return g.updated_at;
    },
  };
}

// ------------------------------------------------------------------ merging
// A part: {file, label, read(), merge(local, remote), write(merged), same?(a, b)}
export async function syncParts(client, gistId, parts) {
  const remote = await client.read(gistId);
  const upload = {}, report = [];
  for (const p of parts) {
    const local = await p.read();
    const text = remote.files[p.file];
    let incoming = null, note = '';
    if (text) { try { incoming = JSON.parse(text); } catch { note = 'the copy in the gist was unreadable and is replaced'; } }
    let merged = local;
    if (incoming) {
      try { merged = await p.merge(local, incoming); } catch (e) { note = 'not merged: ' + e.message; merged = local; }
    }
    const same = p.same || ((a, b) => JSON.stringify(a) === JSON.stringify(b));
    const changedHere = !same(merged, local);
    if (changedHere) await p.write(merged);
    const out = JSON.stringify(merged);
    const changedThere = !incoming || !same(merged, incoming);
    if (changedThere) {
      if (out.length > MAX_BYTES) note = 'too large to upload (over 9 MB)';
      else upload[p.file] = out;
    }
    report.push({label: p.label, received: changedHere, sent: changedThere && !!upload[p.file], note});
  }
  const updated = Object.keys(upload).length ? await client.write(gistId, upload) : remote.updated;
  return {report, updated, changedHere: report.some(r => r.received)};
}

export function describe(result) {
  const got = result.report.filter(r => r.received).map(r => r.label);
  const sent = result.report.filter(r => r.sent).map(r => r.label);
  const notes = result.report.filter(r => r.note).map(r => `${r.label}: ${r.note}`);
  const parts = [];
  if (got.length) parts.push('Updated here: ' + got.join(', ') + '.');
  if (sent.length) parts.push('Sent: ' + sent.join(', ') + '.');
  if (!got.length && !sent.length) parts.push('Already in sync.');
  return parts.concat(notes).join(' ');
}

// ------------------------------------------------------------------ the parts kept in localStorage
const readJson = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } };

export function newerRecords(local, remote, stamp = r => r?.at || r?.updated || 0) {
  const out = {...(local || {})};
  for (const [id, r] of Object.entries(remote || {})) {
    if (['__proto__', 'constructor', 'prototype'].includes(id) || !r || typeof r !== 'object' || Array.isArray(r)) continue;
    if (!out[id] || stamp(r) > stamp(out[id])) out[id] = r;
  }
  return out;
}

export function mergeEtl(local, remote) {
  const l = local || {}, r = remote || {};
  if (!Array.isArray(r.known)) return l;
  if (l.updated && r.updated) return r.updated > l.updated ? r : l;   // both dated: the newer save wins
  if (!Array.isArray(l.known)) return r;
  const known = [...new Set([...l.known, ...r.known])].filter(x => typeof x === 'string');
  return {...l, known};                                                // an undated save: keep both
}

export async function localParts({storage = globalThis.localStorage, base = '', fetchImpl = globalThis.fetch} = {}) {
  const load = async p => { const r = await fetchImpl(base + p); if (!r.ok) throw new SyncError('Could not load ' + p); return r.json(); };
  const [graph, studio, projects] = await Promise.all([load('content/learning-graph.json'), load('content/studio.json'),
    load('content/projects.json').catch(() => ({projects: []}))]);
  const conceptIds = new Set(studio.concepts.map(c => c.id));
  const put = (k, v) => storage.setItem(k, JSON.stringify(v));
  return [
    {file: 'lfz-studio.json', label: 'Learn & listen notes',
     read: () => ({app: 'lfz-studio', version: 1, items: readJson(storage, 'lfz-studio-progress', {})}),
     merge: (l, r) => ({app: 'lfz-studio', version: 1, items: mergeProgress(l.items, r, conceptIds)}),
     write: m => put('lfz-studio-progress', m.items)},
    {file: 'lfz-learning.json', label: 'learning plan',
     read: () => { const saved = readJson(storage, 'lfz-learning-v1', null); return saved ? mergeLearning(emptyState(), saved, graph) : emptyState(); },
     merge: (l, r) => mergeLearning(l, r, graph),
     write: m => put('lfz-learning-v1', m)},
    {file: 'lfz-etl-check.json', label: 'ETL topic check',
     read: () => readJson(storage, 'lfz-etl-check-v1', {}) || {},
     merge: (l, r) => newerRecords(l, r),
     write: m => put('lfz-etl-check-v1', m)},
    {file: 'lfz-etl.json', label: 'ETL known topics',
     read: () => readJson(storage, 'lfz-etl-v1', {}) || {},
     merge: mergeEtl,
     write: m => put('lfz-etl-v1', m)},
    // each resume project keeps its plan and its check like the ETL project, under its own keys
    ...projects.projects.flatMap(p => [
      {file: `lfz-proj-${p.id}.json`, label: `${p.name} known topics`,
       read: () => readJson(storage, `lfz-proj-${p.id}-v1`, {}) || {}, merge: mergeEtl, write: m => put(`lfz-proj-${p.id}-v1`, m)},
      {file: `lfz-proj-${p.id}-check.json`, label: `${p.name} topic check`,
       read: () => readJson(storage, `lfz-proj-${p.id}-check-v1`, {}) || {}, merge: (l, r) => newerRecords(l, r), write: m => put(`lfz-proj-${p.id}-check-v1`, m)}]),
  ];
}

// The practice app's data lives in Python's database in this browser; it has its own export and
// merging import (py/sync.py). `api` is app.js's request function.
export function practicePart(api) {
  const strip = d => { if (!d) return d; const {exported, ...rest} = d; return rest; };
  return {file: 'lfz-practice.json', label: 'practice progress',
    read: () => api('/api/export'),
    merge: async (l, r) => { await api('/api/import', {data: r}); return api('/api/export'); },
    write: () => {},  // the import already wrote it
    same: (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b))};
}

// ------------------------------------------------------------------ connecting and syncing
// work: a work or shared computer. The token is kept in sessionStorage, so it is gone when the browser
// closes; the next session asks for it again. Progress itself stays in this browser as usual.
export async function connect(token, {storage = globalThis.localStorage, fetchImpl = globalThis.fetch, work = false, session = sessionDefault(), via = 'token'} = {}) {
  token = String(token || '').trim();
  if (!/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(token)) throw new SyncError('That does not look like a GitHub token (it starts with github_pat_ or ghp_).');
  const client = gistClient(token, fetchImpl);
  const gistId = (await client.find()) || (await client.create());
  if (work) {
    if (!session) throw new SyncError('This browser has no session storage; use personal mode or no sync here.');
    session.setItem(TOKEN_KEY, token);
  }
  writeSettings({token, gistId, last: 0, work, via}, storage);
  return gistId;
}

export async function syncNow(parts, {storage = globalThis.localStorage, fetchImpl = globalThis.fetch, session = sessionDefault()} = {}) {
  const s = readSettings(storage, session);
  if (!s.gistId) throw new SyncError('Sync is not set up on this device.');
  if (!s.token) throw new SyncError(s.work ? 'Work mode: paste your token again for this browser session.' : 'Sync is not set up on this device.');
  const result = await syncParts(gistClient(s.token, fetchImpl), s.gistId, parts);
  writeSettings({...s, last: Date.now(), updated: result.updated}, storage);
  return result;
}

export function forget(storage = globalThis.localStorage, session = sessionDefault()) { storage.removeItem(SYNC_KEY); session?.removeItem(TOKEN_KEY); }
