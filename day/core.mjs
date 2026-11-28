// Dinachari: the pure parts (no DOM, no storage, no network). Tested in day/tests/core.test.mjs.
//
//   dates      a day runs from 04:00 to 04:00, so 01:00 still belongs to the evening before
//   routine    the same object LLM From Zero's study clock keeps under lfz-clock-settings
//   schedule   one list of the day's events: routine, study blocks, meals, prep, review, sleep
//   records    everything you log is one record {id, k, u, ...}; sync keeps the newer copy of each
//   sleep      a night is filed under the date you woke up
//   habits     ticked by hand, or automatically from what the other apps saw you do
//   reviews    the facts of a day or a week, gathered for the review sheets
//   calendar   an .ics file of the routine with alarms, and Google Calendar links

export const ROLLOVER = 4 * 60;            // minutes after midnight when the next day starts
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const LONG_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ dates and times */
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYmd(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export const minuteOfDay = t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
/** The date a moment belongs to: before 04:00 it is still the previous day. */
export function dayOf(t = Date.now()) {
  const d = new Date(t);
  if (d.getHours() * 60 + d.getMinutes() < ROLLOVER) d.setDate(d.getDate() - 1);
  return ymd(d);
}
/** Minutes since midnight of dayOf(t): 01:30 after midnight is 1530. */
export const dayMinute = t => { const m = minuteOfDay(t); return m < ROLLOVER ? m + 1440 : m; };
export const weekday = s => parseYmd(s).getDay();
export const isWeekend = s => [0, 6].includes(weekday(s));

export function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : NaN;
}
export const fromMin = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
export const clock = t => fromMin(minuteOfDay(t));
/** A clock time on a day's own timeline: times before 04:00 are that night, after midnight. */
export const onDay = hhmm => { const m = toMin(hhmm); return m < ROLLOVER ? m + 1440 : m; };
/** The moment of a day-minute (see dayMinute) on date s. */
export function atMinute(s, minute) { const d = parseYmd(s); return d.getTime() + minute * 60000 + dstShift(d, minute); }
function dstShift(d, minute) {            // India has no DST; elsewhere keep wall-clock times right
  const later = new Date(d.getTime() + minute * 60000);
  return (later.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
}

export function isoWeek(s) {
  const d = parseYmd(s), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + pad(Math.ceil(((t - y0) / 864e5 + 1) / 7));
}
/** Monday..Sunday of the ISO week that contains s. */
export function weekDates(s) {
  const monday = addDays(s, -((weekday(s) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export const lastDays = (s, n) => Array.from({ length: n }, (_, i) => addDays(s, i - n + 1));

export function fmtDate(s, { long = false } = {}) {
  const d = parseYmd(s);
  return `${long ? LONG_DAY[d.getDay()] : DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function relDay(s, today) {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  if (s === addDays(today, 1)) return 'Tomorrow';
  return fmtDate(s);
}
export function fmtDur(mins, short = false) {
  if (!Number.isFinite(mins)) return '–';
  mins = Math.max(0, Math.round(mins));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (short) return h ? `${h}h${m ? ' ' + pad(m) + 'm' : ''}` : `${m}m`;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function fmtLeft(secs) {
  secs = Math.max(0, Math.ceil(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
/** "in 25 min", "in 2 h 10 min", "5 min ago" */
export function fromNow(mins) {
  if (!Number.isFinite(mins)) return '';
  if (Math.abs(mins) < 1) return 'now';
  return mins > 0 ? 'in ' + fmtDur(mins) : fmtDur(-mins) + ' ago';
}
export const rupees = (n, digits = 0) => (n < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(n));

/* ------------------------------------------------------------------ routine */
// Same fields and meaning as LLM From Zero's study clock (clock-core.mjs), so one routine serves both.
export const DEFAULT_ROUTINE = Object.freeze({
  wake: '06:00', sleep: '22:30', workStart: '09:00', workEnd: '18:30',
  office: [1, 2, 4], workdays: [1, 2, 3, 4, 5], commute: 40
});
export function normRoutine(r) {
  const d = { ...DEFAULT_ROUTINE, ...(r && typeof r === 'object' ? r : {}) };
  for (const k of ['wake', 'sleep', 'workStart', 'workEnd']) if (!Number.isFinite(toMin(d[k]))) d[k] = DEFAULT_ROUTINE[k];
  d.commute = Math.max(0, Math.min(180, Math.round(Number(d.commute) || 0)));
  const days = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
  d.workdays = days(d.workdays); d.office = days(d.office).filter(x => d.workdays.includes(x));
  return { wake: d.wake, sleep: d.sleep, workStart: d.workStart, workEnd: d.workEnd, office: d.office, workdays: d.workdays, commute: d.commute };
}
/** 'office', 'home' (work from home) or 'off'. */
export function dayKind(routine, s) {
  const r = normRoutine(routine), wd = weekday(s);
  if (!r.workdays.includes(wd)) return 'off';
  return r.office.includes(wd) ? 'office' : 'home';
}
/** Minutes of sleep the routine allows (22:30 → 06:00 is 450). */
export function goalMins(routine) {
  const r = normRoutine(routine);
  return ((toMin(r.wake) - toMin(r.sleep)) % 1440 + 1440) % 1440 || 480;
}
export const bedMinute = routine => { const r = normRoutine(routine); const s = toMin(r.sleep); return s <= toMin(r.wake) ? s + 1440 : s; };

export const DEFAULT_SETTINGS = Object.freeze({
  routine: DEFAULT_ROUTINE,
  fastDays: [2],                      // daytime fast, eat at night
  windDown: 30,                       // minutes before lights out
  reviewAt: '',                       // empty: 45 minutes before lights out
  tradeAt: '',                        // a fixed time for trading practice, or none
  tradeMins: 20,
  remind: { bedtime: true, review: true, prep: true, morning: true },
  keepAwake: true,                    // keep the screen on while a cooking timer runs
  openApps: 'auto',                   // 'same' window, 'new' window, or auto (new on a laptop)
  habits: null                        // null: the default list
});
export function normSettings(s) {
  const d = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
  d.routine = normRoutine(d.routine);
  d.fastDays = [...new Set((Array.isArray(d.fastDays) ? d.fastDays : []).map(Number).filter(x => x >= 0 && x <= 6))];
  d.windDown = Math.max(0, Math.min(120, Math.round(+d.windDown || 0)));
  d.tradeMins = Math.max(5, Math.min(120, Math.round(+d.tradeMins || 20)));
  d.remind = { ...DEFAULT_SETTINGS.remind, ...(d.remind || {}) };
  if (!Number.isFinite(toMin(d.reviewAt))) d.reviewAt = '';
  if (!Number.isFinite(toMin(d.tradeAt))) d.tradeAt = '';
  if (!['auto', 'same', 'new'].includes(d.openApps)) d.openApps = 'auto';
  d.habits = Array.isArray(d.habits) && d.habits.length ? d.habits.filter(h => h && h.id && h.name).map(h => ({ id: String(h.id), name: String(h.name).slice(0, 60), ...(h.auto ? { auto: h.auto } : {}) })) : null;
  return d;
}
export const reviewMinute = st => { const s = normSettings(st); return Number.isFinite(toMin(s.reviewAt)) ? onDay(s.reviewAt) : bedMinute(s.routine) - 45; };

/* ------------------------------------------------------------------ the day's schedule */
// kind: sleep | work | cook | prep | study | trade | review | move.  start/end are day-minutes.
export const KIND_NAME = { sleep: 'Sleep', work: 'Work', cook: 'Meal', prep: 'Prep', study: 'Study', trade: 'Trade', review: 'Review', move: 'Move' };

export function buildDay({ date, settings, study = [], meals = [], prep = [], now = null }) {
  const st = normSettings(settings), r = st.routine, kind = dayKind(r, date), items = [];
  const add = it => items.push({ end: null, sub: '', link: '', done: false, ...it });
  add({ id: 'wake', start: onDay(r.wake), kind: 'sleep', title: 'Wake up' });
  if (kind !== 'off') {
    const ws = onDay(r.workStart), we = Math.max(ws + 15, onDay(r.workEnd));
    if (kind === 'office') {
      if (r.commute) add({ id: 'leave', start: ws - r.commute, kind: 'work', title: 'Leave for the office', sub: `${r.commute} min to get there` });
      add({ id: 'work', start: ws, end: we, kind: 'work', title: 'Work at the office' });
      if (r.commute) add({ id: 'home', start: we + r.commute, kind: 'work', title: 'Home again' });
    } else add({ id: 'work', start: ws, end: we, kind: 'work', title: 'Work from home' });
  }
  const fasting = st.fastDays.includes(weekday(date));
  for (const m of meals) {
    if (!m || !Number.isFinite(toMin(m.time))) continue;
    const dishes = (m.dishes || []).map(d => d.title).filter(Boolean);
    if (!dishes.length && !m.people) continue;
    add({ id: 'meal-' + m.slot, start: onDay(m.time), kind: 'cook', title: m.name || 'Meal', sub: dishes.join(', ') || 'Nothing planned',
      done: !!m.eaten, link: 'kitchen:today', note: fasting && m.slot !== 'd' ? 'Fast day: skip or keep light' : '' });
  }
  study.forEach((b, i) => {
    const s = onDay(b.start);
    if (!Number.isFinite(s)) return;
    add({ id: 'study-' + i, start: s, end: s + (b.mins || 25), kind: 'study', title: b.title || 'Study', sub: b.what || '', link: b.link || 'llm:today', studyKind: b.kind });
  });
  const dayStart = atMinute(date, ROLLOVER), dayEnd = atMinute(date, ROLLOVER + 1440);
  for (const t of prep) {
    const when = t.start || t.by;
    if (!when || when < dayStart || when >= dayEnd) continue;
    add({ id: 'prep-' + t.key, start: dayMinute(when), kind: 'prep', title: shortPrep(t.what), sub: t.dish ? 'For ' + t.dish : '', done: !!t.done, link: 'kitchen:today', key: t.key, by: t.by });
  }
  if (st.tradeAt) add({ id: 'trade', start: onDay(st.tradeAt), end: onDay(st.tradeAt) + st.tradeMins, kind: 'trade', title: 'Trading practice', sub: 'Dalal Dojo, on paper', link: 'dojo:desk' });
  const bed = bedMinute(r);
  add({ id: 'review', start: reviewMinute(st), kind: 'review', title: 'Review the day', sub: 'Two minutes: what went well, what to fix, tomorrow’s three' });
  if (st.windDown) add({ id: 'winddown', start: bed - st.windDown, kind: 'sleep', title: 'Wind down', sub: 'Dim the lights, put the laptop away' });
  add({ id: 'sleep', start: bed, kind: 'sleep', title: 'Lights out' });
  items.sort((a, b) => a.start - b.start || order(a) - order(b));
  if (now != null) for (const it of items) it.past = (it.end ?? it.start) < now;
  return items;
}
const order = it => ({ wake: 0, leave: 1, work: 2 })[it.id] ?? 5;
/** "Soak 120 g rajma in about 400 ml water for 6–8 hours." → "Soak 120 g rajma" */
export function shortPrep(what) {
  const s = String(what || '').split(/\.\s/)[0].replace(/\.$/, '').replace(/\s*\([^)]*\)/g, '');
  const cut = s.search(/ (in about|in plenty|for \d|, then)/);
  return (cut > 8 ? s.slice(0, cut) : s).slice(0, 80);
}

/** What is happening at day-minute m, and what comes next. */
export function nowNext(items, m) {
  const current = items.filter(it => it.end != null && it.start <= m && m < it.end);
  const upcoming = items.filter(it => it.start > m && !(it.done && it.kind === 'prep'));
  return { current: current[current.length - 1] || null, next: upcoming[0] || null, upcoming };
}

/* ------------------------------------------------------------------ records */
// Every logged thing is a record {id, k, u, ...}. k is the kind, u the time it last changed (ms).
// A deleted record stays as {id, k, u, x: 1} for a while so the deletion reaches other devices.
export function emptyState() { return { v: 1, rec: {} }; }
export function normState(s) {
  const out = emptyState();
  if (s && typeof s === 'object' && s.rec && typeof s.rec === 'object')
    for (const [id, r] of Object.entries(s.rec)) if (validRecord(id, r)) out.rec[id] = r;
  return out;
}
const BAD_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const validRecord = (id, r) => !BAD_IDS.has(id) && r && typeof r === 'object' && !Array.isArray(r) && r.id === id && typeof r.k === 'string' && Number.isFinite(r.u);
export const kindOf = id => String(id).split(':')[0];
let lastStamp = 0;
/** Strictly increasing change times, so two edits in one millisecond still order. */
export function stamp(now = Date.now()) { lastStamp = Math.max(now, lastStamp + 1); return lastStamp; }
export function newId(k) { return k + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function put(state, rec, now = stamp()) {
  const id = rec.id || newId(rec.k);
  const r = { ...rec, id, k: rec.k || kindOf(id), u: now };
  delete r.x;
  state.rec[id] = r;
  return r;
}
export function patch(state, id, fields, now = stamp()) {
  const old = get(state, id) || { id, k: kindOf(id) };
  return put(state, { ...old, ...fields, id }, now);
}
export function remove(state, id, now = stamp()) {
  const r = state.rec[id];
  if (r && !r.x) state.rec[id] = { id, k: r.k, u: now, x: 1 };
}
export const get = (state, id) => { const r = state.rec[id]; return r && !r.x ? r : null; };
export const all = (state, k) => Object.values(state.rec).filter(r => !r.x && (!k || r.k === k));

/** Keep the newer copy of every record. Returns the merged state and how many came from each side. */
export function mergeStates(local, remote) {
  const a = normState(local), b = normState(remote), rec = { ...a.rec };
  let took = 0, kept = 0;
  for (const [id, r] of Object.entries(b.rec)) {
    if (!rec[id] || r.u > rec[id].u) { rec[id] = r; took++; }
  }
  for (const [id, r] of Object.entries(a.rec)) if (!b.rec[id] || r.u > b.rec[id].u) kept++;
  return { state: { v: 1, rec }, took, kept };
}
/** Forget deletions older than `days` (every device has had time to see them). */
export function prune(state, now = Date.now(), days = 120) {
  const cut = now - days * 864e5;
  for (const [id, r] of Object.entries(state.rec)) if (r.x && r.u < cut) delete state.rec[id];
  return state;
}
export const settingsOf = state => normSettings(get(state, 'settings'));

/* ------------------------------------------------------------------ sleep */
export const OPEN_SLEEP = 'sleep:open';
/** Tap "Going to sleep". */
export function goToBed(state, t = Date.now()) { return put(state, { id: OPEN_SLEEP, k: 'sleep', bed: t }); }
/** Tap "I'm awake": closes the open night (or records a wake-only night) under the date you woke. */
export function wakeUp(state, t = Date.now()) {
  const open = get(state, OPEN_SLEEP), date = ymd(new Date(t));
  let bed = open && open.bed < t && t - open.bed < 20 * 36e5 ? open.bed : null;
  const old = get(state, 'sleep:' + date);
  if (!bed && old && old.bed) bed = old.bed;
  if (open) remove(state, OPEN_SLEEP);
  return put(state, { ...(old || {}), id: 'sleep:' + date, k: 'sleep', d: date, bed, wake: t });
}
export function nights(state) {
  return all(state, 'sleep').filter(r => r.id !== OPEN_SLEEP && r.d && r.wake)
    .map(r => ({ id: r.id, date: r.d, bed: r.bed || null, wake: r.wake, q: r.q || null, note: r.note || '',
      mins: r.bed && r.wake > r.bed ? Math.round((r.wake - r.bed) / 60000) : null }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
/** Minutes after noon, so 23:30 and 00:30 sit next to each other (690 and 750). */
export const eveningMinute = t => { const m = minuteOfDay(t); return m < 720 ? m + 720 : m - 720; };
export function sleepStats(list, routine, today, days = 7) {
  const from = addDays(today, -days + 1);
  const win = list.filter(n => n.date >= from && n.date <= addDays(today, 1));
  const timed = win.filter(n => n.mins != null);
  const goal = goalMins(routine), r = normRoutine(routine);
  const bedTarget = (toMin(r.sleep) + 720) % 1440, wakeTarget = toMin(r.wake);
  const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const beds = timed.map(n => eveningMinute(n.bed));
  const meanBed = avg(beds), spread = beds.length > 1 ? Math.sqrt(avg(beds.map(b => (b - meanBed) ** 2))) : null;
  return {
    nights: win.length, timed: timed.length, goal,
    avgMins: avg(timed.map(n => n.mins)),
    avgBed: meanBed == null ? null : fromMin(meanBed + 720),
    avgWake: win.length ? fromMin(avg(win.map(n => minuteOfDay(n.wake)))) : null,
    bedOnTime: timed.length ? timed.filter(n => eveningMinute(n.bed) <= bedTarget + 15).length : 0,
    wakeOnTime: win.filter(n => minuteOfDay(n.wake) <= wakeTarget + 15).length,
    spread: spread == null ? null : Math.round(spread),
    debt: timed.reduce((d, n) => d + Math.max(0, goal - n.mins), 0)
  };
}
/** Last night: in bed on time? null when it can't be told. */
export function bedOnTime(night, routine) {
  if (!night || !night.bed) return null;
  const r = normRoutine(routine);
  return eveningMinute(night.bed) <= (toMin(r.sleep) + 720) % 1440 + 15;
}

/* ------------------------------------------------------------------ habits */
export const DEFAULT_HABITS = Object.freeze([
  { id: 'move', name: 'Move for 30 minutes', auto: 'move' },
  { id: 'read', name: 'Read a book, not for study', auto: 'read' },
  { id: 'people', name: 'Call or meet family or a friend' },
  { id: 'study', name: 'Study session', auto: 'study' },
  { id: 'cook', name: 'Cooked at home', auto: 'cook' },
  { id: 'trade', name: 'Trading practice', auto: 'trade' },
  { id: 'bed', name: 'In bed on time', auto: 'bed' }
]);
export const habitsOf = settings => normSettings(settings).habits || DEFAULT_HABITS.map(h => ({ ...h }));
export const habitId = (date, h) => `hab:${date}:${h}`;
/** Each habit with whether it is done: by hand (a record) or automatically (auto[h.auto] gives the reason). */
export function habitDay(state, date, habits, auto = {}) {
  return habits.map(h => {
    const r = get(state, habitId(date, h.id));
    const reason = h.auto ? auto[h.auto] || '' : '';
    const manual = !!(r && r.on && !r.auto);
    const off = !!(r && r.on === false);       // un-ticked by hand: an automatic tick is overruled
    return { ...h, on: !off && (manual || !!reason || !!(r && r.on && r.auto)), manual, reason: off ? '' : reason || (r && r.auto && r.on ? r.why || 'Done' : ''), off };
  });
}
/** Save automatic ticks as records, so the history survives after the other app forgets the day. */
export function keepAutoTicks(state, date, habits, auto) {
  let n = 0;
  for (const h of habits) {
    if (!h.auto || !auto[h.auto]) continue;
    const id = habitId(date, h.id), r = get(state, id);
    if (r) continue;
    put(state, { id, k: 'hab', d: date, h: h.id, on: true, auto: true, why: auto[h.auto] }); n++;
  }
  return n;
}
export function toggleHabit(state, date, h, on) {
  return put(state, { id: habitId(date, h), k: 'hab', d: date, h, on });
}

/* ------------------------------------------------------------------ reviews */
export const ratingWords = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
/** The facts of one day, gathered from the records and from what the other apps saw (extra). */
export function dayFacts(state, date, settings, extra = {}) {
  const night = nights(state).find(n => n.date === date) || null;
  const habits = habitDay(state, date, habitsOf(settings), extra.auto || {});
  const inDay = r => r.at && dayOf(r.at) === date;
  const cooks = all(state, 'cook').filter(inDay), acts = all(state, 'act').filter(inDay);
  const top = get(state, 'top3:' + date);
  return {
    date, night, sleepMins: night ? night.mins : null,
    habits, habitsDone: habits.filter(h => h.on).length, habitsTotal: habits.length,
    cooks, cookMins: cooks.reduce((a, c) => a + (c.mins || 0), 0),
    acts, moveMins: acts.reduce((a, c) => a + (c.mins || 0), 0),
    top3: top ? top.items || [] : [],
    review: get(state, 'rev:' + date),
    study: extra.study || null, meals: extra.meals ?? null, trade: extra.trade ?? null
  };
}
export function weekFacts(state, dates, settings, extraFor = () => ({})) {
  const days = dates.map(d => dayFacts(state, d, settings, extraFor(d)));
  const sum = f => days.reduce((a, d) => a + (f(d) || 0), 0);
  const slept = days.filter(d => d.sleepMins != null);
  return {
    days,
    sleepAvg: slept.length ? sum(d => d.sleepMins) / slept.length : null,
    habitsPct: sum(d => d.habitsTotal) ? Math.round(100 * sum(d => d.habitsDone) / sum(d => d.habitsTotal)) : 0,
    studyRounds: sum(d => d.study && d.study.rounds), studyMins: sum(d => d.study && d.study.mins),
    cooked: sum(d => d.cooks.length), cookMins: sum(d => d.cookMins),
    moveMins: sum(d => d.moveMins), tradeDays: days.filter(d => d.trade).length,
    reviews: days.filter(d => d.review).length,
    mood: avgOf(days.map(d => d.review && d.review.mood)), energy: avgOf(days.map(d => d.review && d.review.energy))
  };
}
const avgOf = xs => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/* ------------------------------------------------------------------ cooking times */
/** Your measured times per dish: how long it really takes you, against the recipe's estimate. */
export function cookBook(state) {
  const by = new Map();
  for (const c of all(state, 'cook')) {
    const key = String(c.dish || '').trim().toLowerCase();
    if (!key) continue;
    const e = by.get(key) || { dish: c.dish.trim(), times: [], ratings: [], est: null, last: 0, notes: [], again: null };
    if (c.mins) e.times.push(c.mins);
    if (c.rating) e.ratings.push(c.rating);
    if (c.est) e.est = c.est;
    if (c.at > e.last) { e.last = c.at; e.again = c.again ?? e.again; if (c.note) e.notes.unshift(c.note); }
    by.set(key, e);
  }
  return [...by.values()].map(e => ({ ...e, count: Math.max(e.times.length, e.ratings.length, 1),
    avgMins: avgOf(e.times), avgRating: avgOf(e.ratings) })).sort((a, b) => b.last - a.last);
}

/* ------------------------------------------------------------------ timers */
export const PRESETS = Object.freeze([
  { label: 'Pressure cooker', mins: 12, kind: 'cook' },
  { label: 'Rice', mins: 15, kind: 'cook' },
  { label: 'Tea', mins: 5, kind: 'cook' },
  { label: 'Focus round', mins: 25, kind: 'study' },
  { label: 'Break', mins: 5, kind: 'study' },
  { label: 'Soak', mins: 6 * 60, kind: 'prep' }
]);
export function newTimer({ label = 'Timer', secs = 300, kind = 'cook', dish = '', est = null, now = Date.now() } = {}) {
  return { id: 't' + now.toString(36) + Math.random().toString(36).slice(2, 5), label: String(label).slice(0, 60), kind, secs: Math.max(1, Math.round(secs)), start: now, paused: null, dish, est };
}
/** A stopwatch: counts up, to measure how long a dish really takes you. */
export function newStopwatch({ dish = '', est = null, now = Date.now() } = {}) {
  return { ...newTimer({ label: dish || 'Cooking', secs: 1, kind: 'cook', dish, est, now }), up: true };
}
export function elapsed(t, now = Date.now()) { return Math.max(0, ((t.paused ?? now) - t.start) / 1000); }
export const timerLeft = (t, now = Date.now()) => t.up ? Infinity : Math.max(0, t.secs - elapsed(t, now));
export const timerDone = (t, now = Date.now()) => !t.up && timerLeft(t, now) <= 0;
export function pauseTimer(t, now = Date.now()) { return t.paused ? t : { ...t, paused: now }; }
export function resumeTimer(t, now = Date.now()) { return t.paused ? { ...t, start: t.start + (now - t.paused), paused: null } : t; }
export const timerEnd = t => t.up || t.paused ? null : t.start + t.secs * 1000;

/* ------------------------------------------------------------------ reminders */
// The moments worth a notification today. Fired once each (the page remembers the keys it fired).
export function remindersFor({ date, settings, items = [], prep = [], night = null, openSleep = null, reviewed = false }) {
  const st = normSettings(settings), out = [];
  const at = m => atMinute(date, m);
  if (st.remind.bedtime && !openSleep) {
    if (st.windDown) out.push({ key: `${date}:winddown`, at: at(bedMinute(st.routine) - st.windDown), title: 'Wind down', body: `Lights out at ${st.routine.sleep}. Put the laptop away.`, act: 'sleep' });
    out.push({ key: `${date}:bed`, at: at(bedMinute(st.routine)), title: 'Time for bed', body: 'Tap “Going to sleep” so the night is logged.', act: 'sleep' });
  }
  if (st.remind.review && !reviewed) out.push({ key: `${date}:review`, at: at(reviewMinute(st)), title: 'Review the day', body: 'Two minutes: one win, one fix, tomorrow’s three.', act: 'review' });
  if (st.remind.morning && openSleep) out.push({ key: `${date}:wake`, at: at(onDay(st.routine.wake)) + 20 * 60000, title: 'Good morning', body: 'Tap “I’m awake” to log your sleep.', act: 'wake' });
  if (st.remind.prep) for (const t of prep) {
    if (t.done || !t.start) continue;
    out.push({ key: `prep:${t.key}`, at: t.start, title: 'Kitchen prep', body: t.what, short: shortPrep(t.what), act: 'cook' });
  }
  for (const it of items) if (it.kind === 'trade') out.push({ key: `${date}:trade`, at: at(it.start), title: 'Trading practice', body: 'Twenty minutes in Dalal Dojo, on paper.', act: 'trade' });
  return out;
}
export function dueNow(list, fired, now = Date.now(), grace = 15 * 60000) {
  return list.filter(r => r.at <= now && now - r.at < grace && !fired[r.key]);
}

/* ------------------------------------------------------------------ calendar */
const icsText = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const parts = []; let cur = '';
  for (const ch of line) { if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; } cur += ch; }
  parts.push(cur); return parts.join('\r\n ');
}
const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const localStamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
/** Repeating events for the routine, each with an alarm. Times float in the device's own time zone. */
export function routineEvents(settings) {
  const st = normSettings(settings), r = st.routine, ev = [];
  ev.push({ uid: 'wake', time: r.wake, mins: 5, title: 'Wake up', days: null, note: 'Open Dinachari and tap “I’m awake”.' });
  if (r.office.length && r.commute) ev.push({ uid: 'leave', time: fromMin(toMin(r.workStart) - r.commute), mins: 5, title: 'Leave for the office', days: r.office });
  if (st.windDown) ev.push({ uid: 'winddown', time: fromMin(bedMinute(r) - st.windDown), mins: st.windDown, title: 'Wind down', days: null });
  ev.push({ uid: 'review', time: fromMin(reviewMinute(st)), mins: 5, title: 'Review the day', days: null, note: 'Two minutes in Dinachari: one win, one fix, tomorrow’s three.' });
  ev.push({ uid: 'bed', time: r.sleep, mins: 5, title: 'Lights out', days: null, note: 'Tap “Going to sleep” in Dinachari.' });
  if (st.tradeAt) ev.push({ uid: 'trade', time: st.tradeAt, mins: st.tradeMins, title: 'Trading practice (Dalal Dojo)', days: null });
  return ev;
}
export function routineIcs(settings, { now = new Date(), url = '' } = {}) {
  const stampUtc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dinachari//Routine//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Dinachari routine'];
  for (const e of routineEvents(settings)) {
    const [h, m] = e.time.split(':').map(Number);
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    if (e.days) { while (!e.days.includes(s.getDay())) s.setDate(s.getDate() + 1); }
    const end = new Date(s.getTime() + e.mins * 60000);
    const rule = e.days ? 'RRULE:FREQ=WEEKLY;BYDAY=' + e.days.map(d => ICS_DAY[d]).join(',') : 'RRULE:FREQ=DAILY';
    lines.push('BEGIN:VEVENT', `UID:dinachari-${e.uid}@manojhunasimarad.github.io`, 'DTSTAMP:' + stampUtc,
      'DTSTART:' + localStamp(s), 'DTEND:' + localStamp(end), rule, 'SUMMARY:' + icsText(e.title),
      ...(e.note || url ? ['DESCRIPTION:' + icsText([e.note, url].filter(Boolean).join('\n'))] : []), ...(url ? ['URL:' + url] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(e.title), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
/** A Google Calendar "new event" link, filled in. Works on the phone and the laptop. */
export function gcalUrl({ title, start, mins = 10, details = '', tz = '' }) {
  const s = new Date(start), e = new Date(start + mins * 60000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: localStamp(s) + '/' + localStamp(e), details });
  if (tz) q.set('ctz', tz);
  return 'https://calendar.google.com/calendar/render?' + q;
}

/* ------------------------------------------------------------------ small things */
/** A 53-bit string hash (cyrb53): enough to tell whether a saved copy changed. */
export function hash(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
