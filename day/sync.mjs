// Sync across your phone and laptop through one secret GitHub gist of your own. It uses the GitHub
// sign-in LLM From Zero already has (a token with only the "gist" scope), so there is one sign-in for
// the whole site. Dinachari keeps its own gist, so a sync here never downloads or changes the
// learning app's files.
//
//   day-records.json        everything logged in Dinachari; the newer copy of each record wins
//   day-app-kitchen.json    a copy of Kitchen From Zero's saved data (kfz.state)
//   day-app-dojo.json       a copy of Dalal Dojo's paper desk (dojo.account)
//   day-app-lessons.json    a copy of Dojo lessons and lab (dalal-dojo-v1)
//
// The app copies have no per-item dates, so they follow a file rule: whichever side changed since the
// last sync is taken. When both sides changed, nothing is overwritten: you choose which copy to keep.
// A secret gist is unlisted, not encrypted: anyone with its address can read it. Nothing in it is a
// password; sign-in tokens and API keys are never put in it.

import { mergeStates, normState, hash } from './core.mjs';

export const DESCRIPTION = 'Dinachari: daily sync (manojhunasimarad.github.io)';
export const RECORDS = 'day-records.json';
export const META_KEY = 'day.sync.meta';
const API = 'https://api.github.com';
const README = '# Dinachari sync\n\nWritten by https://manojhunasimarad.github.io/ so your day looks the same on every device.\nDo not edit by hand. Delete this gist to start sync over.\n';
const MAX = 4_000_000;

const nonEmpty = o => o && typeof o === 'object' && Object.keys(o).length > 0;
export const APPS = [
  { id: 'kitchen', key: 'kfz.state', file: 'day-app-kitchen.json', name: 'Kitchen From Zero',
    empty: v => !['done', 'week', 'pantry', 'days', 'plan', 'basket', 'pick', 'me', 'wlog', 'labs'].some(k => nonEmpty(v && v[k])) },
  { id: 'dojo', key: 'dojo.account', file: 'day-app-dojo.json', name: 'Dalal Dojo desk',
    empty: v => !v || (!(v.history || []).length && !nonEmpty(v.missions) && !(v.trips || []).length && !v.day) },
  { id: 'lessons', key: 'dalal-dojo-v1', file: 'day-app-lessons.json', name: 'Dojo lessons and lab',
    empty: v => !v || (!(+v.xp) && !nonEmpty(v.lessons) && !nonEmpty(v.quiz)) }
];

export class SyncError extends Error { constructor(msg, status = 0) { super(msg); this.status = status; } }

/* ------------------------------------------------------------------ the sign-in shared with LLM From Zero */
const sessionDefault = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
export function signIn(store = globalThis.localStorage, session = sessionDefault()) {
  let s = {};
  try { s = JSON.parse(store.getItem('lfz-sync-v1')) || {}; } catch {}
  const token = s.token || (s.work && session ? session.getItem('lfz-sync-token') || '' : '');
  return { token, work: !!s.work, via: s.via || (token ? 'token' : ''), needsToken: !!s.work && !token && !!s.gistId };
}

/* ------------------------------------------------------------------ GitHub */
export function gist(token, fetchImpl = globalThis.fetch) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchImpl(API + path, { method, headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
        body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch { throw new SyncError('GitHub is not reachable. You may be offline; everything stays on this device and syncs later.'); }
    if (res.status === 401) throw new SyncError('GitHub refused the sign-in: it was revoked or has expired. Sign in again.', 401);
    if (res.status === 403 || res.status === 429) throw new SyncError('GitHub refused the request: the sign-in needs gist access, or the hourly limit was reached. Try again later.', res.status);
    if (res.status === 404) throw new SyncError('The sync gist was not found.', 404);
    if (!res.ok) throw new SyncError(`GitHub answered ${res.status}. Try again later.`, res.status);
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
    async create() { return (await call('POST', '/gists', { description: DESCRIPTION, public: false, files: { 'day-readme.md': { content: README } } })).id; },
    async read(id) {
      const g = await call('GET', `/gists/${id}`), files = {};
      for (const [name, f] of Object.entries(g.files || {})) {
        if (!name.endsWith('.json')) continue;
        if (f.size > MAX) throw new SyncError(`${name} in the gist is over 4 MB; sync stopped to protect your data plan.`);
        if (f.truncated) {
          const raw = await fetchImpl(f.raw_url, { cache: 'no-store' }).catch(() => null);
          if (!raw || !raw.ok) throw new SyncError(`Could not download ${name} from the gist.`);
          files[name] = await raw.text();
        } else files[name] = f.content;
      }
      return { files, updated: g.updated_at };
    },
    async write(id, files) {
      return (await call('PATCH', `/gists/${id}`, { files: Object.fromEntries(Object.entries(files).map(([n, c]) => [n, { content: c }])) })).updated_at;
    }
  };
}

/* ------------------------------------------------------------------ meta kept on this device */
export function readMeta(store = globalThis.localStorage) {
  try { const m = JSON.parse(store.getItem(META_KEY)) || {}; return { gistId: m.gistId || '', base: m.base || {}, last: m.last || 0, conflicts: m.conflicts || {}, error: m.error || '', on: m.on !== false }; }
  catch { return { gistId: '', base: {}, last: 0, conflicts: {}, error: '', on: true }; }
}
export function writeMeta(meta, store = globalThis.localStorage) { try { store.setItem(META_KEY, JSON.stringify(meta)); } catch {} }

