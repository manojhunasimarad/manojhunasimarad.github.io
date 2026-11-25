// The "Sync across devices" panel and automatic syncing, shared by the studio and the practice app.
import {SyncError, connect, describe, forget, readSettings, syncNow} from './cloud-sync.mjs';
import {configured, signOut, startSignIn} from './auth.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
let running = null;

function when(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(ms).toLocaleString();
}

// One sync at a time; a second request while one runs waits for it.
export function runSync(getParts) {
  running ||= (async () => {
    try { return await syncNow(await getParts()); } finally { running = null; }
  })();
  return running;
}

// After a sync brought in changes, the page's in-memory state is stale. Reload, unless you are typing.
export function reloadIfIdle(notify) {
  const a = document.activeElement;
  const typing = a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable);
  if (!typing) { location.reload(); return; }
  notify?.('Progress from your other devices arrived. It shows after a reload; save what you are writing first.');
}

export function autoSync(getParts, {onChanged = reloadIfIdle, notify} = {}) {
  if (!readSettings().token) return;   // work mode after the browser was closed: wait for the token
  const go = quietly => runSync(getParts).then(r => { if (r.changedHere) onChanged(notify); return r; })
    .catch(e => { if (!quietly) notify?.('Sync: ' + e.message); });
  go(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') go(true); });
}

export function mountSyncPanel(el, getParts, {onChanged = reloadIfIdle, notify, practice = false} = {}) {
  const draw = (msg = '') => {
    const s = readSettings(), sso = configured();
    const status = `<p class="small muted" data-sync-msg role="status">${esc(msg)}</p>`;
    const workBox = `<label class="small"><input type="checkbox" data-sync-work> Work or shared computer: sign out when the browser closes</label>`;
    const pasteForm = (label, work) => `<div class="actions row-flex"><input type="password" data-sync-token placeholder="github_pat_…" autocomplete="off" spellcheck="false" aria-label="GitHub token" style="flex:1;min-width:220px">
        <button type="button" class="${sso ? '' : 'primary '}btn" data-sync-connect${work ? ' data-work="1"' : ''}>${label}</button></div>`;
    const relogin = s.work && !s.token && s.gistId;
    if (relogin) el.innerHTML = `
      <p><strong>Work mode.</strong> You were signed out when the browser closed. Sign in to sync this session.</p>
      <div class="actions row-flex">${sso ? `<button type="button" class="primary btn" data-sync-signin data-work="1">Sign in with GitHub</button>` : ''}
        <button type="button" class="btn" data-sync-forget>Turn off on this device</button></div>
      ${sso ? '' : pasteForm('Sync this session', true)}${status}`;
    else if (s.token) el.innerHTML = `
      <p><strong>Signed in${s.via === 'github' ? ' with GitHub' : ''}${s.work ? ' until the browser closes (work mode)' : ''}.</strong>
        This device syncs when the page opens and when you leave it. Last sync: ${esc(when(s.last))}.
        <a href="https://gist.github.com/${esc(s.gistId)}" target="_blank" rel="noopener">Your sync gist ↗</a></p>
      <div class="actions row-flex"><button type="button" class="primary btn" data-sync-now>Sync now</button>
        <button type="button" class="btn" data-sync-forget>Sign out on this device</button></div>${status}`;
    else el.innerHTML = `
      <p>Keep your notes, learning plan, quiz scores${practice ? ', ETL checks and practice progress' : ' and ETL checks'} the same on every device.
        They are saved in a <em>secret gist</em> in your own GitHub account; nothing else stores them.</p>
      ${sso ? `<div class="actions row-flex"><button type="button" class="primary btn" data-sync-signin>Sign in with GitHub</button></div>${workBox}${status}
      <details class="small"><summary>Or paste a token instead</summary>
        <p><a href="${TOKEN_URL}" target="_blank" rel="noopener">Create a fine-grained token ↗</a> with only <em>Gists: Read and write</em>, then paste it.</p>
        ${pasteForm('Connect', false)}</details>` : `
      <ol class="small">
        <li><a href="${TOKEN_URL}" target="_blank" rel="noopener">Create a fine-grained GitHub token ↗</a>.
          Name: <code>LLM From Zero sync</code>. Expiration: up to a year. Repository access: <em>Public repositories</em>.
          Under <em>Account permissions</em>, set <em>Gists</em> to <em>Read and write</em>. Nothing else.</li>
        <li>Paste it here, on each device once. It is kept only in this browser.</li>
      </ol>${pasteForm('Connect', false)}${workBox}${status}`}
      <p class="small muted">A secret gist is unlisted, not encrypted: anyone with its link can read it. Keep passwords and work data out of your notes.
        On a work laptop, check that your employer allows a personal GitHub sign-in in the browser.</p>`;
    const say = t => { const m = el.querySelector('[data-sync-msg]'); if (m) m.textContent = t; };
    el.querySelector('[data-sync-connect]')?.addEventListener('click', async () => {
      say('Connecting…');
      try {
        const btn = el.querySelector('[data-sync-connect]');
        const work = btn.dataset.work === '1' || !!el.querySelector('[data-sync-work]')?.checked;   // paste path
        await connect(el.querySelector('[data-sync-token]').value, {work});
        say('Connected. Syncing…');
        const r = await runSync(getParts);
        draw(describe(r));
        if (r.changedHere) onChanged(notify);
      } catch (e) { say(e instanceof SyncError ? e.message : 'Sync failed: ' + e.message); }
    });
    el.querySelector('[data-sync-now]')?.addEventListener('click', async () => {
      say('Syncing…');
      try { const r = await runSync(getParts); draw(describe(r)); if (r.changedHere) onChanged(notify); }
      catch (e) { say(e.message); }
    });
    el.querySelector('[data-sync-signin]')?.addEventListener('click', e => {
      startSignIn({work: e.currentTarget.dataset.work === '1' || !!el.querySelector('[data-sync-work]')?.checked});
    });
    el.querySelector('[data-sync-forget]')?.addEventListener('click', async () => {
      await signOut();
      draw('Signed out on this device. Your progress here and in the gist is kept.');
    });
  };
  draw();
}
