// "What now?": the pure part (no DOM). Given the time, your routine, the timer and your learning
// plan, it says which one thing to do, which page to open, and when to press Start. The page part
// is coach.mjs; tested in tools/coach.test.mjs.
import { DAY, KINDS, toMin, nowAndNext } from './clock-core.mjs';

// The one rule, shown everywhere the guide appears.
export const RULE = 'Press Start the moment the lesson, exercise or project step is open in front of you, not while you are still choosing. One round is one thing. When it rings, stop, write one line of where you are, then take the break.';

const dur = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
const nowMin = d => d.getHours() * 60 + d.getMinutes();

// Night: from sleep time until wake time (works when sleep is after midnight too).
export function isNight(settings, date) {
  const m = nowMin(date), w = toMin(settings.wake), s = toMin(settings.sleep);
  return s > w ? (m >= s || m < w) : (m >= s && m < w);
}
export function minsToSleep(settings, date) {
  const m = nowMin(date), s = toMin(settings.sleep);
  return ((s - m) % 1440 + 1440) % 1440;
}
export function atWork(settings, date) {
  const m = nowMin(date);
  return settings.workdays.includes(date.getDay()) && m >= toMin(settings.workStart) && m < toMin(settings.workEnd);
}

// A timer plan that fits the minutes left in a block: [work, rest, rounds].
export function fitPlan(kind, minsLeft) {
  const [w, r, n] = KINDS[kind].plan;
  if (minsLeft == null || minsLeft + 10 >= w * n + r * (n - 1)) return [w, r, n];   // running 10 min over a block is fine
  if (minsLeft < w) return [Math.max(5, Math.floor(minsLeft / 5) * 5 || 5), 0, 1];
  const rounds = Math.max(1, Math.min(n, Math.floor((minsLeft + r) / (w + r))));
  return [w, rounds > 1 ? r : 0, rounds];
}
export const planText = ([w, r, n]) => n > 1 ? `${n} rounds of ${w} min with ${r}-min breaks` : `one ${w}-minute round`;

// Which page the round is about. step = { due: {id,title} | null, next: {id,title,practice} | null };
// recent = the "continue" list kept by the header (newest first).
export function material(kind, step, recent = []) {
  const due = step?.due, next = step?.next;
  const cont = recent.find(r => /^p:#\/(ex\/|etl)/.test(r.to));
  const m = (to, short, label) => ({ to, short, label });
  if (kind === 'recall' || kind === 'review') {
    if (due) return m('s:#topic/' + due.id + '?review', 'recall: ' + due.title, `the recall review of ${due.title} (it is due)`);
    return kind === 'recall' ? m('p:#/recall', 'recall cards', 'your due recall cards') : m('p:#/quiz', 'quiz', 'a five-question quiz');
  }
  if (kind === 'use') {
    if (cont) return m(cont.to, cont.label, `where you stopped: ${cont.label}`);
    if (next?.practice?.length) return m('p:#/ex/' + next.practice[0], next.title + ' practice', `the first exercise of ${next.title}`);
    return m('p:#/etl?goal=whole', 'ETL project', 'the next step of the ETL project');
  }
  if (next) return m('s:#topic/' + next.id, next.title, `the topic ${next.title} (lesson first, then its exercises)`);
  return m('s:#library', 'Learn & listen', 'one lesson from Learn & listen');
}

// Rounds finished today and this week, from the timer's log [{kind, mins, at}].
export function tally(log = [], date = new Date()) {
  const day0 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), week0 = day0 - 6 * 864e5;
  const t = log.filter(x => x.at >= day0), w = log.filter(x => x.at >= week0);
  const sum = a => a.reduce((n, x) => n + (x.mins || 0), 0);
  return { today: t.length, todayMins: sum(t), week: w.length, weekMins: sum(w), recallToday: t.some(x => x.kind === 'recall') };
}

