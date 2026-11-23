// "Use it offline": one button that asks the service worker (sw.js) to save the whole app, its content,
// Python and NumPy, and asks the browser to keep that storage. Plus the honest list of what lives
// outside the browser's cache and needs its own step.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const mb = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';

async function status() {
  const sw = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;
  const kept = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  return {sw: !!sw?.active, used: est?.usage || 0, quota: est?.quota || 0, kept};
}

export async function mountOffline(el) {
  const draw = async (msg = '') => {
    const s = await status();
    el.innerHTML = `
      <p>${s.sw ? 'This browser can keep the app.' : 'Offline needs the public site (https) or the laptop server; open it there once.'}
        Stored here now: <strong>${mb(s.used)}</strong>${s.kept ? ', protected from automatic clean-up' : ''}.</p>
      <div class="actions row-flex"><button type="button" class="primary btn" data-offline-go ${s.sw ? '' : 'disabled'}>Download everything for offline</button></div>
      <progress data-offline-bar value="0" max="1" hidden style="width:100%"></progress>
      <p class="small muted" data-offline-msg role="status">${esc(msg)}</p>
      <details><summary>What this covers, and what needs its own step</summary>
        <ul class="small">
          <li><strong>Covered:</strong> both pages, all lessons, quizzes, the learning map, ETL pages, all bundled exercises,
            Python for exercises (about 12 MB) and NumPy for the ML problems.</li>
          <li><strong>Listening:</strong> narration uses the voices installed on the device. On Android: Settings → Accessibility →
            Text-to-speech output → ⚙ next to Speech Recognition &amp; Synthesis from Google → Install voice data → English (India) → download.
            For background play with the screen locked, use the WAV files from <code>node tools/export-audio.mjs</code> on the laptop, copied to the phone.</li>
          <li><strong>ML problems (Open-Deep-ML):</strong> press their download button in Practice once while online; they are then stored in this browser.</li>
          <li><strong>Papers:</strong> a PDF you upload stays in the browser you uploaded it in. Upload it once on each device; its notes sync.</li>
          <li><strong>Sync and Ask your sources:</strong> need a connection (GitHub, a model). Your changes wait in this browser and sync when you are back online.</li>
        </ul>
        <p class="small">Test it: after the download finishes, turn on airplane mode and reload both pages.</p>
      </details>`;
    el.querySelector('[data-offline-go]')?.addEventListener('click', go);
  };

  async function go() {
    const say = t => { el.querySelector('[data-offline-msg]').textContent = t; };
    const bar = el.querySelector('[data-offline-bar]');
    el.querySelector('[data-offline-go]').disabled = true;
    bar.hidden = false;
    const kept = navigator.storage?.persist ? await navigator.storage.persist().catch(() => false) : false;
    const reg = await navigator.serviceWorker.ready;
    const onMessage = e => {
      const m = e.data;
      if (m?.type !== 'offline-progress') return;
      if (m.step === 'app') { bar.max = m.total; bar.value = m.done; say(`Saving the app and lessons: ${m.done} of ${m.total} files`); }
      if (m.step === 'python') { bar.max = m.total; bar.value = m.done; say(`Saving Python package ${m.name} (${m.done} of ${m.total})`); }
      if (m.finished) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
        draw(m.ok ? `Done: everything above is saved${kept ? ' and protected' : ''}. Try it in airplane mode.` +
          (kept ? '' : ' The browser did not promise to keep it; installing the site to the home screen usually fixes that.')
          : 'Stopped: ' + m.error + '. Check the connection and press the button again; saved files are kept.');
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    reg.active.postMessage({type: 'offline-all'});
    say('Starting…');
  }
  await draw();
}
