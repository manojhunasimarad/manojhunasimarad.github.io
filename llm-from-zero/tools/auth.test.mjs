// Sign in with GitHub: the page's half (auth.mjs) and the helper's half (auth-worker/worker.js), with a fake GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {signInUrl, finishSignIn, signOut, configured} from '../auth.mjs';
import {readSettings} from '../cloud-sync.mjs';
import worker from '../../auth-worker/worker.js';

const mem = () => { const m = new Map(); return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
const cfg = {clientId: 'Ov23liTEST', helper: 'https://lfz-auth.example.workers.dev/'};
const TOKEN = 'gho_' + 'a'.repeat(36);
const BASE = 'https://manojhunasimarad.github.io/llm-from-zero/studio.html#setup';
const json = (status, body) => ({ok: status < 400, status, json: async () => body});

function fakeNet(calls) {
  return async (url, opt = {}) => {
    calls.push(`${opt.method || 'GET'} ${url}`);
    if (url.endsWith('/exchange')) return JSON.parse(opt.body).code === 'goodcode123' ? json(200, {access_token: TOKEN}) : json(400, {error: 'bad_verification_code'});
    if (url.endsWith('/revoke')) return json(200, {ok: true});
    if (url.includes('api.github.com/gists') && (opt.method || 'GET') === 'GET' && !/gists\/g/.test(url)) return json(200, []);
    if (url.includes('api.github.com/gists') && opt.method === 'POST') return json(201, {id: 'g1'});
    return json(404, {});
  };
}

test('sign-in URL asks GitHub for gist access only, with a fresh state and the auth page as redirect', () => {
  const session = mem();
  const url = new URL(signInUrl({cfg, session, back: BASE, base: BASE}));
  assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(url.searchParams.get('scope'), 'gist');
  assert.equal(url.searchParams.get('client_id'), 'Ov23liTEST');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://manojhunasimarad.github.io/llm-from-zero/auth.html');
  assert.equal(url.searchParams.get('state'), JSON.parse(session.getItem('lfz-auth-pending')).state);
  assert.equal(configured(cfg), true);
  assert.equal(configured({clientId: '', helper: ''}), false);
});

test('finishing the sign-in checks the state, exchanges the code, connects sync and returns', async () => {
  const session = mem(), storage = mem(), calls = [];
  const state = new URL(signInUrl({cfg, session, back: BASE, base: BASE})).searchParams.get('state');
  const back = await finishSignIn({search: `?code=goodcode123&state=${state}`, cfg, session, storage, fetchImpl: fakeNet(calls)});
  assert.equal(back, BASE);
  const s = readSettings(storage, session);
  assert.equal(s.token, TOKEN); assert.equal(s.gistId, 'g1'); assert.equal(s.via, 'github');
  assert.ok(calls[0].endsWith('/exchange'));
});

test('a forged, reused or cancelled sign-in is refused', async () => {
  const session = mem(), storage = mem(), net = fakeNet([]);
  signInUrl({cfg, session, back: BASE, base: BASE});
  await assert.rejects(finishSignIn({search: '?code=goodcode123&state=forged', cfg, session, storage, fetchImpl: net}), /stale/);
  await assert.rejects(finishSignIn({search: '?code=goodcode123&state=forged', cfg, session, storage, fetchImpl: net}), /stale/);   // state is one-shot
  const state = new URL(signInUrl({cfg, session, back: BASE, base: BASE})).searchParams.get('state');
  await assert.rejects(finishSignIn({search: `?error=access_denied&state=${state}`, cfg, session, storage, fetchImpl: net}), /cancelled/);
  assert.equal(readSettings(storage, session).token, undefined);
});

test('work mode signs in for this session only; sign out forgets and revokes', async () => {
  const session = mem(), storage = mem(), calls = [];
  const state = new URL(signInUrl({cfg, session, back: BASE, base: BASE, work: true})).searchParams.get('state');
  await finishSignIn({search: `?code=goodcode123&state=${state}`, cfg, session, storage, fetchImpl: fakeNet(calls)});
  assert.ok(!storage.getItem('lfz-sync-v1').includes(TOKEN));
  assert.equal(readSettings(storage, session).token, TOKEN);
  await signOut({cfg, storage, session, fetchImpl: fakeNet(calls)});
  assert.equal(readSettings(storage, session).token, undefined);
  assert.ok(calls.at(-1).endsWith('/revoke'));
});

test('the helper exchanges codes only for the site, keeps the secret server-side and can revoke', async () => {
  const env = {CLIENT_ID: 'Ov23liTEST', CLIENT_SECRET: 's3cret', ALLOWED_ORIGIN: 'https://manojhunasimarad.github.io'};
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    seen.push({url, opt});
    if (url === 'https://github.com/login/oauth/access_token') return new Response(JSON.stringify(JSON.parse(opt.body).code === 'goodcode123' ? {access_token: TOKEN, scope: 'gist'} : {error: 'bad_verification_code'}));
    if (url.includes('/applications/')) return new Response(null, {status: 204});
    return new Response('{}', {status: 404});
  };
  try {
    const call = (path, body, origin = env.ALLOWED_ORIGIN, method = 'POST') => worker.fetch(new Request('https://w.example' + path,
      {method, headers: {Origin: origin, 'Content-Type': 'application/json'}, body: method === 'POST' ? JSON.stringify(body) : undefined}), env);
    let r = await call('/exchange', {code: 'goodcode123'});
    assert.equal(r.status, 200); assert.equal((await r.json()).access_token, TOKEN);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
    assert.equal(JSON.parse(seen[0].opt.body).client_secret, 's3cret');          // only ever sent to GitHub
    r = await call('/exchange', {code: 'goodcode123'}, 'https://evil.example');
    assert.equal(r.status, 403);
    r = await call('/exchange', {code: 'wrongcode1'});
    assert.equal(r.status, 400);
    r = await call('/exchange', {code: '../../x'});
    assert.equal(r.status, 400);
    r = await call('/revoke', {token: TOKEN});
    assert.equal(r.status, 200);
    assert.match(seen.at(-1).opt.headers.Authorization, /^Basic /);
    assert.equal((await call('/other', {})).status, 404);
  } finally { globalThis.fetch = realFetch; }
});

test('the auth page and module are precached and served', async () => {
  const root = new URL('../', import.meta.url);
  const [config, serve, server, html] = await Promise.all(['config.js', 'tools/serve.mjs', 'py/server.py', 'auth.html'].map(p => fs.readFile(new URL(p, root), 'utf8')));
  for (const f of ['auth.mjs', 'auth.html']) { assert(config.includes(`"${f}"`), f); assert(serve.includes(`'${f}'`), f); assert(server.includes(`"${f}"`), f); }
  assert(html.indexOf('const search = location.search') < html.indexOf('history.replaceState'), 'read the code before clearing the address bar');
});
