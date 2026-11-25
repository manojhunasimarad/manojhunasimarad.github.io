// "What now?" on every page: the guide that opens when you come to the site, the header button that
// reopens it, and the small reminders while a page is open (start the timer when you are working
// without one, a block is starting, it is sleep time). The rules are in coach-core.mjs.
import { KINDS, DEFAULTS, normalise, buildWeek, startTimer, remaining } from './clock-core.mjs';
import { RULE, advise, planText, WORK_PAGE, NUDGE_AFTER, blockAlarm, isNight, tally } from './coach-core.mjs';
import { emptyState, mergeLearning, plan } from './learning-engine.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const LOG_KEY = 'lfz-clock-log', OPEN_KEY = 'lfz-coach-open', NUDGE_KEY = 'lfz-coach-nudge', PREFILL_KEY = 'lfz-log-prefill';
const SEEN_KEY = 'lfz-coach-seen', SNOOZE_KEY = 'lfz-coach-snooze', SHOW_AGAIN_MIN = 45;

let graph = null, graphTried = false;
async function learningStep() {
  if (!graphTried) { graphTried = true; try { const r = await fetch('content/learning-graph.json'); if (r.ok) graph = await r.json(); } catch {} }
  if (!graph) return null;
  let state = emptyState();
  try { const saved = read('lfz-learning-v1', null); if (saved) state = mergeLearning(state, saved, graph); } catch {}
  const p = plan(graph, state);
  return { due: p.due[0] ? { id: p.due[0].id, title: p.due[0].title } : null, next: p.next ? { id: p.next.id, title: p.next.title, practice: p.next.practice || [] } : null };
}

