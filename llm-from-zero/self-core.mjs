// "Know yourself": the rules behind the video-or-reading test and the profile it builds.
// Pure functions: no DOM, no storage, so tools/self.test.mjs can check them in Node.
// Every visitor gets their own empty profile: it lives in their browser (lfz-self-v1) and, with sync on,
// in their own GitHub gist. Nothing here is tied to one person.

export const SELF_KEY = 'lfz-self-v1', DRAFT_KEY = 'lfz-self-draft-v1';
export const RECALL_SECONDS = 120;
export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
export const emptySelf = () => ({ app: 'lfz-self', version: 1, runs: [], updated: 0 });

/** The standard run: four concept lessons from one course, alternating watch / read so neither format gets the easier half. */
export const STANDARD = {
  course: 'PostgreSQL Essential Training',
  where: 'LinkedIn Learning, Adam Wilbert',
  url: 'https://www.linkedin.com/learning/postgresql-essential-training-22611610',
  lessons: [
    { chapter: 'Chapter 2', title: 'The structure of a database table', format: 'video' },
    { chapter: 'Chapter 2', title: 'Join tables together with relationships', format: 'reading' },
    { chapter: 'Chapter 3', title: 'Link primary and foreign keys', format: 'video' },
    { chapter: 'Chapter 3', title: 'Enforce referential integrity on related records', format: 'reading' }
  ]
};

const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
const ID = /^[a-z0-9-]{4,40}$/;

/** Keep only well-formed lessons and runs (used on everything that comes from storage or sync). */
export function cleanLesson(l) {
  if (!l || typeof l !== 'object' || !['video', 'reading'].includes(l.format)) return null;
  if (!num(l.seconds, 1, 4 * 3600) || !num(l.points, 0, 500) || !num(l.written, 0, 500) || l.points > l.written) return null;
  return { title: str(l.title, 160), chapter: str(l.chapter, 60), format: l.format, seconds: Math.round(l.seconds), points: Math.round(l.points), written: Math.round(l.written) };
}
export function cleanRun(r, now = Date.now()) {
  if (!r || typeof r !== 'object' || !ID.test(r.id || '') || !num(r.at, 1, now + 300000)) return null;
  const lessons = (Array.isArray(r.lessons) ? r.lessons : []).map(cleanLesson).filter(Boolean).slice(0, 12);
  if (!lessons.length) return null;
  return { id: r.id, at: r.at, course: str(r.course, 160), speed: SPEEDS.includes(r.speed) ? r.speed : 1, lessons };
}

/** Points per 10 minutes and accuracy for one format inside a run. */
function formatScore(lessons, format) {
  const ls = lessons.filter(l => l.format === format);
  if (!ls.length) return null;
  const sec = ls.reduce((n, l) => n + l.seconds, 0), pts = ls.reduce((n, l) => n + l.points, 0), wrote = ls.reduce((n, l) => n + l.written, 0);
  return { lessons: ls.length, minutes: Math.round(sec / 6) / 10, points: pts, rate: Math.round(6000 * pts / sec) / 10, accuracy: wrote ? Math.round(100 * pts / wrote) : null };
}

/** Score a run: each format's rate, and the winner when one is at least 20% ahead. */
export function scoreRun(run) {
  const video = formatScore(run.lessons, 'video'), reading = formatScore(run.lessons, 'reading');
  let winner = null, margin = null;
  if (video && reading) {
    const hi = Math.max(video.rate, reading.rate), lo = Math.min(video.rate, reading.rate);
    margin = lo > 0 ? Math.round(100 * (hi - lo) / lo) : hi > 0 ? null : 0;
    winner = hi === 0 || hi < lo * 1.2 ? 'tie' : video.rate > reading.rate ? 'video' : 'reading';
  }
  return { video, reading, winner, margin };
}

/** The profile: what the runs so far say about how you learn. */
export function profile(state) {
  const runs = (state?.runs || []).slice().sort((a, b) => a.at - b.at);
  const scored = runs.map(r => ({ run: r, s: scoreRun(r) })).filter(x => x.s.winner);
  if (!scored.length) return { runs: runs.length, complete: 0, winner: null };
  const latest = scored[scored.length - 1], first = scored[0];
  const votes = { video: 0, reading: 0, tie: 0 };
  scored.forEach(x => votes[x.s.winner]++);
  // the overall call: the latest run, unless earlier runs outvote it
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  const winner = top[1] > votes[latest.s.winner] ? top[0] : latest.s.winner;
  const avg = f => { const xs = scored.map(x => x.s[f]).filter(Boolean); return { rate: Math.round(10 * xs.reduce((n, x) => n + x.rate, 0) / xs.length) / 10, accuracy: Math.round(xs.reduce((n, x) => n + (x.accuracy ?? 0), 0) / xs.length) }; };
  return {
    runs: runs.length, complete: scored.length, winner, votes,
    latest: { at: latest.run.at, speed: latest.run.speed, ...latest.s },
    average: { video: avg('video'), reading: avg('reading') },
    trend: scored.length > 1 ? { from: first.run.at, video: [first.s.video.rate, latest.s.video.rate], reading: [first.s.reading.rate, latest.s.reading.rate] } : null
  };
}

/** Add a finished run. */
export function addRun(state, run, now = Date.now()) {
  const base = state && state.app === 'lfz-self' ? state : emptySelf();
  const clean = cleanRun(run, now);
  if (!clean) throw Error('That run is incomplete.');
  return { ...base, runs: [...base.runs.filter(r => r.id !== clean.id), clean].slice(-50), updated: now };
}
export function deleteRun(state, id, now = Date.now()) {
  const base = state && state.app === 'lfz-self' ? state : emptySelf();
  return { ...base, runs: base.runs.filter(r => r.id !== id), deleted: { ...(base.deleted || {}), [id]: now }, updated: now };
}

/** Sync merge: union of runs by id; a delete on either side wins over the run. */
export function mergeSelf(local, remote, now = Date.now()) {
  const ok = s => s && s.app === 'lfz-self';
  const l = ok(local) ? local : emptySelf(), r = ok(remote) ? remote : emptySelf();
  const deleted = {};
  for (const src of [l.deleted, r.deleted]) for (const [id, at] of Object.entries(src || {})) if (ID.test(id) && num(at, 1, now + 300000)) deleted[id] = Math.max(deleted[id] || 0, at);
  const runs = new Map();
  for (const x of [...(l.runs || []), ...(r.runs || [])]) { const c = cleanRun(x, now); if (c && !deleted[c.id]) runs.set(c.id, c); }
  return { app: 'lfz-self', version: 1, runs: [...runs.values()].sort((a, b) => a.at - b.at).slice(-50), deleted, updated: Math.max(l.updated || 0, r.updated || 0) };
}

/** Recall lines typed in the 2-minute box: one point per non-empty line. */
export const recallLines = text => String(text || '').split(/\r?\n/).map(s => s.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 100);
