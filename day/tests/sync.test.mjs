import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from '../sync.mjs';
import * as C from '../core.mjs';

function store(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
// A tiny stand-in for the GitHub gists API.
function github({ token = 'gho_test123456789012345678901' } = {}) {
  const gists = new Map(); let seq = 0; const calls = [];
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  async function fetchImpl(url, opt = {}) {
    calls.push(opt.method + ' ' + url.replace('https://api.github.com', ''));
    if ((opt.headers || {}).Authorization !== 'Bearer ' + token) return json(401, {});
    const path = url.replace('https://api.github.com', '');
    if (opt.method === 'GET' && path.startsWith('/gists?')) return json(200, [...gists.values()].map(g => ({ id: g.id, description: g.description })));
    if (opt.method === 'POST' && path === '/gists') {
      const b = JSON.parse(opt.body), id = 'g' + (++seq);
      gists.set(id, { id, description: b.description, files: Object.fromEntries(Object.entries(b.files).map(([n, f]) => [n, f.content])) });
      return json(201, { id });
    }
    const m = /^\/gists\/(\w+)$/.exec(path), g = m && gists.get(m[1]);
    if (!g) return json(404, {});
    if (opt.method === 'GET') return json(200, { updated_at: 'x', files: Object.fromEntries(Object.entries(g.files).map(([n, c]) => [n, { content: c, size: c.length, truncated: false }])) });
    if (opt.method === 'PATCH') { for (const [n, f] of Object.entries(JSON.parse(opt.body).files)) g.files[n] = f.content; return json(200, { updated_at: 'y' }); }
    return json(400, {});
  }
  return { fetchImpl, gists, calls, token };
}
const signedIn = (gh, extra = {}) => store({ 'lfz-sync-v1': { token: gh.token, gistId: 'lfz-gist', via: 'github' }, ...extra });
const kitchenState = note => JSON.stringify({ v: 2, done: { 'b2-x': 1 }, week: {}, pantry: {}, days: { '2026-11-27': 1 }, set: {}, plan: {}, basket: {}, pick: {}, me: { name: note }, wlog: {}, labs: {} });

test('uses LLM From Zero’s sign-in, makes its own gist, sends records and app copies', async () => {
  const gh = github(), phone = signedIn(gh, { 'kfz.state': kitchenState('phone'), 'dojo.account': { v: 1, capital: 100000, history: [{ end: 101000 }], missions: { a: 1 } } });
  const s = C.emptyState(); C.put(s, { id: 'rev:2026-11-27', k: 'rev', mood: 4 }, 1000);
  const r = await Y.syncNow({ state: s, store: phone, fetchImpl: gh.fetchImpl, device: 'phone', now: 5000 });
  assert.equal(gh.gists.size, 1);
  const g = [...gh.gists.values()][0];
  assert.equal(g.description, Y.DESCRIPTION);
  assert.deepEqual(Object.keys(g.files).sort(), ['day-app-dojo.json', 'day-app-kitchen.json', 'day-readme.md', 'day-records.json']);
  assert.ok(!JSON.stringify(g.files).includes(gh.token), 'the token never goes into the gist');
  assert.deepEqual(r.report.sent, ['Dinachari', 'Kitchen From Zero', 'Dalal Dojo desk']);
  assert.equal(Y.readMeta(phone).gistId, g.id);
  // nothing changed: nothing is sent again
  const again = await Y.syncNow({ state: r.state, store: phone, fetchImpl: gh.fetchImpl, now: 6000 });
  assert.equal(Y.describe(again.report), 'Already in sync.');
  assert.ok(!gh.calls.slice(-1)[0].startsWith('PATCH'));
});

test('a second device gets everything, then both sides merge record by record', async () => {
  const gh = github(), phone = signedIn(gh, { 'kfz.state': kitchenState('phone') }), laptop = signedIn(gh);
  const a = C.emptyState(); C.put(a, { id: 'rev:2026-11-27', k: 'rev', mood: 4 }, 1000);
  const r1 = await Y.syncNow({ state: a, store: phone, fetchImpl: gh.fetchImpl, now: 2000 });
  const r2 = await Y.syncNow({ state: C.emptyState(), store: laptop, fetchImpl: gh.fetchImpl, now: 3000 });
  assert.equal(C.get(r2.state, 'rev:2026-11-27').mood, 4);
  assert.equal(laptop.getItem('kfz.state'), phone.getItem('kfz.state'));
  assert.deepEqual(r2.downloaded, ['kitchen']);
  // both log different things, then sync in turn
  const b = r2.state; C.put(b, { id: 'cook:1', k: 'cook', dish: 'Pulao' }, 4000);
  const a2 = r1.state; C.put(a2, { id: 'act:1', k: 'act', type: 'Walk' }, 4100);
  await Y.syncNow({ state: b, store: laptop, fetchImpl: gh.fetchImpl, now: 5000 });
  const r3 = await Y.syncNow({ state: a2, store: phone, fetchImpl: gh.fetchImpl, now: 6000 });
  assert.ok(C.get(r3.state, 'cook:1') && C.get(r3.state, 'act:1'));
  const r4 = await Y.syncNow({ state: b, store: laptop, fetchImpl: gh.fetchImpl, now: 7000 });
  assert.ok(C.get(r4.state, 'act:1'));
});

test('an app copy changed on one side is taken; changed on both, nothing is overwritten until you choose', async () => {
  const gh = github(), phone = signedIn(gh, { 'kfz.state': kitchenState('v1') }), laptop = signedIn(gh);
  await Y.syncNow({ state: C.emptyState(), store: phone, fetchImpl: gh.fetchImpl });
  await Y.syncNow({ state: C.emptyState(), store: laptop, fetchImpl: gh.fetchImpl });
  phone.setItem('kfz.state', kitchenState('phone-edit'));
  await Y.syncNow({ state: C.emptyState(), store: phone, fetchImpl: gh.fetchImpl });
  await Y.syncNow({ state: C.emptyState(), store: laptop, fetchImpl: gh.fetchImpl });
  assert.match(laptop.getItem('kfz.state'), /phone-edit/);
  // now both edit before syncing
  phone.setItem('kfz.state', kitchenState('phone-2'));
  laptop.setItem('kfz.state', kitchenState('laptop-2'));
  await Y.syncNow({ state: C.emptyState(), store: phone, fetchImpl: gh.fetchImpl, device: 'phone' });
  const r = await Y.syncNow({ state: C.emptyState(), store: laptop, fetchImpl: gh.fetchImpl });
  assert.deepEqual(r.report.conflicts, ['Kitchen From Zero changed on two devices']);
  assert.match(laptop.getItem('kfz.state'), /laptop-2/, 'kept until you choose');
  assert.equal(Y.readMeta(laptop).conflicts.kitchen.device, 'phone');
  // choose the synced copy: yours is kept for undo
  assert.equal(Y.resolve('kitchen', 'synced', laptop), true);
  assert.match(laptop.getItem('kfz.state'), /phone-2/);
  assert.match(laptop.getItem('day.undo.kfz.state'), /laptop-2/);
  const after = await Y.syncNow({ state: C.emptyState(), store: laptop, fetchImpl: gh.fetchImpl });
  assert.deepEqual(after.report.conflicts, []);
  // or keep this device's: it is sent on the next sync
  phone.setItem('kfz.state', kitchenState('phone-3')); laptop.setItem('kfz.state', kitchenState('laptop-3'));
  await Y.syncNow({ state: C.emptyState(), store: phone, fetchImpl: gh.fetchImpl });
  await Y.syncNow({ state: C.emptyState(), store: laptop, fetchImpl: gh.fetchImpl });
  Y.resolve('kitchen', 'here', laptop);
  await Y.syncNow({ state: C.emptyState(), store: laptop, fetchImpl: gh.fetchImpl });
  await Y.syncNow({ state: C.emptyState(), store: phone, fetchImpl: gh.fetchImpl });
  assert.match(phone.getItem('kfz.state'), /laptop-3/);
});

test('an empty copy on a new device never wins over real data', () => {
  const app = Y.APPS[0];
  const empty = JSON.stringify({ v: 2, set: { household: { members: [] } } });
  const d = Y.decide(app, empty, { hash: C.hash(kitchenState('x')), data: kitchenState('x') }, undefined);
  assert.equal(d.action, 'download');
  const d2 = Y.decide(app, kitchenState('mine'), { hash: C.hash(empty), data: empty }, undefined);
  assert.equal(d2.action, 'upload');
  const bad = Y.decide(app, kitchenState('mine'), { hash: 'tampered', data: kitchenState('x') }, undefined);
  assert.equal(bad.action, 'upload');
});

test('plain messages for a missing or revoked sign-in', async () => {
  await assert.rejects(Y.syncNow({ state: C.emptyState(), store: store(), fetchImpl: async () => ({}) }), /Sign in with GitHub first/);
  const gh = github(), st = store({ 'lfz-sync-v1': { token: 'gho_revoked0000000000000000000' } });
  await assert.rejects(Y.syncNow({ state: C.emptyState(), store: st, fetchImpl: gh.fetchImpl }), /Sign in again/);
  const work = store({ 'lfz-sync-v1': { work: true, gistId: 'x' } });
  assert.equal(Y.signIn(work, store()).needsToken, true);
  assert.equal(Y.signIn(work, store({ 'lfz-sync-token': 'gho_abc' })).token, 'gho_abc');
  const off = await Y.syncNow({ state: C.emptyState(), store: signedIn(gh), fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }).catch(e => e);
  assert.match(off.message, /not reachable/);
});

test('a deleted gist is made again', async () => {
  const gh = github(), st = signedIn(gh);
  await Y.syncNow({ state: C.emptyState(), store: st, fetchImpl: gh.fetchImpl });
  gh.gists.clear();
  const r = await Y.syncNow({ state: C.emptyState(), store: st, fetchImpl: gh.fetchImpl });
  assert.equal(gh.gists.size, 1);
  assert.equal(Y.readMeta(st).gistId, [...gh.gists.keys()][0]);
  assert.deepEqual(r.report.sent, ['Dinachari']);
});
