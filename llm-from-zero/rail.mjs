// The progress bar under the header, on every page: how far along your goal you are, the topic to
// work on now, and today's five steps (plan, learn, use, recall, log) ticking themselves as you work.
// Tap it for the daily start. It also fills the progress panels on Today, Progress and the ETL guide
// (any element with data-journey="..."), so every page shows the same numbers. Rules: journey-core.mjs.
import { GUIDE_KEY, SOLVED_KEY, TODAY_KEY, NEED_SECS, dayKey, emptyGuide, goalProgress, guideProgress, progressInputs, todaySteps, todayState, pageKind, setTick } from './journey-core.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const fetchJson = p => fetch(p).then(r => r.ok ? r.json() : null).catch(() => null);
const PROJECT_TRACKS = { 'rag-project': 'rag', 'fl-project': 'fl', 'gpu-project': 'gpu' };

let graph = null, guide = null, ctx = null, last = null;
const ensure = async () => {
  if (!graph) graph = await fetchJson('content/learning-graph.json');
  if (!guide) guide = await fetchJson('content/etl-guide.json');
  return !!graph;
};

/** Everything the bar and the panels show, from what this browser has stored. */
export function snapshot(now = new Date()) {
  if (!graph) return null;
  const learning = read('lfz-learning-v1', null) || {};
  const track = learning.settings?.track || 'apps';
  const solvedState = read(SOLVED_KEY, null);
  const goal = goalProgress(graph, track, progressInputs(k => read(k, null), Object.keys(localStorage), learning));
  const ticks = read(GUIDE_KEY, null) || emptyGuide();
  const build = guide ? guideProgress(guide, ticks) : null;
  const day = dayKey(now), today = todayState(read(TODAY_KEY, null), day);
  const recallDue = Object.values(learning.topics || {}).filter(t => t && t.due && t.due <= day).length;
  const steps = todaySteps({ day, clockLog: read('lfz-clock-log', []), learning, solved: solvedState, guide: ticks, today, recallDue });
  const sessions = Object.values(learning.sessions || {}).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const days = new Set(Object.values(learning.sessions || {}).map(s => s.day));
  let streak = 0, cur = days.has(day) ? new Date(now) : new Date(now.getTime() - 864e5);
  while (days.has(dayKey(cur))) { streak++; cur = new Date(cur.getTime() - 864e5); }
  return { goal, build, ticks, steps, recallDue, lastSession: sessions[0] || null, streak, isEtl: track === 'etl', track, day, settings: learning.settings || {} };
}

const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const bar = (value, label, cls = '') => `<span class="jr-meter ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-label="${esc(label)}"><i style="width:${value}%"></i></span>`;
const go = to => ctx ? ctx.href(to, ctx.page) : to;
const stepHref = { plan: 's:#today', learn: 's:#library', use: 'p:#/practice/python', recall: 'p:#/recall', log: 's:#today' };

/* ------------------------------------------------------------------ the bar */
function railHtml(s) {
  const g = s.goal, short = g.title.replace(/^ETL project: data engineering$/, 'ETL project').replace(/^Project: /, '');
  const dots = s.steps.steps.map(st => `<span class="jr-dot${st.done ? ' on' : ''}" title="${esc(st.label)}: ${st.done ? esc(st.why) : 'not yet'}"><b>${st.done ? '✓' : ''}</b><em>${esc(st.label)}</em></span>`).join('');
  const now = g.now ? `<a class="jr-now" href="${esc(go('s:#topic/' + g.now.id))}" title="The topic to work on now"><span>Now</span><b>${esc(g.now.title)}</b></a>` : `<span class="jr-now"><span>Now</span><b>Path done: build and tell the story</b></span>`;
  return `<div class="jr-in">
    <button type="button" class="jr-goal" data-jr-open title="${esc(g.title)}: ${g.done} of ${g.total} topics known, about ${g.hoursLeft} h of study left. Open the daily start.">
      <span class="jr-name">${esc(short)}</span>${bar(g.pct, 'Goal progress')}<span class="jr-pct">${g.pct}%</span><span class="jr-hours">${g.hoursLeft} h left</span></button>
    ${now}
    ${s.isEtl && s.build ? `<a class="jr-build" href="${esc(go('s:#etl' + (s.build.next ? '/' + s.build.next.id : '')))}" title="ETL step guide: ${s.build.done} of ${s.build.total} boxes ticked"><span>Guide</span>${bar(s.build.pct, 'ETL guide boxes', 'use')}<b>${s.build.done}/${s.build.total}</b></a>` : ''}
    <button type="button" class="jr-today" data-jr-open title="Today: ${s.steps.done} of 5 steps. Open the daily start."><span class="jr-label">Today</span><span class="jr-dots">${dots}</span><span class="jr-count">${s.steps.done}/5</span></button>
  </div>`;
}