const parse = t => { try { return JSON.parse(t); } catch { return null; } };
const sameRecords = (a, b) => JSON.stringify(normState(a).rec) === JSON.stringify(normState(b).rec);

/** One app copy: decide what to do. Returns {action: 'none'|'upload'|'download'|'conflict', ...}. */
export function decide(app, localText, remoteFile, base) {
  const lh = localText == null ? null : hash(localText);
  const r = remoteFile && typeof remoteFile.data === 'string' && remoteFile.hash === hash(remoteFile.data) ? remoteFile : null;
  const rh = r ? r.hash : null;
  if (lh == null && rh == null) return { action: 'none', base };
  if (rh == null) return { action: 'upload', base: lh };
  if (lh == null) return { action: 'download', base: rh, data: r.data };
  if (lh === rh) return { action: 'none', base: lh };
  if (base === lh) return { action: 'download', base: rh, data: r.data };
  if (base === rh) return { action: 'upload', base: lh };
  if (app.empty(parse(localText))) return { action: 'download', base: rh, data: r.data };
  if (app.empty(parse(r.data))) return { action: 'upload', base: lh };
  return { action: 'conflict', base, remote: { hash: rh, data: r.data, at: r.at || 0, device: r.device || '' } };
}

/**
 * Sync now. `state` is Dinachari's records; returns the merged records to save, and the new meta.
 * Downloaded app copies are written straight to their keys in `store`.
 */
export async function syncNow({ state, store = globalThis.localStorage, session = sessionDefault(), fetchImpl = globalThis.fetch, device = '', now = Date.now() } = {}) {
  const { token } = signIn(store, session);
  if (!token) throw new SyncError('Sign in with GitHub first (Settings, Sync).');
  const meta = readMeta(store), c = gist(token, fetchImpl);
  let id = meta.gistId || await c.find() || await c.create(), remote;
  try { remote = await c.read(id); }
  catch (e) {
    if (e.status !== 404) throw e;
    id = await c.find() || await c.create(); meta.base = {}; remote = await c.read(id);
  }
  const upload = {}, report = { got: [], sent: [], conflicts: [] };

  const rem = parse(remote.files[RECORDS]);
  let merged = normState(state);
  if (rem && rem.rec) {
    const m = mergeStates(state, rem);
    merged = m.state;
    if (m.took) report.got.push(`${m.took} change${m.took === 1 ? '' : 's'} from your other devices`);
  }
  if (!rem || !sameRecords(merged, rem)) {
    const text = JSON.stringify({ app: 'dinachari', v: 1, at: now, device, rec: merged.rec });
    if (text.length > MAX) throw new SyncError('Your Dinachari records are over 4 MB; sync stopped. Download a backup and start fresh.');
    upload[RECORDS] = text; report.sent.push('Dinachari');
  }

  const base = { ...meta.base }, conflicts = {}, downloaded = [];
  for (const app of APPS) {
    const local = store.getItem(app.key);
    const d = decide(app, local, parse(remote.files[app.file]), base[app.id]);
    if (d.action === 'upload') {
      if (local.length > MAX) { report.conflicts.push(`${app.name} is too large to sync`); continue; }
      upload[app.file] = JSON.stringify({ key: app.key, hash: d.base, at: now, device, data: local });
      report.sent.push(app.name);
    } else if (d.action === 'download') {
      try { store.setItem(app.key, d.data); downloaded.push(app.id); report.got.push(app.name); } catch { report.conflicts.push(`${app.name}: no room to save it here`); continue; }
    } else if (d.action === 'conflict') {
      conflicts[app.id] = { ...d.remote, name: app.name, key: app.key, seen: now };
      report.conflicts.push(`${app.name} changed on two devices`);
    }
    if (d.action !== 'conflict') base[app.id] = d.base;
  }
  if (Object.keys(upload).length) await c.write(id, upload);
  const out = { ...meta, gistId: id, base, last: now, conflicts, error: '' };
  writeMeta(out, store);
  return { state: merged, meta: out, report, downloaded };
}

/** Settle a conflict: keep the copy on this device ('here') or take the synced one ('synced'). */
export function resolve(appId, choice, store = globalThis.localStorage) {
  const meta = readMeta(store), cf = meta.conflicts[appId], app = APPS.find(a => a.id === appId);
  if (!cf || !app) return false;
  if (choice === 'synced') {
    const mine = store.getItem(app.key);
    if (mine != null) try { store.setItem('day.undo.' + app.key, JSON.stringify({ at: Date.now(), data: mine })); } catch {}
    store.setItem(app.key, cf.data);
    meta.base[appId] = cf.hash;
  } else meta.base[appId] = cf.hash;     // as if the synced copy had been seen: the next sync sends this one
  delete meta.conflicts[appId];
  writeMeta(meta, store);
  return true;
}
export const describe = r => [
  r.got.length ? 'Updated here: ' + r.got.join(', ') + '.' : '',
  r.sent.length ? 'Sent: ' + r.sent.join(', ') + '.' : '',
  r.conflicts.length ? 'Needs you: ' + r.conflicts.join('; ') + '.' : '',
  !r.got.length && !r.sent.length && !r.conflicts.length ? 'Already in sync.' : ''
].filter(Boolean).join(' ');
