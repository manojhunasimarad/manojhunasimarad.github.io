// node --test day/tests/   (no dependencies)
process.env.TZ = 'Asia/Kolkata';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../core.mjs';

const T = (s) => new Date(s).getTime();          // local time, e.g. '2026-11-28T01:13'

test('a day runs from 04:00 to 04:00', () => {
  assert.equal(C.dayOf(T('2026-11-28T01:13')), '2026-11-27');
  assert.equal(C.dayOf(T('2026-11-28T03:59')), '2026-11-27');
  assert.equal(C.dayOf(T('2026-11-28T04:00')), '2026-11-28');
  assert.equal(C.dayMinute(T('2026-11-28T01:13')), 1440 + 73);
  assert.equal(C.dayMinute(T('2026-11-28T22:30')), 1350);
  assert.equal(C.atMinute('2026-11-27', 1440 + 73), T('2026-11-28T01:13'));
  assert.equal(C.onDay('01:30'), 1530);
  assert.equal(C.onDay('22:30'), 1350);
});

test('ISO weeks match Kitchen From Zero', () => {
  assert.equal(C.isoWeek('2026-11-28'), '2026-W48');
  assert.equal(C.isoWeek('2026-01-01'), '2026-W01');
  assert.equal(C.isoWeek('2027-01-01'), '2026-W53');
  assert.deepEqual(C.weekDates('2026-11-28'), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
});

test('formatting', () => {
  assert.equal(C.fmtDur(425), '7 h 5 min');
  assert.equal(C.fmtDur(45), '45 min');
  assert.equal(C.fmtDur(425, true), '7h 05m');
  assert.equal(C.fmtLeft(754), '12:34');
  assert.equal(C.fmtLeft(3725), '1:02:05');
  assert.equal(C.rupees(102340), '₹1,02,340');
  assert.equal(C.rupees(-2500.5, 2), '−₹2,500.50');
  assert.equal(C.fromNow(130), 'in 2 h 10 min');
  assert.equal(C.relDay('2026-11-27', '2026-11-28'), 'Yesterday');
  assert.equal(C.fmtDate('2026-11-28'), 'Sat 28 Nov');
});

test('routine: defaults, validation and kinds of day', () => {
  const r = C.normRoutine({ wake: '6:15', sleep: 'bad', office: [1, 2, 9], workdays: [1, 2, 3], commute: 500 });
  assert.equal(r.wake, '6:15');
  assert.equal(r.sleep, '22:30');
  assert.deepEqual(r.office, [1, 2]);
  assert.equal(r.commute, 180);
  assert.equal(C.dayKind(C.DEFAULT_ROUTINE, '2026-11-30'), 'office');   // Monday
  assert.equal(C.dayKind(C.DEFAULT_ROUTINE, '2026-11-25'), 'home');     // Wednesday
  assert.equal(C.dayKind(C.DEFAULT_ROUTINE, '2026-11-28'), 'off');      // Saturday
  assert.equal(C.goalMins(C.DEFAULT_ROUTINE), 450);
  assert.equal(C.goalMins({ sleep: '23:30', wake: '07:00' }), 450);
});

test('the day’s schedule on an office Monday', () => {
  const items = C.buildDay({ date: '2026-11-30', settings: {},
    meals: [{ slot: 'b', name: 'Breakfast', time: '07:30', dishes: [{ title: 'Besan chilla' }] },
            { slot: 'd', name: 'Dinner', time: '20:30', dishes: [{ title: 'Soya bhurji rolls' }], eaten: true }],
    study: [{ start: '19:30', mins: 25, kind: 'learn', title: 'Learn: NumPy' }],
    prep: [{ key: 'adv:x', what: 'Soak 120 g rajma in about 400 ml water for 6–8 hours.', dish: 'Rajma', start: T('2026-11-30T21:15') },
           { key: 'adv:y', what: 'Tomorrow’s thing', start: T('2026-12-01T21:15') }] });
  assert.deepEqual(items.map(i => i.id), ['wake', 'meal-b', 'leave', 'work', 'home', 'study-0', 'meal-d', 'prep-adv:x', 'review', 'winddown', 'sleep']);
  const leave = items.find(i => i.id === 'leave');
  assert.equal(C.fromMin(leave.start), '08:20');
  assert.equal(items.find(i => i.id === 'prep-adv:x').title, 'Soak 120 g rajma');
  assert.equal(C.fromMin(items.find(i => i.id === 'review').start), '21:45');
  const nn = C.nowNext(items, C.toMin('10:00'));
  assert.equal(nn.current.id, 'work');
  assert.equal(nn.next.id, 'home');
});

test('fast days and a late bedtime', () => {
  const items = C.buildDay({ date: '2026-12-01', settings: { routine: { sleep: '00:15' } },
    meals: [{ slot: 'l', name: 'Lunch', time: '13:00', dishes: [{ title: 'Pulao' }] }] });
  assert.equal(items.find(i => i.id === 'meal-l').note, 'Fast day: skip or keep light');
  assert.equal(items[items.length - 1].id, 'sleep');
  assert.equal(items[items.length - 1].start, 1440 + 15);
});

test('records: put, patch, remove, merge keeps the newer copy', () => {
  const a = C.emptyState(), b = C.emptyState();
  C.put(a, { id: 'rev:2026-11-27', k: 'rev', mood: 3 }, 1000);
  C.put(b, { id: 'rev:2026-11-27', k: 'rev', mood: 5 }, 2000);
  C.put(a, { id: 'cook:1', k: 'cook', dish: 'Pulao' }, 1500);
  C.put(b, { id: 'cook:1', k: 'cook', dish: 'Pulao' }, 1200);
  C.remove(b, 'cook:1', 1600);
  const { state, took, kept } = C.mergeStates(a, b);
  assert.equal(C.get(state, 'rev:2026-11-27').mood, 5);
  assert.equal(C.get(state, 'cook:1'), null);
  assert.equal(took, 2);
  assert.equal(kept, 0);
  C.patch(state, 'rev:2026-11-27', { win: 'Cooked twice' }, 3000);
  assert.equal(C.get(state, 'rev:2026-11-27').mood, 5);
  assert.equal(C.get(state, 'rev:2026-11-27').win, 'Cooked twice');
  C.prune(state, 2000 + 200 * 864e5);
  assert.equal(state.rec['cook:1'], undefined);
  assert.equal(C.normState({ rec: { __proto__x: 1, bad: { id: 'other' } } }).rec.bad, undefined);
  assert.ok(C.stamp(5) < C.stamp(5));
});

test('sleep: bed, wake, stats', () => {
  const s = C.emptyState();
  C.goToBed(s, T('2026-11-27T23:05'));
  const n = C.wakeUp(s, T('2026-11-28T06:10'));
  assert.equal(n.id, 'sleep:2026-11-28');
  assert.equal(C.get(s, C.OPEN_SLEEP), null);
  const list = C.nights(s);
  assert.equal(list[0].mins, 425);
  C.put(s, { id: 'sleep:2026-11-27', k: 'sleep', d: '2026-11-27', bed: T('2026-11-26T22:20'), wake: T('2026-11-27T05:58') });
  C.put(s, { id: 'sleep:2026-11-26', k: 'sleep', d: '2026-11-26', bed: null, wake: T('2026-11-26T07:30') });
  const st = C.sleepStats(C.nights(s), C.DEFAULT_ROUTINE, '2026-11-28');
  assert.equal(st.nights, 3);
  assert.equal(st.timed, 2);
  assert.equal(st.bedOnTime, 1);          // 22:20 yes, 23:05 no
  assert.equal(st.wakeOnTime, 2);         // 05:58 and 06:10 yes, 07:30 no
  assert.equal(st.avgBed, '22:43');
  assert.equal(Math.round(st.avgMins), 442);
  assert.equal(C.bedOnTime(C.nights(s)[0], C.DEFAULT_ROUTINE), false);
  // waking without having tapped "Going to sleep"
  const w = C.wakeUp(C.emptyState(), T('2026-11-29T06:00'));
  assert.equal(w.bed, null);
});

test('habits: by hand, automatic, and overruled', () => {
  const s = C.emptyState(), habits = C.habitsOf({});
  let day = C.habitDay(s, '2026-11-28', habits, { study: '2 Learn rounds' });
  assert.equal(day.find(h => h.id === 'study').on, true);
  assert.equal(day.find(h => h.id === 'move').on, false);
  C.toggleHabit(s, '2026-11-28', 'move', true);
  C.toggleHabit(s, '2026-11-28', 'study', false);
  day = C.habitDay(s, '2026-11-28', habits, { study: '2 Learn rounds' });
  assert.equal(day.find(h => h.id === 'move').on, true);
  assert.equal(day.find(h => h.id === 'study').on, false);
  assert.equal(C.keepAutoTicks(s, '2026-11-28', habits, { study: 'x', cook: 'Lunch eaten' }), 1);
  day = C.habitDay(s, '2026-11-28', habits, {});
  assert.equal(day.find(h => h.id === 'cook').on, true);
  assert.equal(day.find(h => h.id === 'cook').reason, 'Lunch eaten');
});

test('reviews gather the facts of a week', () => {
  const s = C.emptyState();
  C.put(s, { id: 'cook:a', k: 'cook', at: T('2026-11-27T19:40'), dish: 'Chicken pulao', mins: 52, rating: 4 });
  C.put(s, { id: 'cook:b', k: 'cook', at: T('2026-11-24T19:40'), dish: 'chicken pulao', mins: 48, est: 40 });
  C.put(s, { id: 'act:a', k: 'act', at: T('2026-11-27T07:00'), type: 'Walk', mins: 30 });
  C.put(s, { id: 'rev:2026-11-27', k: 'rev', d: '2026-11-27', mood: 4, energy: 3 });
  const wk = C.weekFacts(s, C.weekDates('2026-11-27'), {}, d => (d === '2026-11-27' ? { study: { rounds: 3, mins: 75 }, trade: true } : {}));
  assert.equal(wk.cooked, 2);
  assert.equal(wk.cookMins, 100);
  assert.equal(wk.moveMins, 30);
  assert.equal(wk.studyRounds, 3);
  assert.equal(wk.tradeDays, 1);
  assert.equal(wk.mood, 4);
  const book = C.cookBook(s);
  assert.equal(book.length, 1);
  assert.equal(book[0].count, 2);
  assert.equal(book[0].avgMins, 50);
  assert.equal(book[0].est, 40);
});

test('timers count down, pause and resume; stopwatches count up', () => {
  const t = C.newTimer({ label: 'Rice', secs: 900, now: 0 });
  assert.equal(C.timerLeft(t, 60_000), 840);
  const p = C.pauseTimer(t, 60_000);
  assert.equal(C.timerLeft(p, 600_000), 840);
  const r = C.resumeTimer(p, 600_000);
  assert.equal(C.timerLeft(r, 660_000), 780);
  assert.equal(C.timerDone(r, 600_000 + 840_000), true);
  const w = C.newStopwatch({ dish: 'Pulao', now: 0 });
  assert.equal(C.timerLeft(w, 1e9), Infinity);
  assert.equal(C.elapsed(w, 90_000), 90);
});

test('reminders fire once, only while fresh', () => {
  const list = C.remindersFor({ date: '2026-11-27', settings: {}, prep: [{ key: 'adv:1', what: 'Soak chana', start: T('2026-11-27T21:00') }] });
  const keys = list.map(r => r.key);
  assert.ok(keys.includes('2026-11-27:bed') && keys.includes('2026-11-27:winddown') && keys.includes('prep:adv:1'));
  const due = C.dueNow(list, {}, T('2026-11-27T22:31'));
  assert.deepEqual(due.map(r => r.key), ['2026-11-27:bed']);
  assert.deepEqual(C.dueNow(list, { '2026-11-27:bed': 1 }, T('2026-11-27T22:31')), []);
  assert.deepEqual(C.dueNow(list, {}, T('2026-11-27T23:30')), []);
  const inBed = C.remindersFor({ date: '2026-11-28', settings: {}, openSleep: { bed: 1 } });
  assert.ok(!inBed.some(r => r.key.endsWith(':bed')));
  assert.equal(new Date(inBed.find(r => r.act === 'wake').at).getHours(), 6);
});

test('calendar file: repeating events with alarms, lines folded', () => {
  const ics = C.routineIcs({}, { now: new Date(T('2026-11-28T09:00')), url: 'https://manojhunasimarad.github.io/' });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /SUMMARY:Leave for the office\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,TH/);
  assert.match(ics, /DTSTART:20261130T082000/);           // next office day is Monday
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 5);
  assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
  const g = C.gcalUrl({ title: 'Soak rajma', start: T('2026-11-28T21:00'), mins: 10, tz: 'Asia/Kolkata' });
  assert.match(g, /dates=20261128T210000%2F20261128T211000/);
});

test('hash and escaping', () => {
  assert.equal(C.hash('abc'), C.hash('abc'));
  assert.notEqual(C.hash('abc'), C.hash('abd'));
  assert.equal(C.esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  assert.equal(C.shortPrep('Set about 300 g curd (300 ml milk + 1 tsp curd per 250 ml) for Raita. Takes 6–10 hours.'), 'Set about 300 g curd for Raita');
  assert.equal(C.shortPrep('Marinate 300 g chicken for 2–4 hours; covered in the fridge it can go up to 8 hours.'), 'Marinate 300 g chicken');
});