/* ------------------------------------------------------------------ panels other pages place: data-journey="goal|today|build|path" */
export function goalPanel(s) {
  const g = s.goal;
  return `<div class="jp-goal"><div class="jp-row"><span class="jp-big">${g.pct}<small>%</small></span><span><b>${esc(g.title)}</b><small>${g.done} of ${g.total} topics known · about ${g.hoursLeft} h of ${g.hoursTotal} h left</small></span></div>
    ${bar(g.pct, 'Goal progress', 'big')}
    <ol class="jp-path">${g.known.slice(-2).map(t => `<li class="done"><a href="${esc(go('s:#topic/' + t.id))}">${esc(t.title)}</a></li>`).join('')}
      ${g.now ? `<li class="now"><a href="${esc(go('s:#topic/' + g.now.id))}">${esc(g.now.title)}</a><small>now · ~${g.now.hours} h</small></li>` : ''}
      ${g.upcoming.map(t => `<li><a href="${esc(go('s:#topic/' + t.id))}">${esc(t.title)}</a><small>~${t.hours} h</small></li>`).join('')}</ol>
    <p class="jp-foot"><a href="${esc(go(s.isEtl ? 'p:#/etl?goal=whole' : 's:#roadmap'))}">The whole path →</a>${s.isEtl ? ` <a href="${esc(go('p:#/etl/check'))}">Skip what you know →</a>` : ''}</p></div>`;
}
export function todayPanel(s, { compact = false } = {}) {
  return `<ol class="jp-today${compact ? ' compact' : ''}">${s.steps.steps.map(st => `<li class="${st.done ? 'done' : ''}${s.steps.next?.id === st.id ? ' next' : ''}">
      <button type="button" class="jp-tick" data-jr-tick="${st.id}" aria-pressed="${st.done}" ${st.done && !st.manual ? 'disabled' : ''} title="${st.done ? (st.manual ? 'Ticked by hand: press to untick' : 'Ticked automatically') : 'Did it away from the site? Tick it by hand'}">${st.done ? '✓' : ''}</button>
      <span class="jp-step"><a href="${esc(go(stepHref[st.id]))}"><b>${esc(st.label)}</b> · ${esc(st.title)}</a><small>${esc(st.done ? st.why : st.hint || st.how)}</small></span></li>`).join('')}</ol>`;
}
export function buildPanel(s, { tiles = true } = {}) {
  if (!s.build) return '';
  const b = s.build, next = b.next;
  return `<div class="jp-build"><div class="jp-row"><span class="jp-big">${b.done}<small>/${b.total}</small></span><span><b>ETL step guide</b><small>boxes ticked by you · ${b.pct}%</small></span></div>${bar(b.pct, 'ETL guide boxes', 'use big')}
    ${tiles ? `<ul class="jp-sections">${b.sections.filter(x => x.total).map(x => `<li class="${x.done === x.total ? 'done' : next && next.id === x.id ? 'now' : ''}"><a href="${esc(go('s:#etl/' + x.id))}" title="${esc(x.title)}: ${x.done} of ${x.total}"><span>${esc(x.short)}</span>${bar(pct(x.done, x.total), x.title, 'use')}</a></li>`).join('')}</ul>` : ''}
    ${next ? `<p class="jp-foot"><a class="button primary" href="${esc(go('s:#etl/' + next.id))}">Continue: ${esc(next.short)} →</a></p>` : '<p class="jp-foot">Every box is ticked. Write the stories and record the numbers.</p>'}</div>`;
}

