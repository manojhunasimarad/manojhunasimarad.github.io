// Sync across devices, against a fake GitHub: two browsers, one gist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect, gistClient, localParts, mergeEtl, newerRecords, practicePart, readSettings, syncNow, syncParts,
  SyncError, DESCRIPTION} from '../cloud-sync.mjs';

const root = new URL('../', import.meta.url);
const TOKEN = 'github_pat_' + 'x'.repeat(40);

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m};
}

// A gist service with the endpoints the client uses, and the content files served from disk.
function fakeGitHub() {
  const gists = new Map(), calls = [];
  let n = 0;
  const json = (status, body) => ({ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body)});
  const fetchImpl = async (url, opt = {}) => {
    const u = new URL(url, 'https://example.test/');
    if (!u.hostname.includes('github')) {
      const text = await fs.readFile(new URL(u.pathname.replace(/^\//, ''), root), 'utf8');
      return {ok: true, status: 200, json: async () => JSON.parse(text)};
    }
    calls.push(`${opt.method || 'GET'} ${u.pathname}`);
    if (opt.headers?.Authorization !== `Bearer ${TOKEN}`) return json(401, {});
    const body = opt.body ? JSON.parse(opt.body) : null;
    if (u.pathname === '/gists' && (opt.method || 'GET') === 'GET') return json(200, [...gists.values()].map(g => ({id: g.id, description: g.description})));
    if (u.pathname === '/gists' && opt.method === 'POST') {
      const id = 'g' + (++n);
      gists.set(id, {id, description: body.description, files: {}, updated_at: 't0'});
      for (const [name, f] of Object.entries(body.files)) gists.get(id).files[name] = f.content;
      return json(201, {id});
    }
    const g = gists.get(u.pathname.split('/')[2]);
    if (!g) return json(404, {});
    if (opt.method === 'PATCH') {
      for (const [name, f] of Object.entries(body.files)) g.files[name] = f.content;
      g.updated_at = 't' + calls.length;
    }
    return json(200, {updated_at: g.updated_at, files: Object.fromEntries(Object.entries(g.files).map(([k, c]) => [k, {content: c, size: c.length, truncated: false}]))});
  };
  return {gists, calls, fetchImpl};
}

const studio = JSON.parse(await fs.readFile(new URL('content/studio.json', root), 'utf8'));
const graph = JSON.parse(await fs.readFile(new URL('content/learning-graph.json', root), 'utf8'));
const [c1, c2] = studio.concepts.map(c => c.id);
const topic = graph.nodes[0].id;

test('connect finds or creates one secret gist and refuses a non-token', async () => {
  const gh = fakeGitHub(), a = memoryStorage(), b = memoryStorage();
  await assert.rejects(connect('hello', {storage: a, fetchImpl: gh.fetchImpl}), SyncError);
  const id = await connect(TOKEN, {storage: a, fetchImpl: gh.fetchImpl});
  assert.equal(await connect(TOKEN, {storage: b, fetchImpl: gh.fetchImpl}), id, 'the second device finds the same gist');
  assert.equal(gh.gists.size, 1);
  assert.equal(gh.gists.get(id).description, DESCRIPTION);
  assert.equal(readSettings(a).gistId, id);
});

test('two devices end up with the union of their notes, newest note winning', async () => {
  const gh = fakeGitHub();
  const laptop = memoryStorage({'lfz-studio-progress': JSON.stringify({[c1]: {status: 'learning', note: 'laptop old', updated: 1000}})});
  const phone = memoryStorage({'lfz-studio-progress': JSON.stringify({[c1]: {status: 'verified', note: 'phone newer', updated: 2000},
    [c2]: {status: 'learning', note: 'only on phone', updated: 1500}})});
  for (const s of [laptop, phone]) await connect(TOKEN, {storage: s, fetchImpl: gh.fetchImpl});
  const parts = s => localParts({storage: s, fetchImpl: gh.fetchImpl});
  const r1 = await syncNow(await parts(laptop), {storage: laptop, fetchImpl: gh.fetchImpl});
  assert.equal(r1.changedHere, false, 'first device: nothing to receive');
  const r2 = await syncNow(await parts(phone), {storage: phone, fetchImpl: gh.fetchImpl});
  assert.equal(JSON.parse(phone.getItem('lfz-studio-progress'))[c1].note, 'phone newer');
  const r3 = await syncNow(await parts(laptop), {storage: laptop, fetchImpl: gh.fetchImpl});
  assert.equal(r3.changedHere, true);
  const merged = JSON.parse(laptop.getItem('lfz-studio-progress'));
  assert.equal(merged[c1].note, 'phone newer');
  assert.equal(merged[c2].note, 'only on phone');
  const r4 = await syncNow(await parts(laptop), {storage: laptop, fetchImpl: gh.fetchImpl});
  assert.ok(r4.report.every(p => !p.sent && !p.received), 'a second sync sends nothing');
  assert.ok(!r2.report.find(p => p.label === 'Learn & listen notes').note);
});

test('the learning plan merges through mergeLearning', async () => {
  const gh = fakeGitHub(), now = Date.now();
  const rec = {status: 'learning', answer: 'a', evidence: 'e', due: '2026-11-30', step: 0, updated: now - 1000};
  const a = memoryStorage(), b = memoryStorage({'lfz-learning-v1': JSON.stringify({app: 'lfz-learning', version: 1, topics: {[topic]: rec},
    projects: {}, sessions: {}, quizAttempts: {}, settings: {track: 'apps', minutes: 20, weeklyDays: 3, updated: 0}})});
  for (const s of [b, a]) { await connect(TOKEN, {storage: s, fetchImpl: gh.fetchImpl}); await syncNow(await localParts({storage: s, fetchImpl: gh.fetchImpl}), {storage: s, fetchImpl: gh.fetchImpl}); }
  assert.equal(JSON.parse(a.getItem('lfz-learning-v1')).topics[topic].status, 'learning');
});

test('a PATCH sends only changed files, so the studio never overwrites the practice file', async () => {
  const gh = fakeGitHub(), s = memoryStorage();
  const id = await connect(TOKEN, {storage: s, fetchImpl: gh.fetchImpl});
  gh.gists.get(id).files['lfz-practice.json'] = '{"app":"llm-from-zero","tables":{}}';
  await syncNow(await localParts({storage: s, fetchImpl: gh.fetchImpl}), {storage: s, fetchImpl: gh.fetchImpl});
  assert.equal(gh.gists.get(id).files['lfz-practice.json'], '{"app":"llm-from-zero","tables":{}}');
  assert.ok(gh.gists.get(id).files['lfz-studio.json']);
});

test('the practice part imports the other device, then sends the merged export', async () => {
  let db = {solved: ['a']};
  const api = async (path, body) => {
    if (path === '/api/export') return {app: 'llm-from-zero', exported: Math.random(), tables: {solved: [...db.solved].sort()}};
    db = {solved: [...new Set([...db.solved, ...body.data.tables.solved])]};
    return {ok: true};
  };
  const part = practicePart(api);
  const client = {files: {'lfz-practice.json': JSON.stringify({app: 'llm-from-zero', exported: 1, tables: {solved: ['b']}})},
    read: async () => ({files: client.files, updated: 'x'}), write: async (id, f) => { Object.assign(client.files, f); return 'y'; }};
  const r = await syncParts(client, 'g', [part]);
  assert.deepEqual(db.solved.sort(), ['a', 'b']);
  assert.deepEqual(JSON.parse(client.files['lfz-practice.json']).tables.solved, ['a', 'b']);
  assert.ok(r.report[0].received && r.report[0].sent);
  const again = await syncParts(client, 'g', [part]);
  assert.ok(!again.report[0].sent, 'only the export time differs: nothing is sent');
});

test('ETL records: newer decision wins; dated saves win whole; undated saves are joined', () => {
  assert.deepEqual(newerRecords({x: {decision: 'study', at: 1}}, {x: {decision: 'skip', at: 2}, __proto__: {}}).x.decision, 'skip');
  assert.equal(newerRecords({x: {decision: 'study', at: 3}}, {x: {decision: 'skip', at: 2}}).x.decision, 'study');
  assert.deepEqual(mergeEtl({goal: '3', known: ['a'], updated: 5}, {goal: '1', known: ['b'], updated: 9}), {goal: '1', known: ['b'], updated: 9});
  assert.deepEqual(mergeEtl({goal: '3', known: ['a']}, {goal: '1', known: ['b']}).known, ['a', 'b']);
  assert.deepEqual(mergeEtl({goal: '3', known: ['a']}, {nonsense: true}), {goal: '3', known: ['a']});
});

test('a broken gist file is replaced, a wrong token is explained', async () => {
  const s = memoryStorage(), gh = fakeGitHub();
  const id = await connect(TOKEN, {storage: s, fetchImpl: gh.fetchImpl});
  gh.gists.get(id).files['lfz-etl.json'] = '{not json';
  const r = await syncNow(await localParts({storage: s, fetchImpl: gh.fetchImpl}), {storage: s, fetchImpl: gh.fetchImpl});
  assert.match(r.report.find(p => p.label === 'ETL known topics').note, /unreadable/);
  await assert.rejects(gistClient('github_pat_wrongwrongwrongwrongwrong', gh.fetchImpl).read(id), /refused the token/);
});

test('every page loads the theme script before its styles', async () => {
  for (const page of ['studio.html', 'index.html']) {
    const html = await fs.readFile(new URL(page, root), 'utf8');
    assert.ok(html.indexOf('theme.js') > 0 && html.indexOf('theme.js') < html.indexOf('.css"'), page);
    assert.match(html, /data-theme-toggle/, page);
  }
  const css = await fs.readFile(new URL('studio.css', root), 'utf8');
  assert.match(css, /:root\[data-theme="dark"\]\{--bg:/);
});

test('offline download: the service worker knows the job and every new module is precached', async () => {
  const sw = await fs.readFile(new URL('sw.js', root), 'utf8');
  assert.match(sw, /type === 'offline-all'/);
  const cfg = await fs.readFile(new URL('config.js', root), 'utf8');
  for (const f of ['offline.mjs', 'theme.js', 'cloud-sync.mjs', 'sync-ui.mjs']) assert.ok(cfg.includes(`"${f}"`), f);
  assert.match(cfg, /"offlinePackages": \[\s*"numpy"/);
});