// The advice. ctx = { now, settings (normalised), week, timer, step, recent, log }.
// Returns { mode, tone, kicker, title, text, steps, start, open, quiet }.
//   start = { kind, plan, title, link } for the main button (starts the timer and opens the page)
//   open  = { to, label } a page to open without starting anything
export function advise(ctx) {
  const { now, settings, week, timer, step, recent = [], log = [] } = ctx;
  const t = tally(log, now), done = t.today ? ` Today so far: ${t.today} round${t.today > 1 ? 's' : ''}, ${t.todayMins} min.` : '';
  const nn = nowAndNext(week, now);
  const nextLine = nn.next ? `${nn.minsToNext >= 1440 || nn.next.day !== now.getDay() ? DAY[nn.next.day] + ' ' : ''}${nn.next.start}: ${KINDS[nn.next.kind].name}, ${nn.next.title}` : '';
  const make = (kind, plan, title) => { const m = material(kind, step, recent); return { kind, plan, title: title || m.short, link: m.to, label: m.label, short: m.short }; };

  if (timer) {
    const what = timer.practice ? 'The practice focus timer is running' : `${timer.phase === 'break' ? 'Break' : KINDS[timer.kind]?.name || 'Focus'} timer running${timer.rounds > 1 ? `, round ${timer.round} of ${timer.rounds}` : ''}`;
    return { mode: 'running', tone: timer.phase === 'break' ? 'rest' : KINDS[timer.kind]?.colour || 'learn', kicker: what, title: timer.phase === 'break' ? 'Away from the screen' : 'Stay on this one thing',
      text: timer.phase === 'break' ? 'Stand up and move until the break ends. The site rings when it is time to sit back down.' : `Keep working on ${timer.title || 'what you started'}. Do not switch pages to "check something". When it rings: write one line of where you stopped, then the break.`,
      steps: [], start: null, open: timer.link ? { to: timer.link, label: 'Back to ' + (timer.title || 'the page') } : null };
  }
  if (isNight(settings, now)) {
    return { mode: 'night', tone: 'rest', kicker: `Past your sleep time (${settings.sleep})`, title: 'Sleep now. Study tomorrow.',
      text: `Sleep is when today's recall is kept, so a late round costs more than it gives. ${nextLine ? 'Next: ' + nextLine + '.' : ''}${done}`, steps: [], start: null, open: null, quiet: true };
  }
  const cur = nn.current;
  if (cur) {
    const plan = fitPlan(cur.kind, nn.minsLeft), s = make(cur.kind, plan);
    return { mode: 'now', tone: KINDS[cur.kind].colour, kicker: `Now · ${cur.start}–${cur.end} · ${nn.minsLeft} min left`, title: cur.title, text: cur.what + done,
      steps: [`Open ${s.label}.`, `Press Start now: ${planText(plan)}.`, plan[2] > 1 ? 'When it rings, do the break it shows (move, eyes, water). It rings again to bring you back.' : 'When it rings, write one line: where do you pick up next time?'],
      start: s, open: null };
  }
  const left = minsToSleep(settings, now);
  if (left <= 60) {
    const s = t.recallToday ? null : make('recall', [10, 0, 1], null);
    return { mode: 'winddown', tone: 'recall', kicker: `${left} min to your sleep time`, title: t.recallToday ? 'Done for today' : 'One short recall, then screens off',
      text: t.recallToday ? `You did your recall today. Put the screens away.${done}` : 'No new material this late. Pull today\'s idea back out of memory for 10 minutes, then stop.' + done,
      steps: s ? [`Open ${s.label}.`, 'Press Start: one 10-minute round.', 'When it rings, stop and close the laptop.'] : [], start: s, open: null };
  }
  if (nn.next && nn.minsToNext <= 15) {
    const plan = KINDS[nn.next.kind].plan, s = make(nn.next.kind, plan);
    return { mode: 'soon', tone: KINDS[nn.next.kind].colour, kicker: `Next block in ${nn.minsToNext} min · ${nn.next.start}`, title: nn.next.title, text: nn.next.what + done,
      steps: ['Before it starts: water, phone in another room.', `Open ${s.label}.`, `Press Start at ${nn.next.start} (or now, if you are ready): ${planText(plan)}.`], start: s, open: null };
  }
  if (atWork(settings, now)) {
    return { mode: 'work', tone: '', kicker: 'Work hours', title: 'Work comes first now',
      text: `Your study blocks sit around work. ${nextLine ? 'Next: ' + nextLine + ' (in ' + dur(nn.minsToNext) + ').' : ''} If you have a real break, a 15-minute recall is the best use of it.${done}`,
      steps: [], start: make('recall', [15, 0, 1], null), open: null, quiet: true };
  }
  const room = nn.next ? nn.minsToNext : 999, kind = room >= 30 ? 'learn' : 'recall', plan = kind === 'learn' ? [25, 0, 1] : [15, 0, 1], s = make(kind, plan);
  return { mode: 'free', tone: KINDS[kind].colour, kicker: nn.next ? `No block right now · next in ${dur(nn.minsToNext)}` : 'No block right now',
    title: 'Free time: rest, or one round', text: `${nextLine ? 'Next block: ' + nextLine + '. ' : ''}Free time is fine to keep free. If you want to study now, do ${planText(plan)} and stop.${done}`,
    steps: [`Open ${s.label}.`, `Press Start: ${planText(plan)}.`], start: s, open: null };
}

// In-page nudges while the site is open ------------------------------------------------------

// Pages where you are working on something (not choosing): a lesson, topic, exercise, paper or ETL step.
export const WORK_PAGE = /^(s:(lesson|topic)\/|p:\/(ex|lesson|paper|review)\/|p:\/recall|p:\/quiz\/)/;
export const NUDGE_AFTER = 90;   // seconds on a working page with no timer before the "start the timer?" nudge

// A block that starts (or starts in 5 minutes) between two moments: for the "block starts now" ring.
export function blockAlarm(week, from, to) {
  if (!(to > from) || to - from > 15 * 60e3) return null;   // a long gap (laptop closed, tab asleep): no stale rings
  const days = [from, to].map(d => new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  let best = null;
  for (const b of week) for (const [lead, pre] of [[5, true], [0, false]]) for (const d0 of days) {
    if (d0.getDay() !== b.day) continue;
    const t = d0.getTime() + (toMin(b.start) - lead) * 60000;
    if (t > from.getTime() && t <= to.getTime() && (!best || t >= best.at)) best = { block: b, pre, at: t };
  }
  return best;
}
