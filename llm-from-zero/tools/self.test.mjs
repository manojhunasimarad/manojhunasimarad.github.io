// "Know yourself" (self-core.mjs): scoring the video-or-reading test, the profile, and sync merges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD, emptySelf, addRun, deleteRun, mergeSelf, scoreRun, profile, cleanRun, recallLines, SPEEDS } from '../self-core.mjs';

const L = (format, minutes, points, written = points) => ({ title: 'x', chapter: 'c', format, seconds: minutes * 60, points, written });
const run = (id, at, lessons, speed = 1.5) => ({ id, at, course: 'c', speed, lessons });

test('the standard run alternates watch and read over four lessons of one course', () => {
  assert.deepEqual(STANDARD.lessons.map(l => l.format), ['video', 'reading', 'video', 'reading']);
  assert(STANDARD.lessons.every(l => l.title && l.chapter));
  assert(/^https:\/\//.test(STANDARD.url));
  assert(SPEEDS.includes(1.5));
});

test('scoring: correct points per 10 study minutes, accuracy, and a 20% margin for a winner', () => {
  const s = scoreRun(run('run-1', 1000, [L('video', 5, 3, 4), L('reading', 4, 4, 5), L('video', 5, 3, 3), L('reading', 4, 4, 4)]));
  assert.deepEqual(s.video, { lessons: 2, minutes: 10, points: 6, rate: 6, accuracy: 86 });
  assert.deepEqual(s.reading, { lessons: 2, minutes: 8, points: 8, rate: 10, accuracy: 89 });
  assert.equal(s.winner, 'reading'); assert.equal(s.margin, 67);
  assert.equal(scoreRun(run('run-2', 1, [L('video', 10, 5), L('reading', 10, 5.5)])).winner, 'tie');
  assert.equal(scoreRun(run('run-3', 1, [L('video', 10, 0), L('reading', 10, 0)])).winner, 'tie');
  assert.equal(scoreRun(run('run-4', 1, [L('video', 10, 5)])).winner, null, 'one format only: no result');
});

test('runs are checked before they are stored: no negative time, no more correct points than lines written', () => {
  assert.throws(() => addRun(emptySelf(), run('run-5', 1000, [{ ...L('video', 5, 3), seconds: -5 }]), 2000));
  assert.throws(() => addRun(emptySelf(), run('run-6', 1000, [L('video', 5, 6, 4)]), 2000));
  assert.throws(() => addRun(emptySelf(), run('BAD ID', 1000, [L('video', 5, 3)]), 2000));
  assert.equal(cleanRun(run('run-7', 9e15, [L('video', 5, 3)]), 2000), null, 'future dates are dropped');
  assert.equal(cleanRun({ ...run('run-8', 1000, [L('video', 5, 3)]), speed: 9 }, 2000).speed, 1, 'odd speeds fall back to 1x');
});

test('the profile: latest result, averages, and the trend between the first and latest run', () => {
  let st = emptySelf();
  assert.equal(profile(st).winner, null);
  st = addRun(st, run('run-a', 1000, [L('video', 10, 4), L('reading', 10, 6)]), 5000);
  st = addRun(st, run('run-b', 2000, [L('video', 10, 7), L('reading', 10, 5)], 2), 5000);
  const p = profile(st);
  assert.equal(p.complete, 2); assert.equal(p.latest.speed, 2); assert.equal(p.latest.winner, 'video');
  assert.deepEqual(p.trend.video, [4, 7]); assert.deepEqual(p.trend.reading, [6, 5]);
  assert.equal(p.average.video.rate, 5.5);
  st = addRun(st, run('run-c', 3000, [L('video', 10, 4), L('reading', 10, 8)]), 5000);
  assert.equal(profile(st).winner, 'reading', 'two of three runs say reading');
});

test('sync merge: union by id, the same on both sides, and a delete is not undone by the other device', () => {
  const a = addRun(emptySelf(), run('run-a', 1000, [L('video', 10, 4), L('reading', 10, 6)]), 5000);
  const b = addRun(emptySelf(), run('run-b', 2000, [L('video', 10, 7), L('reading', 10, 5)]), 5000);
  const ab = mergeSelf(a, b, 6000), ba = mergeSelf(b, a, 6000);
  assert.deepEqual(ab.runs.map(r => r.id), ['run-a', 'run-b']);
  assert.deepEqual(ab.runs, ba.runs);
  const gone = deleteRun(ab, 'run-a', 7000);
  assert.deepEqual(mergeSelf(gone, a, 8000).runs.map(r => r.id), ['run-b'], 'the other device still had run-a');
  assert.deepEqual(mergeSelf(a, { junk: true }, 8000).runs.map(r => r.id), ['run-a'], 'not a profile file: keep ours');
});

test('recall lines: one point per line, bullets and numbering stripped, blanks ignored', () => {
  assert.deepEqual(recallLines('- a table has rows\n\n2. columns have types\n  • PK is unique  \n'), ['a table has rows', 'columns have types', 'PK is unique']);
  assert.deepEqual(recallLines(''), []);
});
