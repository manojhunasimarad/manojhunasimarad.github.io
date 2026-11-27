// The rules behind the progress bar, the ETL step guide's tick boxes and today's checklist.
// Pure functions: no DOM, no storage, no network, so tools/journey.test.mjs can check them in Node.
//
//   goal progress   how far along your chosen path you are: topics known (demonstrated, marked known,
//                   or tested out of by solving their exercises) and the study hours that remain
//   guide ticks     the ETL guide's "Done when" boxes; one record per box, the newer change wins,
//                   so unticking on the phone and ticking on the laptop merge the same way on both
//   today           five steps of a study day (plan, learn, use, recall, log), ticked by what you
//                   actually did: timer rounds, time on lesson and exercise pages, solved exercises,
//                   ticks, recall reviews and the session log, or by hand when you worked offline
import { knownTopics, planFor } from './etl-core.mjs';

export const GUIDE_KEY = 'lfz-etl-guide-v1', SOLVED_KEY = 'lfz-solved-v1', TODAY_KEY = 'lfz-today-v1', TOUR_KEY = 'lfz-tour-v1';
const ID = /^[a-z0-9][a-z0-9:_-]{0,95}$/;
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const okStamp = (at, now) => Number.isFinite(at) && at > 0 && at <= now + 300000;

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ ETL guide ticks */
export const emptyGuide = () => ({ app: 'lfz-etl-guide', version: 1, ticks: {}, updated: 0 });

/** Every tick box of the guide, in reading order: [{id, text, section, sectionTitle}]. */
export function guideItems(guide) {
  const out = [];
  for (const s of guide.sections || []) for (const b of s.blocks || []) if (b.t === 'check') for (const it of b.items) out.push({ id: it.id, text: it.text, section: s.id, sectionTitle: s.title });
  return out;
}
export const isTicked = (state, id) => !!state?.ticks?.[id]?.on;

export function setTick(state, id, on, now = Date.now()) {
  if (!ID.test(id) || BAD.has(id)) throw Error('Unknown tick box: ' + id);
  const base = state && state.app === 'lfz-etl-guide' ? state : emptyGuide();
  return { ...base, ticks: { ...base.ticks, [id]: { on: !!on, at: now } }, updated: now };
}

/** Sync and backup merge: per box, the newer change wins (an untick is a change too). */
export function mergeGuide(local, remote, now = Date.now()) {
  const out = local && local.app === 'lfz-etl-guide' ? { ...emptyGuide(), ...local, ticks: { ...local.ticks } } : emptyGuide();
  if (!remote || remote.app !== 'lfz-etl-guide' || !remote.ticks || typeof remote.ticks !== 'object') return out;
  for (const [id, r] of Object.entries(remote.ticks)) {
    if (!ID.test(id) || BAD.has(id) || !r || typeof r !== 'object' || !okStamp(r.at, now)) continue;
    if (!out.ticks[id] || r.at > out.ticks[id].at) out.ticks[id] = { on: !!r.on, at: r.at };
  }
  out.updated = Math.max(out.updated || 0, Number.isFinite(remote.updated) && remote.updated <= now + 300000 ? remote.updated : 0);
  return out;
}

/** Ticks per section and overall, and the first section that still has open boxes. */
export function guideProgress(guide, state) {
  const sections = (guide.sections || []).map(s => {
    const ids = (s.blocks || []).filter(b => b.t === 'check').flatMap(b => b.items.map(i => i.id));
    const done = ids.filter(id => isTicked(state, id)).length;
    return { id: s.id, title: s.title, short: s.short || s.title, kind: s.kind, n: s.n, done, total: ids.length };
  });
  const done = sections.reduce((n, s) => n + s.done, 0), total = sections.reduce((n, s) => n + s.total, 0);
  const next = sections.find(s => s.total && s.done < s.total) || null;
  return { sections, done, total, pct: total ? Math.round(100 * done / total) : 0, next };
}
/** Speedrun lock: the first earlier section that still has open boxes, or null when `id` is open. */
export function lockedBy(progress, id) {
  const all = progress.sections || [], i = all.findIndex(s => s.id === id);
  return i < 0 ? null : all.slice(0, i).find(s => s.total && s.done < s.total) || null;
}

