// What the other apps on this site know about your day, read from their own saved data.
// All the apps live on one origin (manojhunasimarad.github.io), so they share localStorage:
//
//   Kitchen From Zero   kfz.summary   written for Dinachari after every change: meals for today and
//                                     tomorrow, prep tasks (soak, sprout, marinate, curd), shopping
//                       kfz.state     the app's own data: eaten ticks (week), weight log (wlog), prep ticks (done)
//   LLM From Zero       lfz-clock-settings, -log, -timer   routine, finished timer rounds, a running round
//                       lfz-today-v1, lfz-learning-v1, lfz-solved-v1, lfz-etl-guide-v1   today's five steps
//   Dalal Dojo          dojo.account    the paper-trading desk;   dalal-dojo-v1   lessons, belts and lab
//
// Dinachari only reads these, with one exception: ticking a Kitchen prep task writes the same field
// Kitchen's own tick box writes (kfz.state.done). The LLM app's rules are imported from its own
// modules, so "today's five steps" here always match what that app shows.

import { isoWeek, parseYmd, dayOf, addDays } from './core.mjs';

const read = (store, k, d) => { try { const v = store.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
export const LINKS = {
  'kitchen:today': '/Kitchen/#today', 'kitchen:shop': '/Kitchen/#shop', 'kitchen:recipes': '/Kitchen/#recipes',
  'kitchen:pantry': '/Kitchen/#pantry', 'kitchen:check': '/Kitchen/#check', 'kitchen:me': '/Kitchen/#me', 'kitchen:cook': '/Kitchen/#cook',
  'kitchen:surprise': '/Kitchen/#surprise', 'kitchen:setup': '/Kitchen/#setup',
  'llm:today': '/llm-from-zero/studio.html#today', 'llm:clock': '/llm-from-zero/studio.html#clock',
  'llm:practice': '/llm-from-zero/index.html#/practice/python', 'llm:recall': '/llm-from-zero/index.html#/recall',
  'llm:quiz': '/llm-from-zero/index.html#/quiz', 'llm:etl': '/llm-from-zero/studio.html#etl', 'llm:library': '/llm-from-zero/studio.html#library',
  'llm:progress': '/llm-from-zero/studio.html#progress', 'llm:setup': '/llm-from-zero/studio.html#setup',
  'dojo:desk': '/dalal-dojo/', 'dojo:lessons': '/dalal-dojo-lessons/'
};
/** LLM From Zero's own link form: "s:#today" is the studio page, "p:#/recall" the practice app. */
export function llmHref(link) {
  const m = /^([sp]):(.*)$/.exec(String(link || ''));
  if (!m) return LINKS[link] || LINKS['llm:today'];
  return '/llm-from-zero/' + (m[1] === 's' ? 'studio.html' : 'index.html') + (m[2].startsWith('#') ? m[2] : '#' + m[2]);
}
export const href = link => LINKS[link] || (/^[sp]:/.test(link || '') ? llmHref(link) : link || '/');

/* ------------------------------------------------------------------ Kitchen From Zero */
const KDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const kday = date => KDAYS[(parseYmd(date).getDay() + 6) % 7];
export function kitchen(store = globalThis.localStorage) {
  const summary = obj(read(store, 'kfz.summary', null));
  const state = obj(read(store, 'kfz.state', null));
  const ok = summary && summary.v === 1 && Array.isArray(summary.days);
  return { summary: ok ? summary : null, state, used: !!(ok || (state && Object.keys(state.days || {}).length)) };
}
/** Slots ('b', 'l', 'd') ticked as eaten in Kitchen on a date. */
export function eatenOn(state, date) {
  const wk = (state && state.week && state.week[isoWeek(date)]) || {};
  return ['b', 'l', 'd'].filter(sl => wk[kday(date) + '-' + sl]);
}
export function weights(state) {
  return Object.entries((state && state.wlog) || {}).filter(([d, v]) => /^\d{4}-\d\d-\d\d$/.test(d) && +v > 0)
    .map(([date, kg]) => ({ date, kg: +kg })).sort((a, b) => (a.date < b.date ? -1 : 1));
}
/** Meals for a date from the summary, with eaten ticks taken from Kitchen's own state (fresher). */
export function mealsOn(k, date) {
  const day = k.summary && k.summary.days.find(d => d.date === date);
  if (!day) return null;
  const eaten = eatenOn(k.state, date);
  return { ...day, meals: (day.meals || []).map(m => ({ ...m, eaten: eaten.includes(m.slot) || !!m.eaten })) };
}
/** Prep tasks with Kitchen's own ticks applied. */
export function prepList(k) {
  const done = (k.state && k.state.done) || {};
  return ((k.summary && k.summary.prep) || []).map(t => ({ ...t, done: k.state ? !!done[t.key] : !!t.done }));
}
/** Tick or untick a prep task, exactly as Kitchen's own tick box does. Returns false if not possible. */
export function markPrepDone(store, key, on, now = Date.now()) {
  if (!/^adv:/.test(key)) return false;
  // Kitchen saves its state only after the first change there; until then, start one. Kitchen fills in
  // every missing part when it loads (its norm()), so {v: 2, done} is a valid state for it.
  const state = obj(read(store, 'kfz.state', null)) || { v: 2 };
  state.done = obj(state.done) || {};
  if (on) state.done[key] = Math.floor(now / 1000); else delete state.done[key];
  try { store.setItem('kfz.state', JSON.stringify(state)); return true; } catch { return false; }
}
export function shoppingText(k) {
  const s = k.summary && k.summary.shop;
  if (!s) return '';
  const items = [...new Set([...(s.bring || []), ...(s.need || []).map(n => n.label), ...(s.low || [])])];
  return items.length ? ['Shopping list', ...items.map(x => '- ' + x)].join('\n') : '';
}
export const summaryAge = (k, now = Date.now()) => k.summary ? now - (k.summary.at || 0) : Infinity;

/* ------------------------------------------------------------------ LLM From Zero */
let llmMods = null;
export async function loadLlm(base = '/llm-from-zero/') {
  if (llmMods) return llmMods;
  const [journey, clock] = await Promise.all([import(base + 'journey-core.mjs'), import(base + 'clock-core.mjs')]);
  return (llmMods = { journey, clock });
}
export const llmRoutine = (store = globalThis.localStorage) => obj(read(store, 'lfz-clock-settings', null));
export function writeLlmRoutine(store, routine) { try { store.setItem('lfz-clock-settings', JSON.stringify(routine)); return true; } catch { return false; } }
/** Finished study rounds on a date (LLM's study clock log). */
export function roundsOn(store, date) {
  const log = read(store, 'lfz-clock-log', []);
  return (Array.isArray(log) ? log : []).filter(r => r && r.at && dayOf(r.at) === date);
}
export async function llm(store = globalThis.localStorage, date, routine, mods = null) {
  const out = { used: false, steps: null, blocks: [], rounds: roundsOn(store, date), timer: obj(read(store, 'lfz-clock-timer', null)), error: '' };
  out.mins = out.rounds.reduce((a, r) => a + (+r.mins || 0), 0);
  out.used = !!(out.rounds.length || read(store, 'lfz-learning-v1', null) || read(store, 'lfz-today-v1', null));
  try {
    const m = mods || await loadLlm();
    const day = m.journey.dayKey(parseYmd(date));
    const today = m.journey.todayState(read(store, 'lfz-today-v1', null), day);
    out.steps = m.journey.todaySteps({ day, clockLog: read(store, 'lfz-clock-log', []), learning: read(store, 'lfz-learning-v1', null),
      solved: read(store, 'lfz-solved-v1', null), guide: read(store, 'lfz-etl-guide-v1', null), today });
    const wd = parseYmd(date).getDay();
    out.blocks = m.clock.buildWeek(routine).filter(b => b.day === wd).map(b => ({ ...b, kindName: (m.clock.KINDS[b.kind] || {}).name || 'Study',
      title: `${(m.clock.KINDS[b.kind] || {}).name || 'Study'}: ${b.title}` }));
    if (out.timer) out.timerLeft = m.clock.remaining(out.timer);
  } catch (e) { out.error = 'LLM From Zero could not be read here (open it once while online).'; }
  return out;
}
/** Days in a row (ending today or yesterday) with at least one finished study round. */
export function studyStreak(store, today) {
  const log = read(store, 'lfz-clock-log', []), days = new Set((Array.isArray(log) ? log : []).filter(r => r && r.at).map(r => dayOf(r.at)));
  let d = days.has(today) ? today : addDays(today, -1), n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ------------------------------------------------------------------ Dalal Dojo */
// Ranks and belts copied from the two Dojo pages, so the names here match what they show.
export const DOJO_RANKS = [[0, 'Rookie'], [200, 'Tape Reader'], [500, 'Order Pro'], [1000, 'Margin Aware'], [1800, 'Risk Manager'], [3000, 'Quant Apprentice']];
export const DOJO_BELTS = [[0, 'White'], [100, 'Yellow'], [250, 'Orange'], [500, 'Green'], [850, 'Blue'], [1300, 'Brown'], [1800, 'Black']];
export const DOJO_MISSIONS = 20, DOJO_LESSONS = 24;
export function level(xp, table) {
  let i = 0; for (let k = 0; k < table.length; k++) if (xp >= table[k][0]) i = k;
  return { name: table[i][1], next: table[i + 1] ? { name: table[i + 1][1], xp: table[i + 1][0] } : null };
}
export function dojo(store = globalThis.localStorage) {
  const A = obj(read(store, 'dojo.account', null));
  if (!A) return null;
  const capital = +A.capital || 100000, hist = Array.isArray(A.history) ? A.history : [];
  let worth = hist[0] && Number.isFinite(+hist[0].end) ? +hist[0].end : null;
  if (worth == null) {
    worth = +A.cash || 0;
    for (const [sym, h] of Object.entries(obj(A.holdings) || {})) worth += (+h.qty || 0) * (+((A.lastCloses || {})[sym]) || +h.avg || 0);
  }
  const xp = +A.xp || 0, closed = (Array.isArray(A.trips) ? A.trips : []).filter(t => t && t.status === 'closed');
  return {
    capital, worth, pnl: worth - capital, pct: capital ? (worth - capital) / capital * 100 : 0,
    days: hist.length, greenDays: hist.filter(h => h.net > 0).length, last: hist[0] || null,
    trades: closed.length, wins: closed.filter(t => t.net > 0).length,
    xp, rank: level(xp, DOJO_RANKS), missions: Object.keys(obj(A.missions) || {}).length,
    inDay: !!A.day, savedAt: +A.savedAt || 0, createdAt: +A.createdAt || 0
  };
}
export function dojoLessons(store = globalThis.localStorage) {
  const S = obj(read(store, 'dalal-dojo-v1', null));
  if (!S || S.v !== 1) return null;
  const xp = +S.xp || 0, done = Object.values(obj(S.lessons) || {}).filter(Boolean).length;
  const streak = obj(S.streak) || {};
  return { xp, belt: level(xp, DOJO_BELTS), lessons: done, streak: +streak.count || 0, last: streak.last || '', mode: S.mode || 'sim' };
}
/** Why today counts as trading practice, or '' if it doesn't. */
export function tradedOn(d, l, date) {
  if (d && d.savedAt && dayOf(d.savedAt) === date && d.savedAt - d.createdAt > 60000) return d.inDay ? 'Trading day open on the desk' : 'Used the paper desk';
  if (l && l.last === date) return 'Lesson streak kept';
  return '';
}

/* ------------------------------------------------------------------ backups */
// Everything the site's apps keep in this browser, in one file. Sign-in tokens and API keys are left out.
export const SECRET_KEYS = /^(lfz-sync-v1|lfz-sync-token|kfz\.gemini.*|day\.sync.*)$/;
export function siteBackup(store = globalThis.localStorage, now = new Date()) {
  const keys = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!k || SECRET_KEYS.test(k)) continue;
    if (!/^(day\.|kfz\.|lfz-|dojo\.|dalal-dojo)/.test(k)) continue;
    keys[k] = store.getItem(k);
  }
  return { app: 'dinachari-site-backup', v: 1, at: now.toISOString(), origin: globalThis.location ? location.origin : '', keys };
}
export const backupApps = keys => ({
  dinachari: Object.keys(keys).filter(k => k.startsWith('day.')).length,
  kitchen: Object.keys(keys).filter(k => k.startsWith('kfz.')).length,
  llm: Object.keys(keys).filter(k => k.startsWith('lfz-')).length,
  dojo: Object.keys(keys).filter(k => k.startsWith('dojo.') || k.startsWith('dalal-dojo')).length
});
