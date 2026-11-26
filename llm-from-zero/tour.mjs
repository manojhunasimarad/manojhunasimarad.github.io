// Pop-up sequences: one card at a time, a numbered stepper you can jump around in, Back and Next,
// the arrow keys and a swipe on phones. Two sequences use it:
//   the first-visit tour  (welcome.mjs-like steps below): what each section is for, set your goal,
//                          where the progress bar and "What now?" are, then your first session
//   the daily start       (coach.mjs): where you are, what to do now, how to finish well
// A step can point at a part of the page: the rest of the page dims and the card sits next to it.
import { TOUR_KEY, TOUR_VERSION, tourPending } from './journey-core.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let active = null;
export const sequenceOpen = () => !!active;

/**
 * Open a sequence. steps: [{label, kicker, title, html, target, primary: {label, run, keepOpen}, onShow(card, api)}].
 * html may be a function (api) => string, called each time the step is shown, so it can show fresh numbers.
 */
export function openSequence({ id, steps, start = 0, onClose, finishLabel = 'Done', closeLabel = 'Close' }) {
  if (active) active.close('replaced');
  const shade = document.createElement('div');
  shade.className = 'seq'; shade.dataset.seq = id;
  shade.innerHTML = `<div class="seq-spot" hidden></div><section class="seq-card" role="dialog" aria-modal="true" aria-labelledby="seq-title" tabindex="-1">
      <header class="seq-head"><ol class="seq-steps${steps.length <= 4 ? ' few' : ''}" aria-label="Steps">${steps.map((s, i) => `<li><button type="button" data-go="${i}" aria-label="Step ${i + 1} of ${steps.length}: ${esc(s.label)}"><span class="seq-n">${i + 1}</span><span class="seq-l">${esc(s.label)}</span></button></li>`).join('')}</ol>
        <button type="button" class="seq-x" data-close aria-label="${esc(closeLabel)}">×</button></header>
      <div class="seq-bar" aria-hidden="true"><i></i></div>
      <div class="seq-body" id="seq-body"></div>
      <footer class="seq-foot"><button type="button" class="seq-back" data-back>← Back</button><span class="seq-count" aria-live="polite"></span><button type="button" class="primary seq-next" data-next>Next →</button></footer>
    </section>`;
  document.body.append(shade);
  document.body.classList.add('sh-modal');
  const card = shade.querySelector('.seq-card'), body = shade.querySelector('.seq-body'), spot = shade.querySelector('.seq-spot');
  const opener = document.activeElement;
  let i = -1, target = null;

  const api = {
    id, el: card, get index() { return i; },
    go(n) { show(Math.max(0, Math.min(steps.length - 1, n))); },
    next() { if (i < steps.length - 1) show(i + 1); else api.close('finished'); },
    back() { if (i > 0) show(i - 1); },
    close(why = 'closed') {
      if (active !== api) return;
      active = null;
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.removeEventListener('lfz-seq-refresh', refresh);
      shade.remove(); document.body.classList.remove('sh-modal');
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      onClose && onClose(why, i);
    },
    refresh() { show(i, true); }
  };

  function show(n, same = false) {
    const s = steps[n]; if (!s) return;
    i = n;
    shade.querySelectorAll('[data-go]').forEach((b, k) => {
      b.classList.toggle('on', k === n); b.classList.toggle('done', k < n);
      if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    shade.querySelector('.seq-bar i').style.width = `${Math.round(100 * (n + 1) / steps.length)}%`;
    shade.querySelector('.seq-count').textContent = `${n + 1} of ${steps.length}`;
    body.innerHTML = `${s.kicker ? `<p class="seq-kicker">${esc(s.kicker)}</p>` : ''}<h2 id="seq-title">${esc(s.title)}</h2>${typeof s.html === 'function' ? s.html(api) : (s.html || '')}`;
    const back = shade.querySelector('[data-back]'), next = shade.querySelector('[data-next]');
    back.hidden = n === 0;
    next.textContent = s.primary?.label || (n === steps.length - 1 ? finishLabel : 'Next →');
    next.className = 'primary seq-next' + (s.primary?.quiet ? ' quiet' : '');
    target = s.target ? [].concat(s.target).map(q => document.querySelector(q)).find(el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') || null : null;
    card.classList.toggle('pointing', !!target);
    place();
    if (s.onShow) s.onShow(card, api);
    if (!same) (card.querySelector('[data-autofocus]') || next).focus({ preventScroll: true });
    const cur = shade.querySelector('.seq-steps .on'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // Dim everything but the step's target and put the card beside it; phones get a bottom sheet.
  function place() {
    const wide = window.innerWidth > 720;
    if (!target) { spot.hidden = true; card.style.left = card.style.top = ''; card.classList.remove('beside'); shade.classList.remove('sheet-top'); return; }
    const r = target.getBoundingClientRect(), pad = 6;
    spot.hidden = false;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    // phones: a bottom sheet, or a top sheet when the thing it points at is in the lower half (the tab bar)
    if (!wide) { card.style.left = card.style.top = ''; card.classList.remove('beside'); shade.classList.toggle('sheet-top', r.top > window.innerHeight / 2); return; }
    card.classList.add('beside');
    const w = card.offsetWidth, h = card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let top = r.bottom + 16; if (top + h > vh - 12) top = Math.max(12, r.top - h - 16);
    let left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), vw - w - 12);
    card.style.left = `${left}px`; card.style.top = `${Math.max(12, Math.min(top, vh - h - 12))}px`;
  }

  shade.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'); if (go) return show(+go.dataset.go);
    if (e.target.closest('[data-close]')) return api.close('closed');
    if (e.target.closest('[data-back]')) return api.back();
    if (e.target.closest('[data-next]')) {
      const s = steps[i];
      if (s.primary?.run) { const r = s.primary.run(api); if (!s.primary.keepOpen && r !== false && active === api) api.next(); return; }
      return api.next();
    }
  });
  shade.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); return api.close('closed'); }
    const typing = e.target.closest('input, textarea, select, [contenteditable]');
    if (!typing && e.key === 'ArrowRight') { e.preventDefault(); return api.next(); }
    if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); return api.back(); }
    if (e.key === 'Tab') {
      const f = [...card.querySelectorAll('button:not([hidden]), a[href], input, select, textarea, summary')].filter(x => x.offsetParent !== null);
      if (!f.length) return; const k = f.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  let x0 = null, y0 = null;
  card.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  card.addEventListener('touchend', e => {
    if (x0 == null) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && !e.target.closest('input, select, textarea, pre, .table-scroll')) (dx < 0 ? api.next : api.back)();
  }, { passive: true });
  const refresh = () => { if (active === api) api.refresh(); };
  window.addEventListener('resize', place); window.addEventListener('scroll', place, true); window.addEventListener('lfz-seq-refresh', refresh);
  active = api;
  show(start);
  return api;
}

