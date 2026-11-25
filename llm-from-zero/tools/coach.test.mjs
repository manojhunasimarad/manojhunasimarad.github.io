import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalise, buildWeek, KINDS } from '../clock-core.mjs';
import { advise, fitPlan, material, tally, isNight, minsToSleep, blockAlarm, WORK_PAGE } from '../coach-core.mjs';

const s = normalise(DEFAULTS), week = buildWeek(s);
// Wednesday 25 Nov 2026 is a work-from-home day; Monday 23 Nov an office day.
const at = (d, hm) => { const [h, m] = hm.split(':').map(Number); return new Date(2026, 10, d, h, m); };
const step = { due: null, next: { id: 'de-sql', title: 'SQL', practice: ['sql-filter'] } };
const ask = (date, extra = {}) => advise({ now: date, settings: s, week, timer: null, step, recent: [], log: [], ...extra });

test('During a study block it says what to open and to press Start now, with a plan that fits the time left', () => {
  const a = ask(at(25, '06:35'));            // Wed 06:30–07:20 Learn
  assert.equal(a.mode, 'now');
  assert.equal(a.start.kind, 'learn');
  assert.equal(a.start.link, 's:#topic/de-sql');
  assert.deepEqual(a.start.plan, [25, 5, 2]);
  assert.match(a.steps.join(' '), /Press Start now/);
  const late = ask(at(25, '07:08'));          // 12 min left: one short round, no break
  assert.deepEqual(late.start.plan, [10, 0, 1]);
});

test('Recall due comes first in recall blocks; Use continues the last exercise', () => {
  const due = { ...step, due: { id: 'git', title: 'Git' } };
  assert.equal(material('recall', due).to, 's:#topic/git?review');
  assert.equal(material('recall', step).to, 'p:#/recall');
  assert.equal(material('use', step, [{ to: 'p:#/ex/sql-join', label: 'Join' }]).to, 'p:#/ex/sql-join');
  assert.equal(material('use', step).to, 'p:#/ex/sql-filter');
  assert.equal(material('learn', { due: null, next: null }).to, 's:#library');
});

test('Before a block, at work, in free time, close to sleep and at night it gives the right kind of advice', () => {
  assert.equal(ask(at(25, '06:20')).mode, 'soon');
  assert.match(ask(at(25, '06:20')).steps.join(' '), /Press Start at 06:30/);
  assert.equal(ask(at(25, '10:30')).mode, 'work');
  assert.equal(ask(at(25, '10:30')).quiet, true);
  assert.equal(ask(at(25, '07:40')).mode, 'free');
  const wind = ask(at(25, '21:59'));
  assert.equal(wind.mode, 'winddown');
  assert.equal(wind.start.kind, 'recall');
  const doneRecall = ask(at(25, '21:59'), { log: [{ kind: 'recall', mins: 15, at: at(25, '21:40').getTime() }] });
  assert.equal(doneRecall.start, null);
  assert.equal(ask(at(25, '23:10')).mode, 'night');
  assert.equal(ask(at(26, '05:30')).start, null);
  assert.equal(ask(at(25, '10:30'), { timer: { kind: 'learn', title: 'SQL', phase: 'work', round: 1, rounds: 2 } }).mode, 'running');
});

test('Time helpers: night, minutes to sleep, plans that fit', () => {
  assert.equal(isNight(s, at(25, '22:30')), true);
  assert.equal(isNight(s, at(25, '06:00')), false);
  assert.equal(minsToSleep(s, at(25, '21:59')), 31);
  const owl = normalise({ ...DEFAULTS, sleep: '00:30', wake: '07:00' });
  assert.equal(isNight(owl, at(25, '23:50')), false);
  assert.equal(isNight(owl, at(26, '01:00')), true);
  assert.deepEqual(fitPlan('learn', 200), KINDS.learn.plan);
  assert.deepEqual(fitPlan('learn', 40), [25, 0, 1]);
  assert.deepEqual(fitPlan('learn', 46), [25, 5, 2]);
  assert.deepEqual(fitPlan('use', 3), [5, 0, 1]);
});

test('Rounds are counted for today and the last 7 days', () => {
  const now = at(25, '20:00');
  const t = tally([{ kind: 'learn', mins: 25, at: at(25, '06:30').getTime() }, { kind: 'use', mins: 25, at: at(22, '10:00').getTime() }, { kind: 'use', mins: 25, at: at(10, '10:00').getTime() }], now);
  assert.deepEqual([t.today, t.todayMins, t.week, t.weekMins, t.recallToday], [1, 25, 2, 50, false]);
});

test('A block rings once when it starts (and 5 minutes before), never after a long gap', () => {
  const pre = blockAlarm(week, at(25, '06:24'), at(25, '06:25'));
  assert.equal(pre?.pre, true); assert.equal(pre.block.title, week.find(b => b.day === 3 && b.kind === 'learn').title);
  const go = blockAlarm(week, at(25, '06:29'), at(25, '06:30'));
  assert.equal(go?.pre, false);
  assert.equal(blockAlarm(week, at(25, '06:31'), at(25, '06:32')), null);
  assert.equal(blockAlarm(week, at(25, '05:00'), at(25, '07:00')), null);
});

test('Only pages where you are working get the "start the timer?" question', () => {
  for (const p of ['s:lesson/de-00', 's:topic/de-sql', 'p:/ex/sql-filter', 'p:/recall', 'p:/paper/ab12']) assert(WORK_PAGE.test(p), p);
  for (const p of ['s:today', 's:roadmap', 'p:/', 'p:/etl?goal=whole', 's:clock', 'p:/practice/python']) assert(!WORK_PAGE.test(p), p);
});