export function mountCoach({ page, href, where, TIMER_KEY, RECENT_KEY, signal }) {
  const settings = () => normalise(read('lfz-clock-settings', DEFAULTS));
  const timerNow = () => {
    const st = read(TIMER_KEY, null);
    if (st) return { ...st, left: remaining(st) };
    const pf = read('lfz.focus', null);
    return pf ? { practice: true, kind: 'use', title: pf.name || 'Practice focus', phase: pf.phase === 'rest' ? 'break' : 'work', link: 'p:#/focus' } : null;
  };
  const go = to => { const h = href(to, page); if (h.startsWith('#')) { if (location.hash !== h) location.hash = h; } else location.href = h; };

  function startSession({ kind, plan: pl, title, link }, navigate = true) {
    write(TIMER_KEY, startTimer(kind, { title, link, plan: pl }));
    window.dispatchEvent(new Event('lfz-clock'));
    closeGuide(); hideNudge();
    if (navigate && link) go(link);
  }

  /* ---------------------------------------------------------------- the guide (dialog) */
  const dlg = document.createElement('div');
  dlg.className = 'coach'; dlg.hidden = true; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'coach-title');
  document.body.append(dlg);
  let opener = null, current = null;

  async function openGuide(auto = false) {
    const s = settings(), step = await learningStep();
    const a = advise({ now: new Date(), settings: s, week: buildWeek(s), timer: timerNow(), step, recent: read(RECENT_KEY, []), log: read(LOG_KEY, []) });
    if (auto && a.mode === 'running') return;
    current = a; write(SEEN_KEY, Date.now()); write(SNOOZE_KEY, null);
    const st = a.start, planLabel = st ? (st.plan[2] > 1 ? `${st.plan[2]} × ${st.plan[0]} min` : `${st.plan[0]} min`) : '';
    const t = tally(read(LOG_KEY, []));
    dlg.innerHTML = `<div class="coach-box ${esc(a.tone)}">
      <button type="button" class="coach-x" data-c="close" aria-label="Close">×</button>
      <p class="coach-kicker">${esc(a.kicker)}</p>
      <h2 id="coach-title">${esc(a.title)}</h2>
      <p>${esc(a.text)}</p>
      ${a.steps.length ? `<ol class="coach-steps">${a.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      <div class="coach-act">
        ${st ? `<button type="button" class="${a.quiet ? '' : 'primary'}" data-c="start">${a.mode === 'work' ? 'I have a break: ' : '▶ Start '}${esc(planLabel)} · open ${esc(st.short)}</button>` : ''}
        ${a.open ? `<button type="button" data-c="open">${esc(a.open.label)}</button>` : ''}
        ${st && !a.quiet ? `<button type="button" data-c="snooze">Remind me in 10 min</button>` : ''}
        ${(!st && !a.open) || a.quiet ? `<button type="button" class="${st ? 'quiet' : 'primary'}" data-c="close">OK</button>` : ''}
      </div>
      <details class="coach-rule"><summary>When do I press Start?</summary><p>${esc(RULE)}</p>
        <ul><li><b>Learn</b>: 25 min, 5-min break, 25 min. Morning, before work.</li><li><b>Use</b>: exercise or one project step, 25-min rounds. Evening.</li><li><b>Recall</b>: 15 min, no notes, about 50 min before sleep.</li><li>Opened a lesson or exercise without a timer? After ${NUDGE_AFTER} seconds the site asks whether to start one.</li></ul></details>
      <p class="coach-foot"><span>${t.week ? `This week: ${t.week} rounds, ${t.weekMins} min` : 'No timed rounds yet this week'}</span>
        <a href="${esc(href('s:#clock', page))}" data-c="clock">Study clock &amp; phone alarms</a>
        <label><input type="checkbox" data-c="auto"${read(OPEN_KEY, true) ? ' checked' : ''}> Show this when I open the site</label></p></div>`;
    opener = document.activeElement; dlg.hidden = false; document.body.classList.add('sh-modal');
    (dlg.querySelector('[data-c="start"]') || dlg.querySelector('.coach-act button'))?.focus({ preventScroll: true });
  }
  function closeGuide() { if (dlg.hidden) return; dlg.hidden = true; document.body.classList.remove('sh-modal'); if (opener && opener.focus) opener.focus({ preventScroll: true }); }
  dlg.addEventListener('click', e => {
    if (e.target === dlg) return closeGuide();
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'close' || c === 'clock') closeGuide();
    else if (c === 'start' && current?.start) startSession(current.start);
    else if (c === 'open' && current?.open) { closeGuide(); go(current.open.to); }
    else if (c === 'snooze') { write(SNOOZE_KEY, Date.now() + 10 * 60000); closeGuide(); }
  });
  dlg.addEventListener('change', e => { if (e.target.dataset.c === 'auto') write(OPEN_KEY, e.target.checked); });
  dlg.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeGuide(); }
    if (e.key === 'Tab') { const f = [...dlg.querySelectorAll('button, a[href], input, summary')]; if (!f.length) return; const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  });

  /* ---------------------------------------------------------------- small reminders */
  const nudge = document.createElement('div');
  nudge.className = 'sh-prompt coach-nudge'; nudge.hidden = true; nudge.setAttribute('role', 'status'); nudge.setAttribute('aria-live', 'polite');
  document.body.append(nudge);
  let nudgeActs = {};
  function showNudge(tone, html, acts) {
    nudge.className = 'sh-prompt coach-nudge ' + (tone || '');
    nudgeActs = acts; nudge.innerHTML = html + `<div class="coach-act">${Object.entries(acts).map(([k, v], i) => `<button type="button" data-n="${k}"${i ? ' class="quiet"' : ''}>${esc(v.label)}</button>`).join('')}</div>`;
    nudge.hidden = false;
  }
  function hideNudge() { nudge.hidden = true; }
  window.addEventListener('lfz-clock', () => { if (nudge.dataset.kind === 'replace' || nudge.dataset.kind === 'work') hideNudge(); });
  nudge.addEventListener('click', e => { const k = e.target.closest('[data-n]')?.dataset.n; if (k) { hideNudge(); nudgeActs[k]?.run?.(); } });

  const kindFor = place => /\?review/.test(place) || /^p:\/recall/.test(place) ? 'recall' : /^p:\/quiz/.test(place) ? 'review' : /^(p:\/(ex|review)\/)/.test(place) ? 'use' : 'learn';
  const toFor = place => place.startsWith('s:') ? 's:#' + place.slice(2) : 'p:#' + place.slice(2);
  const pageTitle = () => (document.querySelector('main h1, #view h1, #screen h1')?.textContent || '').trim().slice(0, 80);
  let place = where(page, location.hash), since = Date.now(), last = new Date();
  window.addEventListener('hashchange', () => { place = where(page, location.hash); since = Date.now(); if (!nudge.hidden && nudge.dataset.kind === 'work') hideNudge(); });
  const dismissed = () => { try { return JSON.parse(sessionStorage.getItem('lfz-coach-skip') || '[]'); } catch { return []; } };

  function check() {
    const now = new Date(), s = settings(), week = buildWeek(s), tm = timerNow();
    // 1. a study block starts (or starts in 5 minutes) while the site is open
    const hit = blockAlarm(week, last, now);
    if (hit && !tm && !isNight(s, now)) {
      const b = hit.block, k = KINDS[b.kind];
      signal(hit.pre ? `In 5 min: ${b.title}` : `Now: ${b.title}`, hit.pre ? 'Get ready: water, phone away, open the page.' : 'Open the page and start the timer.');
      nudge.dataset.kind = 'block';
      showNudge(k.colour, `<p class="sh-prompt-kicker">${hit.pre ? 'In 5 minutes' : 'Starting now'} · ${esc(b.start)}–${esc(b.end)}</p><h2>${esc(k.name)}: ${esc(b.title)}</h2><p>${esc(b.what)}</p>`,
        { go: { label: hit.pre ? 'What do I open?' : 'Show me what to do', run: () => openGuide() }, later: { label: 'Not now' } });
    }
    // 2. sleep time
    const sl = new Date(now); const [h, m] = s.sleep.split(':').map(Number); sl.setHours(h, m, 0, 0);
    if (sl > last && sl <= now) {
      signal('Sleep time', s.sleep + ': finish this and stop.');
      nudge.dataset.kind = 'sleep';
      showNudge('rest', `<p class="sh-prompt-kicker">${esc(s.sleep)} · your sleep time</p><h2>Stop here for today</h2><p>${tm ? 'Let this round end, write one line of where you are, and close the laptop.' : 'Write one line of where you are, then screens off.'}</p>`, { ok: { label: 'OK' } });
    }
    last = now;
    // 3. working on something with no timer running
    const p = where(page, location.hash), secs = (Date.now() - since) / 1000;
    if (!tm && nudge.hidden && dlg.hidden && read(NUDGE_KEY, true) && WORK_PAGE.test(p) && secs >= NUDGE_AFTER && !dismissed().includes(p) && !isNight(s, now) && document.visibilityState === 'visible') {
      const kind = kindFor(p), k = KINDS[kind], pl = kind === 'recall' ? [15, 0, 1] : k.plan, title = pageTitle() || k.name;
      nudge.dataset.kind = 'work';
      showNudge(k.colour, `<p class="sh-prompt-kicker">No timer running</p><h2>Working on “${esc(title)}”?</h2><p>Start the timer now, so the break comes on time and this counts in your week. ${esc(k.name)}: ${esc(planText(pl))}.</p>`,
        { start: { label: `▶ Start ${pl[2] > 1 ? pl[2] + ' × ' : ''}${pl[0]} min`, run: () => startSession({ kind, plan: pl, title, link: toFor(p) }, false) },
          skip: { label: 'Not for this page', run: () => { try { sessionStorage.setItem('lfz-coach-skip', JSON.stringify([...dismissed(), p].slice(-50))); } catch {} } } });
    }
    // 4. "remind me in 10 min"
    const snooze = read(SNOOZE_KEY, null);
    if (snooze && Date.now() >= snooze && !tm) { write(SNOOZE_KEY, null); openGuide(); }
  }
  setInterval(check, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { since = Math.max(since, Date.now() - 30000); check(); } });

  // Any button on any page can start a session: <button data-coach-start data-kind="learn" data-link="s:#topic/x" data-title="…">
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-coach-start]'); if (!b) return;
    e.preventDefault();
    const kind = KINDS[b.dataset.kind] ? b.dataset.kind : 'learn';
    const ses = { kind, plan: b.dataset.plan ? b.dataset.plan.split(',').map(Number) : null, title: b.dataset.title || KINDS[kind].name, link: b.dataset.link || '' };
    const tm = timerNow();
    if (!tm) return startSession(ses);
    nudge.dataset.kind = 'replace';
    showNudge(tm.phase === 'break' ? 'rest' : KINDS[tm.kind]?.colour, `<p class="sh-prompt-kicker">A timer is already running</p><h2>${esc(tm.title || 'Focus')}${tm.left != null ? ' · ' + Math.ceil(tm.left / 60) + ' min left' : ''}</h2><p>Keep it and just open the page, or stop it and start a new one for “${esc(ses.title)}”.</p>`,
      tm.practice ? { keep: { label: 'Keep it, open the page', run: () => ses.link && go(ses.link) }, focus: { label: 'Stop it on the Focus page', run: () => go('p:#/focus') } }
        : { keep: { label: 'Keep it, open the page', run: () => ses.link && go(ses.link) }, replace: { label: 'Start a new one', run: () => startSession(ses) } });
  });

  window.lfzCoach = { open: () => openGuide(false) };
  const btn = document.getElementById('sh-now'); if (btn) btn.addEventListener('click', () => openGuide(false));

  // Open by itself when you come to the site: not on every page change, not while a timer runs.
  const seen = read(SEEN_KEY, 0), snoozed = read(SNOOZE_KEY, null);
  if (read(OPEN_KEY, true) && Date.now() - seen > SHOW_AGAIN_MIN * 60000 && !(snoozed && snoozed > Date.now()) && !timerNow() && !new URLSearchParams(location.search).has('nocoach'))
    setTimeout(() => openGuide(true), 600);
}

// Called by the header timer when a round ends: keeps the log the guide and the clock page count from.
export function logRound(st) {
  const log = read(LOG_KEY, []);
  log.push({ kind: st.kind, mins: Math.round(st.work / 60), at: Date.now(), title: String(st.title || '').slice(0, 90), link: st.link || '' });
  write(LOG_KEY, log.slice(-300));
}
// The "Log it on Today" button after a session: Today opens with the form filled in.
export function prefillLog(st) {
  const topic = /^s:#topic\/([\w-]+)/.exec(st.link || '')?.[1] || '';
  write(PREFILL_KEY, { minutes: Math.max(1, Math.min(180, Math.round(st.work / 60) * st.rounds)), topic, title: st.title || '', at: Date.now() });
}
