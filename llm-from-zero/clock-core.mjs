// Study clock: the pure parts (no DOM). A weekly timetable built from your routine, the body
// techniques attached to each block, a calendar file with alarms, and a timer state machine that
// any page can tick. Tested in tools/clock.test.mjs.

export const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export const DEFAULTS = Object.freeze({
  wake: '06:00', sleep: '22:30', workStart: '09:00', workEnd: '18:30',
  office: [1, 2, 4], workdays: [1, 2, 3, 4, 5], commute: 40
});

// What each kind of block is for. The loop is learn (take in) → recall (pull it back out) → use (build with it).
export const KINDS = {
  learn:  { name: 'Learn',  plan: [25, 5, 2], colour: 'learn',  link: 's:#library',         why: 'New material while your head is fresh.' },
  listen: { name: 'Listen', plan: [30, 0, 1], colour: 'learn',  link: 's:#library',         why: 'Audio of the lesson you read this morning: a second, spaced pass.' },
  recall: { name: 'Recall', plan: [15, 0, 1], colour: 'recall', link: 'p:#/recall',         why: 'Pull it back out of memory. This is the step that makes it stick.' },
  use:    { name: 'Use',    plan: [25, 5, 3], colour: 'use',    link: 'p:#/practice/python', why: 'Build something with it: an exercise or one step of a project.' },
  review: { name: 'Test',   plan: [25, 5, 2], colour: 'recall', link: 'p:#/quiz',           why: 'Test yourself without notes, then fix what you missed.' }
};

// Body techniques. Kept to things with reasonable support: breaking up sitting, resting the eyes,
// slow breathing to settle, and retrieval done out loud or on paper (retrieval practice).
export const BODY = [
  { id: 'walk',    tag: 'move',   mins: 3, title: 'Walk and talk',      how: 'Walk around the room or the corridor and say out loud the one idea you just worked on, as if explaining it to a friend.' },
  { id: 'stretch', tag: 'move',   mins: 2, title: 'Stand and stretch',  how: 'Stand up. Roll the shoulders 10 times, turn the neck slowly left and right, reach up, then touch your toes or knees.' },
  { id: 'eyes',    tag: 'eyes',   mins: 1, title: '20-20-20 for the eyes', how: 'Look at something at least 6 metres (20 feet) away for 20 seconds. Blink slowly. Repeat three times.' },
  { id: 'water',   tag: 'move',   mins: 2, title: 'Water and stairs',   how: 'Walk to fill a glass of water; take the stairs once if there are any. Back to the desk before the timer ends.' },
  { id: 'squats',  tag: 'move',   mins: 2, title: 'Ten squats',         how: 'Ten slow squats or calf raises, then shake out the hands. Wakes you up without tiring you.' },
  { id: 'breathe', tag: 'breath', mins: 2, title: 'Box breathing',      how: 'Breathe in for 4, hold for 4, out for 4, hold for 4. Five rounds. Good before a test or when stuck.' }
];
export const RECALL = [
  { id: 'blurt',   title: 'Blurt on paper',    how: 'Close the lesson. Write everything you remember on paper for 3 minutes, then open it and mark what you missed in another colour.' },
  { id: 'teach',   title: 'Teach it back',     how: 'Explain the idea out loud in plain words, as if to a first-year student. Where you stumble is what to reread.' },
  { id: 'sketch',  title: 'Draw it from memory', how: 'Sketch the diagram, the data flow or the formula from memory. Then compare with the source.' },
  { id: 'three',   title: 'Three questions',   how: 'Write three questions a teacher would ask about this. Answer them tomorrow without looking.' }
];

export const toMin = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : NaN; };
export const fromMin = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

export function normalise(s) {
  const d = { ...DEFAULTS, ...(s || {}) };
  for (const k of ['wake', 'sleep', 'workStart', 'workEnd']) if (!Number.isFinite(toMin(d[k]))) d[k] = DEFAULTS[k];
  d.commute = Math.max(0, Math.min(180, Math.round(Number(d.commute) || 0)));
  const days = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
  d.workdays = days(d.workdays); d.office = days(d.office).filter(x => d.workdays.includes(x));
  return d;
}

