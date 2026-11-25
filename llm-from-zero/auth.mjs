// Sign in with GitHub (OAuth). The page sends you to GitHub, GitHub sends you back to auth.html with a
// one-time code, the sign-in helper (auth-worker/worker.js on Cloudflare) turns the code into a token,
// and sync connects with it. The client ID and helper address are public by design; the secret lives
// only in the helper. Leave them empty and the sync panel offers token paste instead.
import {connect, forget, readSettings} from './cloud-sync.mjs';

export const GITHUB_AUTH = {
  clientId: 'Ov23liMUdKPIWsFYn4Bq',
  helper: 'https://lfz-auth.manojh-252cd017.workers.dev',
};
const PENDING = 'lfz-auth-pending';
export const configured = (cfg = GITHUB_AUTH) => !!(cfg.clientId && cfg.helper);

function randomState() {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function signInUrl({work = false, back = location.href, cfg = GITHUB_AUTH, session = sessionStorage, base = location.href} = {}) {
  const state = randomState();
  session.setItem(PENDING, JSON.stringify({state, work, back, at: Date.now()}));
  const redirect = new URL('auth.html', base).href;
  const q = new URLSearchParams({client_id: cfg.clientId, scope: 'gist', state, redirect_uri: redirect, allow_signup: 'false'});
  return 'https://github.com/login/oauth/authorize?' + q;
}

export function startSignIn(opts) { location.href = signInUrl(opts); }

// Runs on auth.html: check the state, exchange the code, connect sync, return to where you were.
export async function finishSignIn({search = location.search, cfg = GITHUB_AUTH, session = sessionStorage, fetchImpl = fetch,
                                    storage = localStorage} = {}) {
  const q = new URLSearchParams(search);
  let pending = null;
  try { pending = JSON.parse(session.getItem(PENDING)); } catch {}
  session.removeItem(PENDING);
  if (q.get('error')) throw new Error(q.get('error') === 'access_denied' ? 'You cancelled the sign-in.' : 'GitHub: ' + (q.get('error_description') || q.get('error')));
  if (!pending || !q.get('state') || q.get('state') !== pending.state || Date.now() - pending.at > 15 * 60_000)
    throw new Error('This sign-in link is stale or was not started here. Start again from the sync panel.');
  const r = await fetchImpl(cfg.helper.replace(/\/$/, '') + '/exchange', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({code: q.get('code') || ''})}).catch(() => null);
  if (!r) throw new Error('The sign-in helper is not reachable. Check your connection.');
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Sign-in failed: ' + (j.error || r.status));
  await connect(j.access_token, {work: !!pending.work, storage, session, fetchImpl, via: 'github'});
  return pending.back;
}

// Sign out: forget the token here and revoke it at GitHub, so a copy left anywhere stops working.
export async function signOut({cfg = GITHUB_AUTH, fetchImpl = fetch, storage = localStorage, session = sessionStorage} = {}) {
  const s = readSettings(storage, session);
  forget(storage, session);
  if (s.token && s.via === 'github' && configured(cfg))
    await fetchImpl(cfg.helper.replace(/\/$/, '') + '/revoke', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: s.token})}).catch(() => {});
}