/* ------------------------------------------------------------------ the first-visit tour */
const GOALS = [['etl', 'ETL project: data engineering'], ['apps', 'Build useful AI apps'], ['build', 'Understand & build models'],
  ['rag-project', 'Project: RAG assistant'], ['fl-project', 'Project: federated testbed'], ['gpu-project', 'Project: GPU ML pipeline'], ['all', 'Explore the full map']];

function learningSettings() {
  const s = read('lfz-learning-v1', null);
  return s && s.settings ? s.settings : { track: 'apps', minutes: 20, weeklyDays: 3 };
}
// Saves goal and time into the learning plan, the same record Today's own controls write.
function saveSettings(patch) {
  const s = read('lfz-learning-v1', null) || { app: 'lfz-learning', version: 1, topics: {}, projects: {}, sessions: {}, quizAttempts: {}, settings: { track: 'apps', minutes: 20, weeklyDays: 3, updated: 0 } };
  s.settings = { ...s.settings, ...patch, updated: Date.now() };
  write('lfz-learning-v1', s);
  window.dispatchEvent(new Event('lfz-learning-external'));
  window.dispatchEvent(new Event('lfz-progress'));
}

export function welcomeSteps({ go, page }) {
  const st = learningSettings();
  const opt = (v, t, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`;
  return [
    { label: 'Welcome', kicker: 'Day 0 · about 2 minutes', title: 'Your learning site, in one short tour',
      html: `<p>Every study day here is the same five small steps. The site shows them, ticks them as you go, and reminds you of the next one.</p>
        <ol class="seq-flow"><li><b>Plan</b><span>open the site, read your one next step</span></li><li><b>Learn</b><span>a lesson or a guide page, 25 min</span></li><li><b>Use</b><span>an exercise or one project step</span></li><li><b>Recall</b><span>from memory, before sleep</span></li><li><b>Log</b><span>one line: what you did, where you pick up</span></li></ol>
        <p class="seq-note">Use <kbd>←</kbd> <kbd>→</kbd> or swipe to move. You can reopen this tour any time from Settings or search.</p>` },
    { label: 'Your goal', kicker: 'Set once, change any time on Today', title: 'What are you working towards?',
      html: `<div class="seq-form"><label>Goal<select id="seq-goal" data-autofocus>${GOALS.map(([v, t]) => opt(v, t, st.track)).join('')}</select></label>
        <label>Time on a study day<select id="seq-min">${[10, 20, 40, 60].map(n => opt(n, n + ' minutes', st.minutes)).join('')}</select></label>
        <label>Study days a week<select id="seq-days">${[1, 2, 3, 4, 5, 6, 7].map(n => opt(n, String(n), st.weeklyDays)).join('')}</select></label></div>
        <p class="seq-note">The progress bar, Today's next step and the daily start all follow this goal. The ETL project is a good first goal: it is the project you are building now.</p>`,
      primary: { label: 'Save and continue →', run: () => {
        const v = id => document.getElementById(id)?.value;
        saveSettings({ track: v('seq-goal'), minutes: Number(v('seq-min')), weeklyDays: Number(v('seq-days')) });
      } } },
    { label: 'Progress bar', kicker: 'Always at the top', title: 'This bar is your reminder', target: '#lfz-rail',
      html: `<p>Left: how far along your goal you are. Right: today's five steps, which tick themselves when you do the work. On a laptop it also shows the hours left, the topic to work on now and your ETL guide ticks.</p><p>Tap the bar whenever you lose the thread: it opens the daily start.</p>` },
    { label: 'Today', kicker: 'Section 1 of 6', title: 'Today: your one next step', target: ['.sh-sections [data-sec="today"]', '.sh-bottom [data-sec="today"]'],
      html: `<p>Today shows the next topic with a start button, the session split into learn, use and recall, and the log. If you only follow one card on the whole site, follow the <b>Your next step</b> card.</p><p>The Study clock (also under Today) plans your week around office days and sleep, with phone alarms.</p>` },
    { label: 'Learn', kicker: 'Section 2 of 6', title: 'Learn: read, listen, look things up', target: ['.sh-sections [data-sec="learn"]', '.sh-bottom [data-sec="learn"]'],
      html: `<p>Short lessons you can also listen to, lessons with exercises, books and papers, and reading lists. Everything opens offline once downloaded.</p>` },
    { label: 'Practice', kicker: 'Section 3 of 6', title: 'Practice: write code that is tested', target: ['.sh-sections [data-sec="practice"]', '.sh-bottom [data-sec="practice"]'],
      html: `<p>Exercises run real Python and SQL in this browser, with tests, hints and a solution that unlocks after your own attempt. The first visit downloads Python (about 12 MB); after that it works offline.</p><p>Get one wrong on purpose sometimes: the feedback is part of the lesson.</p>` },
    { label: 'Review', kicker: 'Section 4 of 6', title: 'Review: recall before you forget', target: ['.sh-sections [data-sec="review"]', '.sh-bottom [data-sec="review"]'],
      html: `<p>Recall cards come back on a schedule (1, 3, 7, 14 days…). Answer from memory first, then check. 15 minutes about 50 minutes before sleep is the habit that makes the rest stick.</p>` },
    { label: 'Projects', kicker: 'Section 5 of 6', title: 'Projects: the ETL step guide', target: ['.sh-sections [data-sec="projects"]', '.sh-bottom [data-sec="projects"]'],
      html: `<p><b>ETL step guide</b>: every step of your pipeline with what you learn, the exact commands (PowerShell or Docker), the output you should see, questions with answers, and boxes to tick when you have done it yourself.</p><p><b>ETL project</b> shows which topics each step needs, and <b>Check what you know</b> lets you skip what you already know in about 15 minutes.</p>` },
    { label: 'Progress', kicker: 'Section 6 of 6', title: 'Progress: what you can show', target: ['.sh-sections [data-sec="progress"]', '.sh-bottom [data-sec="progress"]'],
      html: `<p>Your path, ticked guide boxes, recall queue and evidence, and the learning map with why each topic comes before the next.</p>` },
    { label: 'What now?', kicker: 'Any time you are unsure', title: 'Press “What now?”', target: '#sh-now',
      html: `<p>It looks at the clock, your routine and your plan, and tells you what to do at this moment: study, get ready, work comes first, or sleep. One button starts the timer and opens the page.</p><p>Search is next to it (<kbd>Ctrl</kbd> <kbd>K</kbd>), and the gear holds sync across devices and offline download.</p>` },
    { label: 'Start', kicker: 'You are set', title: 'Your first session',
      html: `<ol class="seq-list"><li><b>Skip what you know</b>: the ETL quick check, about 15 minutes.</li><li><b>Set up once</b>: the guide's one-time setup (Python, Docker, your key).</li><li><b>Turn on sync</b> under Settings, so the phone and the laptop share progress.</li></ol>
        <div class="seq-links"><a class="button" href="${esc(go('p:#/etl/check'))}" data-close-seq>ETL quick check</a><a class="button" href="${esc(go('s:#etl/setup'))}" data-close-seq>One-time setup</a><a class="button" href="${esc(go('s:#setup'))}" data-close-seq>Sync &amp; offline</a></div>`,
      primary: { label: 'Show my daily start →', run: api => { api.close('finished'); setTimeout(() => window.lfzCoach?.open(0), 60); return false; } } }
  ];
}

export function startTour({ go, page, at = 0 } = {}) {
  write(TOUR_KEY, { ...(read(TOUR_KEY, {}) || {}), version: TOUR_VERSION, started: Date.now() });
  const api = openSequence({ id: 'tour', steps: welcomeSteps({ go, page }), start: at, finishLabel: 'Finish', closeLabel: 'Skip the tour',
    onClose: (why, i) => {
      const prev = read(TOUR_KEY, {}) || {};
      write(TOUR_KEY, { ...prev, version: TOUR_VERSION, ...(why === 'finished' ? { done: Date.now() } : { skipped: Date.now(), at: i }) });
    } });
  api.el.addEventListener('click', e => { if (e.target.closest('[data-close-seq]')) { const prev = read(TOUR_KEY, {}) || {}; write(TOUR_KEY, { ...prev, version: TOUR_VERSION, done: Date.now() }); api.close('finished'); } });
  return api;
}
export const tourDue = () => tourPending(read(TOUR_KEY, null));
