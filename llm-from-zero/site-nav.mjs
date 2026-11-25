// One navigation for the whole site. The learning desk (studio.html) and the practice app
// (index.html) used to have their own menus; this module draws the same header on both:
// six sections, the tabs of the section you are in, search (Ctrl+K or /), a bottom bar on phones,
// and the study-clock timer, which keeps running whichever page is open.
// The map and the matching rules are plain data and functions, tested in tools/nav.test.mjs.
import { KINDS, startTimer, advance, remaining, breakTip, recallTip, mmss } from './clock-core.mjs';

// Targets: "s:" is the learning desk (opens instantly, no Python), "p:" the practice app.
export const SECTIONS = [
  { id: 'today', name: 'Today', key: 't', icon: 'sun', tabs: [
    { name: 'Plan for today', to: 's:#today', match: ['s:today'] },
    { name: 'Study clock', to: 's:#clock', match: ['s:clock'] },
    { name: 'Practice picks', to: 'p:#/', match: ['p:/'] },
    { name: 'Focus log', to: 'p:#/focus', match: ['p:/focus'] }] },
  { id: 'learn', name: 'Learn', key: 'l', icon: 'book', tabs: [
    { name: 'Learn & listen', to: 's:#library', match: ['s:library', 's:lesson/'] },
    { name: 'Lessons with exercises', to: 'p:#/learn', match: ['p:/learn', 'p:/lesson/'] },
    { name: 'Books & papers', to: 'p:#/read', match: ['p:/read', 'p:/paper/', 'p:/ask'] },
    { name: 'Reading lists', to: 'p:#/lists/build', match: ['p:/lists/'] },
    { name: 'Ask your sources', to: 's:#lab', match: ['s:lab'] }] },
  { id: 'practice', name: 'Practice', key: 'p', icon: 'code', tabs: [
    { name: 'Exercises', to: 'p:#/practice/python', match: ['p:/practice/', 'p:/ex/', 'p:/review/'] },
    { name: 'Mock interview', to: 'p:#/mock', match: ['p:/mock'] }] },
  { id: 'review', name: 'Review', key: 'r', icon: 'loop', tabs: [
    { name: 'Recall cards', to: 'p:#/recall', match: ['p:/recall'] },
    { name: 'Quiz', to: 'p:#/quiz', match: ['p:/quiz', 'p:/quiz/'] },
    { name: 'Topic tests', to: 's:#quiz', match: ['s:quiz'] }] },
  { id: 'projects', name: 'Projects', key: 'j', icon: 'box', tabs: [
    { name: 'Resume projects', to: 'p:#/projects', match: ['p:/projects', 'p:/project/'] },
    { name: 'ETL project', to: 'p:#/etl?goal=whole', match: ['p:/etl'] },
    { name: 'Check what you know', to: 'p:#/etl/check', match: ['p:/etl/check'] },
    { name: 'Your projects', to: 's:#projects', match: ['s:projects'] },
    { name: 'Reuse notebook', to: 's:#notebook', match: ['s:notebook'] }] },
  { id: 'progress', name: 'Progress', key: 'g', icon: 'chart', tabs: [
    { name: 'Progress & reviews', to: 's:#progress', match: ['s:progress'] },
    { name: 'Learning map', to: 's:#roadmap', match: ['s:roadmap', 's:topic/'] },
    { name: 'Skill map', to: 'p:#/map', match: ['p:/map', 'p:/skill/', 'p:/roles'] },
    { name: 'Certificates', to: 'p:#/certs', match: ['p:/certs'] }] },
  { id: 'settings', name: 'Settings', key: 's', icon: 'gear', hidden: true, tabs: [
    { name: 'Setup, sync & offline', to: 's:#setup', match: ['s:setup'] },
    { name: 'Practice settings', to: 'p:#/settings', match: ['p:/settings'] }] }
];
export const ALL_TABS = SECTIONS.flatMap(s => s.tabs.map(t => ({ ...t, section: s.id, sectionName: s.name })));