function fillPanels(s) {
  document.querySelectorAll('[data-journey]').forEach(el => {
    const kind = el.dataset.journey;
    el.innerHTML = kind === 'goal' ? goalPanel(s) : kind === 'today' ? todayPanel(s) : kind === 'build' ? buildPanel(s) : kind === 'build-compact' ? buildPanel(s, { tiles: false }) : kind === 'today-compact' ? todayPanel(s, { compact: true }) : '';
  });
}

/* ------------------------------------------------------------------ mounting, time on pages, refresh */
export async function mountRail(c) {
  ctx = c;
  const header = document.getElementById('site-header');
  const el = document.createElement('div');
  el.className = 'jr'; el.id = 'lfz-rail'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Your progress');
  header.append(el);
  if (!(await ensure())) { el.remove(); return; }
  const draw = () => {
    const s = snapshot(); if (!s) return; last = s;
    el.innerHTML = railHtml(s);
    fillPanels(s);
    window.dispatchEvent(new CustomEvent('lfz-journey', { detail: s }));
  };
  // Tap the bar: the daily start, at its first step ("Where you are").
  document.addEventListener('click', e => {
    if (e.target.closest('[data-jr-open]')) { e.preventDefault(); window.lfzCoach?.open(0); return; }
    const t = e.target.closest('[data-jr-tick]'); if (!t) return;
    const day = dayKey(), st = todayState(read(TODAY_KEY, null), day), id = t.dataset.jrTick;
    st.manual[id] = !st.manual[id]; if (!st.manual[id]) delete st.manual[id];
    write(TODAY_KEY, st); draw();
    if (t.closest('.seq')) window.dispatchEvent(new Event('lfz-seq-refresh'));   // the daily start shows the same list
  });
  window.addEventListener('lfz-progress', draw);
  window.addEventListener('lfz-clock', draw);
  window.addEventListener('hashchange', () => setTimeout(draw, 300));
  window.addEventListener('storage', e => { if (!e.key || /^lfz-(learning|etl|proj|solved|today|clock-log)/.test(e.key)) draw(); });
  // Count time on lesson, exercise and recall pages while the page is visible (15 s at a time).
  let place = c.where(c.page, location.hash);
  window.addEventListener('hashchange', () => { place = c.where(c.page, location.hash); });
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const kind = pageKind(place); if (!kind) return;
    const day = dayKey(), st = todayState(read(TODAY_KEY, null), day), before = st.secs[kind];
    st.secs[kind] = Math.min(36000, before + 15); write(TODAY_KEY, st);
    if (before < NEED_SECS[kind] && st.secs[kind] >= NEED_SECS[kind]) draw();
  }, 15000);
  setInterval(draw, 60000);
  draw();
  const setH = () => document.documentElement.style.setProperty('--bar-h', header.offsetHeight + 'px');
  setH(); if (window.ResizeObserver) new ResizeObserver(setH).observe(header);
}

/** The daily start's first step marks "Plan" as done for today. */
export function markPlanned() {
  const day = dayKey(), st = todayState(read(TODAY_KEY, null), day);
  if (!st.plan) { st.plan = Date.now(); write(TODAY_KEY, st); window.dispatchEvent(new Event('lfz-progress')); }
}
export const current = () => snapshot() || last;
export const ready = ensure;
export { setTick };