function block(day, start, mins, kind, title, what, body, link) {
  return { day, start: fromMin(start), end: fromMin(start + mins), mins, kind, title, what, body, link: link || KINDS[kind].link };
}

// One week of blocks, built from the routine. Recall always sits shortly before sleep (sleep helps
// keep what was recalled) and the next morning's learning starts with a retest of it.
export function buildWeek(settings) {
  const s = normalise(settings);
  const wake = toMin(s.wake), sleep = toMin(s.sleep) <= wake ? toMin(s.sleep) + 1440 : toMin(s.sleep);
  const ws = toMin(s.workStart), we = toMin(s.workEnd);
  const recallAt = sleep - 50, latest = sleep - 60;
  const fit = (start, mins) => Math.max(0, Math.min(mins, latest - start));
  const out = [];
  for (let day = 0; day < 7; day++) {
    const work = s.workdays.includes(day), office = s.office.includes(day);
    if (work) {
      const learn = office ? 40 : 50;
      if (wake + 30 + learn <= ws - (office ? s.commute : 0)) out.push(block(day, wake + 30, learn, 'learn', 'Learn one lesson', 'Retest yesterday in 3 minutes (no notes), then read or listen to one new lesson and write three questions about it.', ['squats', 'breathe']));
      if (office && s.commute >= 15) out.push(block(day, ws - s.commute, s.commute, 'listen', 'Listen on the way', 'Play this morning\'s lesson as audio. At the end, say its main idea in one sentence.', ['walk']));
      if (!office) out.push(block(day, 13 * 60 + 15, 15, 'review', 'Five-question quiz', 'Five quiz questions on this week\'s topics during the lunch break.', ['eyes'], 's:#quiz'));
      const useStart = office ? we + s.commute + 30 : we + 15, useMins = fit(useStart, office ? 50 : 90);
      if (useMins >= 25) out.push(block(day, useStart, useMins, 'use', office ? 'Solve one exercise' : 'One project step', office ? 'One practice exercise from Today, without hints first.' : 'One step of the ETL project or your current project. Write where you stopped.', ['walk', 'eyes', 'stretch'], office ? 'p:#/' : 'p:#/etl?goal=whole'));
    } else if (day === 6) {
      out.push(block(day, wake + 60, 90, 'use', 'Deep project block', 'Three focus rounds on one project. Phone in another room.', ['walk', 'water', 'stretch'], 'p:#/etl?goal=whole'));
      out.push(block(day, 10 * 60, 45, 'learn', 'Learn one topic', 'One topic from the learning map, then its checkpoint.', ['squats'], 's:#roadmap'));
      out.push(block(day, 17 * 60, 45, 'review', 'Test yourself', 'A timed mock round or a topic test, with no notes.', ['breathe'], 'p:#/mock'));
    } else {
      out.push(block(day, wake + 120, 45, 'review', 'Weekly review and plan', 'Look at what you recalled least this week, pick next week\'s goal, and do a mixed quiz.', ['walk'], 's:#progress'));
    }
    const rm = day === 0 ? 10 : 15;
    if (recallAt > wake) out.push(block(day, recallAt, rm, 'recall', 'Recall before sleep', 'Due recall cards, then blurt today\'s idea on paper. Screens off after.', ['teach'], 'p:#/recall'));
  }
  return out.sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));
}

export const weekMinutes = week => week.reduce((n, b) => n + b.mins, 0);

// The block running now and the next one, for a Date.
export function nowAndNext(week, date) {
  const day = date.getDay(), m = date.getHours() * 60 + date.getMinutes();
  const today = week.filter(b => b.day === day);
  const current = today.find(b => toMin(b.start) <= m && m < toMin(b.start) + b.mins) || null;
  let next = today.find(b => toMin(b.start) > m), ahead = 0;
  for (let i = 1; !next && i <= 7; i++) { next = week.find(b => b.day === (day + i) % 7); ahead = i; }
  const minsToNext = next ? ahead * 1440 + toMin(next.start) - m : null;
  return { current, next: next || null, minsToNext, minsLeft: current ? toMin(current.start) + current.mins - m : null };
}