// "s:today" for studio.html#today, "p:/recall" for index.html#/recall. Hashes without a value mean the home of each page.
export function where(page, hash) {
  const h = String(hash || '').replace(/^#/, '');
  return page === 'studio' ? 's:' + (h || 'today') : 'p:' + (h || '/');
}
// Which section and tab a place belongs to. A rule ending in "/" is a prefix; any other rule matches
// the whole path, or the path followed by a "?query". The longest matching rule wins.
export function locate(place) {
  let best = null;
  for (const t of ALL_TABS) for (const rule of t.match) {
    if (rule.slice(0, 2) !== place.slice(0, 2)) continue;
    const r = rule.slice(2), path = place.slice(2);
    const ok = r.endsWith('/') && r !== '/' ? path.startsWith(r) : path === r || path.startsWith(r + '?');
    if (ok && (!best || rule.length > best.rule.length)) best = { tab: t, rule };
  }
  return best ? { section: best.tab.section, tab: best.tab } : null;
}
// A target as a link from the page you are on: same page → just the hash, so it does not reload.
export function href(to, page) {
  const target = to.startsWith('s:') ? 'studio' : 'practice', hash = to.slice(2);
  return target === page ? hash : (target === 'studio' ? 'studio.html' : 'index.html') + hash;
}

/* ------------------------------------------------------------------ the page part */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
  loop: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'
};
const icon = (name, cls = 'sh-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const TIMER_KEY = 'lfz-clock-timer', RECENT_KEY = 'lfz-nav-recent';

function mount() {
  const body = document.body, page = body.dataset.page === 'studio' ? 'studio' : 'practice';
  const header = document.getElementById('site-header');
  if (!header) return;
  const keep = [...header.querySelectorAll('[data-keep]')];   // the practice app's focus timer lives here
  const sectionLink = (s, cls) => `<a class="${cls}" data-sec="${s.id}" href="${esc(href(s.tabs[0].to, page))}">${icon(s.icon)}<span>${esc(s.name)}</span></a>`;
  const main = SECTIONS.filter(s => !s.hidden);
  header.innerHTML = `<div class="sh-top">
      <a class="sh-brand" href="${esc(href('s:#today', page))}" aria-label="LLM From Zero, home"><span class="sh-mark" aria-hidden="true">L/Z</span><span class="sh-name">LLM From Zero</span></a>
      <nav class="sh-sections" aria-label="Main">${main.map(s => sectionLink(s, 'sh-sec')).join('')}</nav>
      <div class="sh-tools"><span class="sh-keep"></span><a class="sh-timer" id="sh-timer" href="${esc(href('s:#clock', page))}" hidden></a>
        <button type="button" class="sh-search" id="sh-search" aria-label="Search the site (Ctrl+K)">${icon('search')}<span class="sh-search-label">Search</span><kbd>Ctrl K</kbd></button>
        <button type="button" class="theme-toggle sh-icon-btn" data-theme-toggle>◐</button>
        <a class="sh-icon-btn" data-sec="settings" href="${esc(href('s:#setup', page))}" aria-label="Settings, sync and offline">${icon('gear')}</a></div>
    </div><nav class="sh-tabs" id="sh-tabs" aria-label="In this section"></nav>`;
  const slot = header.querySelector('.sh-keep'); keep.forEach(k => slot.append(k));
  header.classList.add('site-header');
  const bottom = document.createElement('nav');
  bottom.className = 'sh-bottom'; bottom.setAttribute('aria-label', 'Main');
  bottom.innerHTML = main.map(s => sectionLink(s, 'sh-bsec')).join('');
  body.append(bottom);
  if (window.lfzTheme) window.lfzTheme.apply();

  let lastPlace = '';
  function update() {
    const place = where(page, location.hash), hit = locate(place);
    const sec = hit ? SECTIONS.find(s => s.id === hit.section) : null;
    document.querySelectorAll('[data-sec]').forEach(a => { if (sec && a.dataset.sec === sec.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const tabs = document.getElementById('sh-tabs');
    tabs.innerHTML = sec ? `<span class="sh-crumb">${esc(sec.name)}</span>` + sec.tabs.map(t => `<a href="${esc(href(t.to, page))}"${hit.tab.to === t.to ? ' aria-current="page"' : ''}>${esc(t.name)}${t.to[0] === 'p' && page === 'studio' ? '<span class="sh-py" title="Opens the practice app (runs Python in the browser)">Py</span>' : ''}</a>`).join('') : '';
    const cur = tabs.querySelector('[aria-current]'); if (cur && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = cur.offsetLeft - 24;
    if (place !== lastPlace) { lastPlace = place; setTimeout(() => remember(place, hit), 900); }
  }
  // Deep pages (a lesson, an exercise, a topic, a paper) are remembered for "Continue" in search and on the Study clock.
  function remember(place, hit) {
    if (place !== where(page, location.hash) || !/^(s:(lesson|topic)\/|p:\/(ex|lesson|paper|review)\/|p:\/etl\?)/.test(place)) return;
    const h1 = document.querySelector('main h1, #view h1, #screen h1'), label = (h1 && h1.textContent.trim()) || place;
    const to = place.startsWith('s:') ? 's:#' + place.slice(2) : 'p:#' + place.slice(2);
    const list = read(RECENT_KEY, []).filter(r => r.to !== to);
    list.unshift({ to, label: label.slice(0, 90), section: hit ? hit.tab.name : '', at: Date.now() });
    write(RECENT_KEY, list.slice(0, 6));
  }
  window.addEventListener('hashchange', update);
  update();
  // The practice app's own code marks its old menu; nothing else here needs it.
  palette(page);
  timer(page);
  shortcuts(page);
  const setH = () => document.documentElement.style.setProperty('--bar-h', header.offsetHeight + 'px');
  if (window.ResizeObserver) new ResizeObserver(setH).observe(header); setH();
}

/* ------------------------------------------------------------------ search (Ctrl+K) */
let openPalette = () => {};
function palette(page) {
  const dlg = document.createElement('div');
  dlg.className = 'sh-palette'; dlg.hidden = true; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', 'Search');
  dlg.innerHTML = `<div class="sh-pal-box"><div class="sh-pal-in">${icon('search')}<input id="sh-q" type="search" autocomplete="off" spellcheck="false" placeholder="Search lessons, topics and pages…" aria-controls="sh-res"><kbd>Esc</kbd></div>
    <ul id="sh-res" role="listbox" aria-label="Results"></ul>
    <p class="sh-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>g</kbd> then <kbd>t</kbd> <kbd>l</kbd> <kbd>p</kbd> <kbd>r</kbd> <kbd>j</kbd> <kbd>g</kbd> jumps to a section</span></p></div>`;
  document.body.append(dlg);
  const q = dlg.querySelector('#sh-q'), res = dlg.querySelector('#sh-res');
  let items = null, shown = [], sel = 0, opener = null;
  const commands = [
    { label: 'Start a 25-minute Learn session', kind: 'Study clock', run: () => go('s:#clock', 'learn') },
    { label: 'Start a Use session (exercise or project)', kind: 'Study clock', run: () => go('s:#clock', 'use') },
    { label: 'Start a 15-minute Recall session', kind: 'Study clock', run: () => go('s:#clock', 'recall') },
    { label: 'Switch light / dark', kind: 'Setting', run: () => document.querySelector('[data-theme-toggle]')?.click() }
  ];
  function go(to, kind) { if (kind) { write(TIMER_KEY, startTimer(kind)); window.dispatchEvent(new Event('lfz-clock')); } location.href = href(to, page); }
  async function load() {
    if (items) return items;
    items = ALL_TABS.map(t => ({ label: t.name, kind: t.sectionName, to: t.to }));
    try {
      const [course, studio, graph, ex] = await Promise.all(['content/lessons.json', 'content/studio.json', 'content/learning-graph.json', 'content/exercises.json'].map(p => fetch(p).then(r => r.ok ? r.json() : null).catch(() => null)));
      if (graph) for (const n of graph.nodes || []) items.push({ label: n.title, kind: 'Topic', to: 's:#topic/' + n.id });
      if (studio) for (const e of studio.episodes || []) items.push({ label: e.title, kind: 'Audio briefing', to: 's:#lesson/' + e.id });
      if (course) for (const l of course.lessons || []) items.push({ label: l.title, kind: 'Lesson', to: 's:#lesson/' + l.id, alt: 'p:#/lesson/' + l.id });
      if (ex) for (const e of ex.exercises || []) items.push({ label: e.title, kind: 'Exercise', to: 'p:#/ex/' + e.id });
    } catch {}
    return items;
  }
  const norm = s => s.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ');
  function score(label, query) {
    const l = norm(label), words = norm(query).split(/\s+/).filter(Boolean);
    let s = 0;
    for (const w of words) { const i = l.indexOf(w); if (i < 0) return -1; s += i === 0 ? 3 : /\s/.test(l[i - 1]) ? 2 : 1; }
    return s - l.length / 200;
  }
  async function draw() {
    const all = await load(), text = q.value.trim();
    if (!text) {
      const recent = read(RECENT_KEY, []).map(r => ({ label: r.label, kind: 'Continue · ' + (r.section || ''), to: r.to }));
      shown = [...recent, ...commands, ...ALL_TABS.filter(t => t.section !== 'settings').map(t => ({ label: t.name, kind: t.sectionName, to: t.to }))].slice(0, 14);
    } else shown = [...commands, ...all].map(x => ({ x, s: score(x.label + ' ' + x.kind, text) })).filter(o => o.s >= 0).sort((a, b) => b.s - a.s).slice(0, 14).map(o => o.x);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    res.innerHTML = shown.length ? shown.map((x, i) => `<li role="option" id="sh-o${i}" aria-selected="${i === sel}" data-i="${i}"><span class="sh-o-label">${esc(x.label)}</span><span class="sh-o-kind">${esc(x.kind)}${x.alt ? ' · <a href="' + esc(href(x.alt, page)) + '" data-alt>with exercises</a>' : ''}</span></li>`).join('')
      : '<li class="sh-none">Nothing matches. Try one word, such as "spark", "attention" or "sql".</li>';
    q.setAttribute('aria-activedescendant', shown.length ? 'sh-o' + sel : '');
  }
  function choose(i) { const x = shown[i]; if (!x) return; close(); if (x.run) x.run(); else location.href = href(x.to, page); }
  function close() { dlg.hidden = true; document.body.classList.remove('sh-modal'); if (opener) opener.focus(); }
  openPalette = () => { opener = document.activeElement; dlg.hidden = false; document.body.classList.add('sh-modal'); q.value = ''; sel = 0; draw(); q.focus(); };
  q.addEventListener('input', () => { sel = 0; draw(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length); draw(); document.getElementById('sh-o' + sel)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
  });
  res.addEventListener('click', e => { if (e.target.closest('[data-alt]')) { close(); return; } const li = e.target.closest('[data-i]'); if (li) choose(+li.dataset.i); });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  dlg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  document.getElementById('sh-search').addEventListener('click', () => openPalette());
}

function shortcuts(page) {
  let g = 0;
  document.addEventListener('keydown', e => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable], .cm-editor, .CodeMirror');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector('.sh-palette')?.hidden) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'g') { g = Date.now(); return; }
    if (Date.now() - g < 1200) { const s = SECTIONS.find(x => x.key === e.key && !x.hidden); g = 0; if (s) location.href = href(s.tabs[0].to, page); }
  });
}

/* ------------------------------------------------------------------ the study-clock timer, on every page */
export function beep(times = 2, freq = 660) {
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = C.createOscillator(), g = C.createGain(), t = C.currentTime + i * 0.42;
      o.frequency.value = freq; o.connect(g); g.connect(C.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.start(t); o.stop(t + 0.36);
    }
    setTimeout(() => C.close(), 2200);
  } catch {}
}
function signal(title, text) {
  beep(2);
  try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch {}
  try { if (read('lfz-clock-notify', false) && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body: text, tag: 'lfz-clock', icon: 'icons/icon-192.png' }); } catch {}
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible' && read('lfz-clock-awake', true)) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
function prompt(html) {
  let p = document.getElementById('sh-prompt');
  if (!p) { p = document.createElement('div'); p.id = 'sh-prompt'; p.className = 'sh-prompt'; p.setAttribute('role', 'alertdialog'); p.setAttribute('aria-live', 'assertive'); document.body.append(p); }
  if (!html) { p.hidden = true; return; }
  p.innerHTML = html + '<button type="button" class="sh-prompt-close">OK</button>'; p.hidden = false;
  p.querySelector('.sh-prompt-close').onclick = () => { p.hidden = true; };
  p.querySelector('.sh-prompt-close').focus({ preventScroll: true });
}
export function timerEventHtml(event, st, now = new Date()) {
  if (event === 'work-done') { const b = breakTip(st.round, now), r = recallTip(st.round, now);
    return `<p class="sh-prompt-kicker">Round ${st.round - 0} of ${st.rounds} done · ${Math.round(st.rest / 60)}-minute break</p><h2>${esc(r.title)}, then move</h2><p>${esc(r.how)}</p><p><strong>${esc(b.title)}.</strong> ${esc(b.how)}</p>`; }
  if (event === 'break-done') return `<p class="sh-prompt-kicker">Break over · round ${st.round} of ${st.rounds}</p><h2>Back to it</h2><p>Sit down, read the one line you wrote, and carry on.</p>`;
  if (event === 'done') { const r = recallTip(9, now);
    return `<p class="sh-prompt-kicker">Session finished</p><h2>${esc(r.title)}</h2><p>${esc(r.how)}</p><p>Then write one line: where do you pick up next time?</p>`; }
  return '';
}
function timer(page) {
  const pill = document.getElementById('sh-timer');
  function draw() {
    const st = read(TIMER_KEY, null);
    if (!st) { pill.hidden = true; keepAwake(false); if (document.title.includes(' · Study clock')) document.title = document.title.replace(/^.*? · Study clock · /, ''); return; }
    const left = remaining(st), rest = st.phase === 'break';
    pill.hidden = false; pill.className = 'sh-timer ' + (rest ? 'rest' : KINDS[st.kind].colour);
    pill.innerHTML = `${icon('clock')}<span>${rest ? 'Break' : esc(KINDS[st.kind].name)}</span><b>${mmss(left)}</b>`;
    pill.setAttribute('aria-label', `${rest ? 'Break' : KINDS[st.kind].name} timer, ${mmss(left)} left. Open the study clock.`);
    keepAwake(true);
  }
  function tick() {
    const st = read(TIMER_KEY, null);
    if (st) {
      const { state, event } = advance(st);
      if (event) {
        write(TIMER_KEY, state);
        if (event !== 'expired') {
          const title = event === 'work-done' ? 'Break time: move' : event === 'break-done' ? 'Break over' : 'Session finished';
          signal(title, event === 'work-done' ? breakTip(st.round).title + ' — ' + recallTip(st.round).title : 'Study clock');
          prompt(timerEventHtml(event, event === 'break-done' ? state : st));
        }
        window.dispatchEvent(new Event('lfz-clock'));
      }
    }
    draw();
  }
  window.addEventListener('lfz-clock', draw);
  window.addEventListener('storage', e => { if (e.key === TIMER_KEY) draw(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); } });
  setInterval(tick, 1000); tick();
}

if (typeof document !== 'undefined' && document.body) mount();
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', mount);