/** Boxes ticked on a given day (for today's "Use" step). */
export function ticksOn(state, day) {
  return Object.values(state?.ticks || {}).filter(t => t.on && dayKey(new Date(t.at)) === day).length;
}

/* ------------------------------------------------------------------ solved exercises, mirrored from the practice app */
export const emptySolved = () => ({ app: 'lfz-solved', version: 1, ids: {} });
/** Exercise ids the practice app reports as solved; the first time seen is kept. */
export function noteSolved(state, ids, now = Date.now()) {
  const base = state && state.app === 'lfz-solved' ? state : emptySolved();
  let changed = false; const out = { ...base, ids: { ...base.ids } };
  for (const id of ids || []) if (typeof id === 'string' && /^[\w.-]{1,120}$/.test(id) && !BAD.has(id) && !out.ids[id]) { out.ids[id] = now; changed = true; }
  return changed ? out : base;
}
export function mergeSolved(local, remote, now = Date.now()) {
  const out = local && local.app === 'lfz-solved' ? { ...local, ids: { ...local.ids } } : emptySolved();
  if (!remote || remote.app !== 'lfz-solved' || !remote.ids) return out;
  for (const [id, at] of Object.entries(remote.ids)) if (/^[\w.-]{1,120}$/.test(id) && !BAD.has(id) && okStamp(at, now) && (!out.ids[id] || at < out.ids[id])) out.ids[id] = at;
  return out;
}

/* ------------------------------------------------------------------ goal progress */
/** What counts as known, gathered from stored records. read(key) gives parsed JSON or null; keys: all storage keys. */
export function progressInputs(read, keys, learning) {
  const marked = [...(read('lfz-etl-v1')?.known || [])];
  for (const k of keys || []) if (/^lfz-proj-[\w-]+-v1$/.test(k)) marked.push(...(read(k)?.known || []));
  const solved = Object.keys(read(SOLVED_KEY)?.ids || {});
  const demonstrated = Object.entries(learning?.topics || {}).filter(([, t]) => t && t.status === 'demonstrated').map(([id]) => id);
  return { marked: marked.filter(x => typeof x === 'string'), solved, demonstrated };
}
/**
 * How far along the chosen path you are. `marked`: topic ids you marked known (ETL and project pages);
 * `solved`: exercise ids; `demonstrated`: topic ids demonstrated in the learning desk.
 */
export function goalProgress(graph, track, { marked = [], solved = [], demonstrated = [] } = {}) {
  const t = graph.tracks.find(x => x.id === track) || graph.tracks[0];
  const why = knownTopics(graph, { marked: new Set(marked), solved: new Set(solved), demonstrated: new Set(demonstrated) });
  const p = planFor(graph, t.targets, why);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const pathSize = p.study.size + p.knownOnPath.size + p.coveredByKnown.length;
  const done = pathSize - p.study.size;
  const nowId = p.next[0] || null;
  const upcoming = p.order.filter(id => id !== nowId).slice(0, 3);
  const node = id => { const n = byId.get(id); return { id, title: n.title, hours: n.hours, group: n.group, practice: n.practice || [], checkpoint: n.checkpoint || null }; };
  return {
    track: t.id, title: t.title, total: pathSize, done, pct: pathSize ? Math.round(100 * done / pathSize) : 0,
    hoursLeft: p.hours, hoursTotal: p.fullHours, now: nowId ? node(nowId) : null, upcoming: upcoming.map(node),
    ready: p.next.map(node), known: [...p.knownOnPath].map(node), why
  };
}