// Phone clock alarms: one line per time and title, with the days it repeats.
export function alarmList(week) {
  const groups = new Map();
  for (const b of week) { const k = b.start + '|' + b.title; if (!groups.has(k)) groups.set(k, { start: b.start, title: b.title, kind: b.kind, days: [] }); groups.get(k).days.push(b.day); }
  return [...groups.values()].sort((a, b) => toMin(a.start) - toMin(b.start) || a.days[0] - b.days[0])
    .map(g => ({ ...g, label: `${KINDS[g.kind].name}: ${g.title}`, dayText: g.days.length === 7 ? 'every day' : g.days.map(d => DAY[d]).join(' ') }));
}

const icsText = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {   // lines longer than 75 octets continue on the next line after a space
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const parts = []; let cur = '';
  for (const ch of line) { if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; } cur += ch; }
  parts.push(cur); return parts.join('\r\n ');
}

// A calendar file: each block repeats weekly, with an alert 5 minutes before and one at the start.
// Times are "floating": the calendar places them in the device's own time zone.
export function weekIcs(week, { now = new Date(), base = '', resolve = l => l } = {}) {
  const p = n => String(n).padStart(2, '0');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LLM From Zero//Study clock//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Study clock'];
  week.forEach((b, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() + ((b.day - d.getDay() + 7) % 7));
    const [h, m] = b.start.split(':').map(Number), s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m), e = new Date(s.getTime() + b.mins * 60000);
    const local = x => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`;
    const body = b.body.map(id => (BODY.find(x => x.id === id) || RECALL.find(x => x.id === id))).filter(Boolean);
    const url = base ? new URL(resolve(b.link), base).href : '';
    const summary = `${KINDS[b.kind].name}: ${b.title}`;
    const desc = [b.what, ...body.map(x => `${x.title}: ${x.how}`), url].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:lfz-clock-${b.day}-${b.start.replace(':', '')}-${i}@llm-from-zero`, 'DTSTAMP:' + stamp,
      'DTSTART:' + local(s), 'DTEND:' + local(e), 'RRULE:FREQ=WEEKLY;BYDAY=' + ICS_DAY[b.day],
      'SUMMARY:' + icsText(summary), 'DESCRIPTION:' + icsText(desc), ...(url ? ['URL:' + url] : []), 'CATEGORIES:' + KINDS[b.kind].name,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(summary + ' in 5 minutes'), 'TRIGGER:-PT5M', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(summary), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ---------------------------------------------------------------- timer state machine */
// state: {kind, title, link, phase: 'work'|'break', round, rounds, work, rest (seconds), start (ms)}
export function startTimer(kind, { title = '', link = '', now = Date.now(), plan } = {}) {
  const k = KINDS[kind] || KINDS.learn, [w, r, n] = plan || k.plan;
  return { kind: KINDS[kind] ? kind : 'learn', title: title || k.name, link: link || k.link, phase: 'work', round: 1, rounds: n, work: w * 60, rest: r * 60, start: now };
}
export function remaining(state, now = Date.now()) {
  if (!state) return 0;
  return Math.max(0, (state.phase === 'work' ? state.work : state.rest) - Math.floor((now - state.start) / 1000));
}
// Move the timer on. Returns the new state (null when finished) and what just happened, so the page
// can ring, notify and show the right prompt. Long gaps (a closed laptop) end the timer quietly.
export function advance(state, now = Date.now()) {
  if (!state || remaining(state, now) > 0) return { state, event: null };
  const over = Math.floor((now - state.start) / 1000) - (state.phase === 'work' ? state.work : state.rest);
  if (over > 3600) return { state: null, event: 'expired' };
  if (state.phase === 'work') {
    if (state.round >= state.rounds || !state.rest) return { state: null, event: 'done' };
    return { state: { ...state, phase: 'break', start: now }, event: 'work-done' };
  }
  return { state: { ...state, phase: 'work', round: state.round + 1, start: now }, event: 'break-done' };
}
// The body technique for a break: rotates through the list, a different one each round and day.
export function breakTip(round, date = new Date()) {
  const day = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  return BODY[(day * 2 + round) % BODY.length];
}
export function recallTip(round, date = new Date()) {
  const day = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  return RECALL[(day + round) % RECALL.length];
}
export const mmss = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
