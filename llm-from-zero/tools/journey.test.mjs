// The progress bar, the ETL guide's tick boxes and today's checklist (journey-core.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  emptyGuide, setTick, isTicked, mergeGuide, guideItems, guideProgress, ticksOn, noteSolved, mergeSolved,
  goalProgress, todaySteps, todayState, pageKind, dayKey, tourPending, TOUR_VERSION, lockedBy
} from '../journey-core.mjs';

const root = new URL('../', import.meta.url);
const json = async f => JSON.parse(await fs.readFile(new URL(f, root), 'utf8'));

test('the ETL guide: every section has an id, every tick box a unique stable id, steps 1 to 11 are there', async () => {
  const g = await json('content/etl-guide.json');
  const ids = guideItems(g).map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate tick id');
  assert(ids.every(id => /^[a-z0-9][a-z0-9:_-]{0,95}$/.test(id)), 'tick ids must be safe keys');
  assert(ids.length >= 80, String(ids.length));
  const steps = g.sections.filter(s => s.kind === 'step').map(s => s.n);
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const graph = await json('content/learning-graph.json'), known = new Set(graph.nodes.map(n => n.id));
  for (const s of g.sections) {
    assert(s.id && s.title && Array.isArray(s.blocks), s.id);
    for (const t of s.topics || []) assert(known.has(t), `${s.id}: unknown topic ${t}`);
    if (s.kind === 'step') {
      assert(s.blocks.some(b => b.t === 'code'), `${s.id} has commands`);
      assert(s.blocks.some(b => b.t === 'qa' && b.items.every(x => x.q && x.a.length > 40)), `${s.id} has check-yourself answers`);
      assert(s.blocks.some(b => b.t === 'check'), `${s.id} has done-when boxes`);
      assert(/^https:\/\/github\.com\/manojhunasimarad\/ETL\/blob\/main\/docs\/steps\/STEP-\d\d-/.test(s.note), s.id);
    }
  }
  const text = JSON.stringify(g);
  assert(!/\bI ran\b|\bI'll\b|today it would|only on your laptop/.test(text), 'no stale first-person or dated wording');
});

test('ticks: set, untick, and merge where the newer change wins on both sides', () => {
  let a = setTick(emptyGuide(), 's1:generate-and-profile-ran', true, 1000);
  assert(isTicked(a, 's1:generate-and-profile-ran'));
  let b = setTick(emptyGuide(), 's1:generate-and-profile-ran', false, 2000);   // unticked later on the other device
  b = setTick(b, 's2:x', true, 1500);
  const ab = mergeGuide(a, b, 3000), ba = mergeGuide(b, a, 3000);
  assert.equal(isTicked(ab, 's1:generate-and-profile-ran'), false);
  assert.deepEqual(ab.ticks, ba.ticks, 'merge is symmetric');
  assert(isTicked(ab, 's2:x'));
  assert.throws(() => setTick(emptyGuide(), '__proto__', true));
  const evil = { app: 'lfz-etl-guide', version: 1, ticks: { '__proto__': { on: true, at: 5 }, 'ok:1': { on: true, at: 9e15 }, 'ok:2': { on: true, at: 10 } } };
  const m = mergeGuide(emptyGuide(), evil, 3000);
  assert.deepEqual(Object.keys(m.ticks), ['ok:2'], 'future stamps and unsafe keys are dropped');
  assert.equal(mergeGuide(a, { junk: 1 }, 3000).ticks['s1:generate-and-profile-ran'].on, true, 'not a guide file: keep ours');
});

test('guide progress counts per section and finds the first section with open boxes', async () => {
  const g = await json('content/etl-guide.json');
  let st = emptyGuide();
  const p0 = guideProgress(g, st);
  assert.equal(p0.done, 0); assert.equal(p0.next.id, 'setup');
  for (const it of guideItems(g).filter(i => i.section === 'setup')) st = setTick(st, it.id, true, 5000);
  const p1 = guideProgress(g, st);
  assert.equal(p1.sections.find(s => s.id === 'setup').done, p1.sections.find(s => s.id === 'setup').total);
  assert.equal(p1.next.id, 'latest');
  assert(p1.pct > 0 && p1.pct < 100);
  assert.equal(ticksOn(st, dayKey(new Date(5000))), p1.done);
});

test('solved exercises are mirrored once and merge to the first time seen', () => {
  let s = noteSolved(null, ['sql-filter', 'bad id!', '__proto__'], 100);
  assert.deepEqual(Object.keys(s.ids), ['sql-filter']);
  assert.equal(noteSolved(s, ['sql-filter'], 200), s, 'nothing new: same object, no write');
  const m = mergeSolved(s, { app: 'lfz-solved', version: 1, ids: { 'sql-filter': 50, 'spark-lazy': 70 } }, 1000);
  assert.deepEqual(m.ids, { 'sql-filter': 50, 'spark-lazy': 70 });
});

test('goal progress: marking, solving and demonstrating all move the bar; the next topic is ready now', async () => {
  const graph = await json('content/learning-graph.json');
  const p0 = goalProgress(graph, 'etl');
  assert.equal(p0.done, 0); assert(p0.total >= 20); assert(p0.hoursLeft === p0.hoursTotal);
  assert(p0.now && p0.now.id, 'a first topic');
  const p1 = goalProgress(graph, 'etl', { marked: ['python', 'git'] });
  assert.equal(p1.done, 2); assert.equal(p1.hoursLeft, p0.hoursLeft - 10);
  const sql = graph.nodes.find(n => n.id === 'de-sql');
  const p2 = goalProgress(graph, 'etl', { marked: ['python', 'git'], solved: sql.checkpoint ? [sql.checkpoint] : sql.practice });
  assert.equal(p2.done, 3, 'a solved checkpoint counts');
  const p3 = goalProgress(graph, 'etl', { demonstrated: ['linux'] });
  assert.equal(p3.done, 1, 'demonstrated in the learning desk counts');
  assert(!p3.upcoming.some(t => t.id === 'linux'));
  const unknown = goalProgress(graph, 'no-such-track');
  assert.equal(unknown.track, graph.tracks[0].id, 'an unknown track falls back to the first');
});

test('today: each step is ticked by real work, or by hand; yesterday does not count', () => {
  const day = '2026-11-26', at = new Date(2026, 10, 26, 9).getTime(), yesterday = new Date(2026, 10, 25, 21).getTime();
  const none = todaySteps({ day, today: todayState(null, day) });
  assert.equal(none.done, 0); assert.equal(none.next.id, 'plan');
  const t = todayState({ day, plan: at, secs: { learn: 650, use: 30, recall: 0 }, manual: { recall: true } }, day);
  const r = todaySteps({ day, today: t, clockLog: [{ kind: 'use', at }, { kind: 'learn', at: yesterday }],
    learning: { topics: {}, quizAttempts: {}, sessions: { a: { day, minutes: 25, note: 'x' } } } });
  const by = Object.fromEntries(r.steps.map(s => [s.id, s]));
  assert(by.plan.done && by.learn.done && by.use.done && by.recall.done && by.log.done);
  assert(by.recall.manual, 'recall was ticked by hand');
  assert.match(by.learn.why, /min on lessons/);
  assert.match(by.use.why, /Use round/);
  const stale = todayState({ day: '2026-11-25', plan: yesterday, secs: { learn: 999 }, manual: { log: true } }, day);
  assert.equal(todaySteps({ day, today: stale }).done, 0, 'a new day starts empty');
});

test('page kinds: lessons and the guide are learning, exercises are use, recall and quizzes are recall', () => {
  assert.equal(pageKind('s:lesson/de-00'), 'learn');
  assert.equal(pageKind('s:etl/s3'), 'learn');
  assert.equal(pageKind('p:/ex/sql-filter'), 'use');
  assert.equal(pageKind('p:/recall'), 'recall');
  assert.equal(pageKind('s:topic/de-sql?review'), 'recall');
  assert.equal(pageKind('s:today'), null);
});

test('the first-visit tour shows until it is finished or skipped, and again after a new tour version', () => {
  assert(tourPending(null));
  assert(!tourPending({ version: TOUR_VERSION, done: 1 }));
  assert(!tourPending({ version: TOUR_VERSION, skipped: 1 }));
  assert(tourPending({ version: TOUR_VERSION - 1, done: 1 }));
});

test('speedrun lock: a step opens only when every earlier step with boxes is fully ticked', async () => {
  const g = await json('content/etl-guide.json');
  let st = emptyGuide();
  let p = guideProgress(g, st);
  assert.equal(lockedBy(p, 'start'), null, 'Start here is always open');
  assert.equal(lockedBy(p, 'setup'), null, 'the first section with boxes is open');
  assert.equal(lockedBy(p, 's1').id, 'setup', 'step 1 waits for setup');
  for (const it of guideItems(g).filter(i => ['setup', 'latest'].includes(i.section))) st = setTick(st, it.id, true, 5000);
  p = guideProgress(g, st);
  assert.equal(lockedBy(p, 's1'), null);
  assert.equal(lockedBy(p, 's2').id, 's1');
  const one = guideItems(g).find(i => i.section === 's1');
  st = setTick(st, one.id, true, 6000);
  assert.equal(lockedBy(guideProgress(g, st), 's2').id, 's1', 'one box is not the whole step');
  assert.equal(lockedBy(p, 'nope'), null, 'unknown ids are not locked here (the page says not found)');
});