/* ------------------------------------------------------------------ today's five steps */
export const STEPS = [
  { id: 'plan', label: 'Plan', title: 'Pick today\'s one thing', how: 'Open the daily start (the progress bar or "What now?") and read your next step.' },
  { id: 'learn', label: 'Learn', title: 'Read or listen', how: 'One Learn round, or 10 minutes on a lesson, topic or guide page.' },
  { id: 'use', label: 'Use', title: 'Build or practise', how: 'One Use round, a solved exercise, a ticked guide box, or 10 minutes on an exercise.' },
  { id: 'recall', label: 'Recall', title: 'Recall from memory', how: 'A Recall round, a recall review, a quiz, or 3 minutes on recall cards. Best about 50 minutes before sleep.' },
  { id: 'log', label: 'Log', title: 'Write one line', how: 'Log the session on Today: what you did and where you pick up next time.' }
];
export const emptyToday = day => ({ day, plan: 0, secs: { learn: 0, use: 0, recall: 0 }, manual: {} });
export function todayState(saved, day) {
  return saved && saved.day === day && saved.secs ? { ...emptyToday(day), ...saved, secs: { ...emptyToday(day).secs, ...saved.secs }, manual: { ...(saved.manual || {}) } } : emptyToday(day);
}
/** Where a page counts: "learn", "use", "recall" or null. `place` is site-nav's where(): "s:lesson/x", "p:/ex/y". */
export function pageKind(place) {
  if (/^p:\/(recall|quiz)/.test(place) || /\?review$/.test(place) || /^s:quiz/.test(place)) return 'recall';
  if (/^p:\/(ex|review|mock)\//.test(place) || /^p:\/mock/.test(place)) return 'use';
  if (/^s:(lesson|topic|etl)\b/.test(place) || /^p:\/(lesson|read|paper)\b/.test(place)) return 'learn';
  return null;
}
export const NEED_SECS = { learn: 600, use: 600, recall: 180 };

/**
 * The five steps for `day`, each {id, label, title, how, done, why}.
 * clockLog: [{kind, at}] finished timer rounds; learning: the learning-plan state;
 * solved: {ids: {id: firstSeen}}; guide: tick state; today: todayState(); recallDue: number due.
 */
export function todaySteps({ day, clockLog = [], learning = null, solved = null, guide = null, today, recallDue = 0 }) {
  const t = today || emptyToday(day);
  // timer rounds by kind; a Listen round counts as learning and a Test round as recall
  const alias = { learn: ['learn', 'listen'], use: ['use'], recall: ['recall', 'review'] };
  const rounds = k => clockLog.filter(r => r && alias[k].includes(r.kind) && dayKey(new Date(r.at)) === day).length;
  const solvedToday = Object.values(solved?.ids || {}).filter(at => dayKey(new Date(at)) === day).length;
  const ticked = ticksOn(guide, day);
  const reviewed = Object.values(learning?.topics || {}).filter(x => x && x.reviewed === day).length;
  const quizzes = Object.values(learning?.quizAttempts || {}).filter(q => q && dayKey(new Date(q.updated)) === day).length;
  const logged = Object.values(learning?.sessions || {}).filter(s => s && s.day === day).length;
  const reasons = {
    plan: t.plan ? 'You opened the daily start' : '',
    learn: rounds('learn') ? `${rounds('learn')} Learn round${rounds('learn') > 1 ? 's' : ''}` : t.secs.learn >= NEED_SECS.learn ? `${Math.round(t.secs.learn / 60)} min on lessons` : '',
    use: rounds('use') ? `${rounds('use')} Use round${rounds('use') > 1 ? 's' : ''}` : solvedToday ? `${solvedToday} exercise${solvedToday > 1 ? 's' : ''} solved` : ticked ? `${ticked} guide box${ticked > 1 ? 'es' : ''} ticked` : t.secs.use >= NEED_SECS.use ? `${Math.round(t.secs.use / 60)} min on exercises` : '',
    recall: rounds('recall') ? `${rounds('recall')} Recall or Test round${rounds('recall') > 1 ? 's' : ''}` : reviewed ? `${reviewed} recall review${reviewed > 1 ? 's' : ''}` : quizzes ? 'Quiz taken' : t.secs.recall >= NEED_SECS.recall ? 'Recall cards practised' : '',
    log: logged ? `${logged} session${logged > 1 ? 's' : ''} logged` : ''
  };
  const steps = STEPS.map(s => {
    const why = reasons[s.id] || (t.manual[s.id] ? 'Ticked by hand' : '');
    return { ...s, done: !!why, why, manual: !reasons[s.id] && !!t.manual[s.id] };
  });
  const r = steps.find(s => s.id === 'recall');
  if (!r.done && !recallDue) r.hint = 'Nothing is due: a 10-minute recall of today\'s topic still helps.';
  return { steps, done: steps.filter(s => s.done).length, next: steps.find(s => !s.done) || null };
}

/* ------------------------------------------------------------------ the first-visit tour */
export const TOUR_VERSION = 1;
export const tourPending = saved => !saved || saved.version !== TOUR_VERSION || !(saved.done || saved.skipped);
