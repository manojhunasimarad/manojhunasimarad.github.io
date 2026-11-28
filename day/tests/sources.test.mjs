process.env.TZ = 'Asia/Kolkata';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../sources.mjs';
import * as journey from '../../llm-from-zero/journey-core.mjs';
import * as clock from '../../llm-from-zero/clock-core.mjs';

const T = s => new Date(s).getTime();
function store(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, raw: m };
}
const summary = {
  v: 1, at: T('2026-11-28T08:00'), date: '2026-11-28',
  days: [{ date: '2026-11-28', sessions: 2, meals: [
    { slot: 'b', name: 'Breakfast', time: '08:00', people: 1, eaten: false, dishes: [{ id: 'b2-besan-chilla', title: 'Besan chilla', mins: 20 }] },
    { slot: 'l', name: 'Lunch', time: '13:00', people: 1, eaten: false, dishes: [{ id: 'b1-chicken-pulao', title: 'Chicken pulao', mins: 45 }] },
    { slot: 'd', name: 'Dinner', time: '20:30', people: 1, eaten: false, dishes: [] }] }],
  prep: [{ key: 'adv:2026-11-29:l:b2-rajma:0', what: 'Soak 120 g rajma in about 400 ml water for 6–8 hours.', kind: 'soak', dish: 'Rajma', start: T('2026-11-28T22:30'), by: T('2026-11-29T06:00') }],
  shop: { need: [{ key: 'curd', label: 'Curd', for: ['Raita'] }], bring: ['Onion'], ordered: [], low: ['Atta'], app: 'Swiggy Instamart' }
};

test('Kitchen: meals take eaten ticks from Kitchen’s own state', () => {
  const st = store({ 'kfz.summary': summary, 'kfz.state': { v: 2, week: { '2026-W48': { 'sat-b': 1764300000 } }, done: {}, wlog: { '2026-11-20': 71.4, '2026-11-27': 70.9, bad: 3 } } });
  const k = S.kitchen(st);
  assert.ok(k.summary && k.used);
  const day = S.mealsOn(k, '2026-11-28');
  assert.deepEqual(day.meals.map(m => m.eaten), [true, false, false]);
  assert.equal(S.mealsOn(k, '2026-12-05'), null);
  assert.deepEqual(S.weights(k.state).map(w => w.kg), [71.4, 70.9]);
  assert.match(S.shoppingText(k), /- Onion\n- Curd\n- Atta/);
});

test('Kitchen: ticking a prep task writes the field Kitchen’s tick box writes', () => {
  const st = store({ 'kfz.summary': summary, 'kfz.state': { v: 2, done: {} } });
  const key = summary.prep[0].key;
  assert.equal(S.prepList(S.kitchen(st))[0].done, false);
  assert.equal(S.markPrepDone(st, key, true, 1764340000000), true);
  assert.equal(JSON.parse(st.getItem('kfz.state')).done[key], 1764340000);
  assert.equal(S.prepList(S.kitchen(st))[0].done, true);
  S.markPrepDone(st, key, false);
  assert.equal(S.prepList(S.kitchen(st))[0].done, false);
  assert.equal(S.markPrepDone(st, 'not-a-prep-key', true), false);
  const fresh = store();
  assert.equal(S.markPrepDone(fresh, key, true, 1764340000000), true);
  assert.deepEqual(JSON.parse(fresh.getItem('kfz.state')), { v: 2, done: { [key]: 1764340000 } });
});

test('LLM From Zero: today’s steps, blocks and rounds use the app’s own rules', async () => {
  const st = store({ 'lfz-clock-log': [{ kind: 'learn', mins: 25, at: T('2026-11-28T07:00') }, { kind: 'use', mins: 25, at: T('2026-11-28T19:30') }, { kind: 'learn', mins: 25, at: T('2026-11-26T07:00') }],
    'lfz-today-v1': { day: '2026-11-28', plan: 1, secs: {}, manual: {} } });
  const r = await S.llm(st, '2026-11-28', { wake: '06:00', sleep: '22:30' }, { journey, clock });
  assert.equal(r.error, '');
  assert.equal(r.rounds.length, 2);
  assert.equal(r.mins, 50);
  assert.equal(r.steps.done, 3);                          // plan, learn, use
  assert.equal(r.steps.next.id, 'recall');
  assert.ok(r.blocks.length >= 1 && r.blocks.every(b => b.day === 6));
  assert.equal(S.studyStreak(st, '2026-11-28'), 1);
  assert.equal(S.llmHref('p:#/recall'), '/llm-from-zero/index.html#/recall');
  assert.equal(S.llmHref('s:#today'), '/llm-from-zero/studio.html#today');
});

test('LLM From Zero missing: a plain message, no crash', async () => {
  const r = await S.llm(store(), '2026-11-28', {}, { journey: {}, clock: {} });
  assert.match(r.error, /could not be read/);
});

test('Dalal Dojo: worth, rank, missions; lessons: belt and streak', () => {
  const st = store({
    'dojo.account': { v: 1, capital: 100000, cash: 40000, holdings: { RELIANCE: { qty: 20, avg: 2900 } }, lastCloses: { RELIANCE: 3000 }, xp: 520,
      missions: { select: 1, buy: 2 }, history: [], trips: [{ status: 'closed', net: 120 }, { status: 'closed', net: -40 }], createdAt: T('2026-11-01T10:00'), savedAt: T('2026-11-28T21:10') },
    'dalal-dojo-v1': { v: 1, xp: 260, lessons: { m1l1: 1, m1l2: 1, m1l3: 0 }, streak: { last: '2026-11-28', count: 3 }, mode: 'sim' }
  });
  const d = S.dojo(st);
  assert.equal(d.worth, 100000);
  assert.equal(d.rank.name, 'Order Pro');
  assert.equal(d.rank.next.name, 'Margin Aware');
  assert.equal(d.missions, 2);
  assert.equal(d.wins, 1);
  const l = S.dojoLessons(st);
  assert.equal(l.belt.name, 'Orange');
  assert.equal(l.lessons, 2);
  assert.equal(S.tradedOn(d, l, '2026-11-28'), 'Used the paper desk');
  assert.equal(S.tradedOn(null, l, '2026-11-28'), 'Lesson streak kept');
  assert.equal(S.tradedOn(d, l, '2026-11-27'), '');
  st.setItem('dojo.account', JSON.stringify({ capital: 100000, history: [{ end: 102340, net: 500 }] }));
  assert.equal(S.dojo(st).pnl, 2340);
});

test('site backup keeps every app’s data and leaves sign-in tokens and API keys out', () => {
  const st = store({ 'day.v1': {}, 'kfz.state': {}, 'kfz.gemini': 'AIza-secret', 'lfz-sync-v1': { token: 'gho_x' }, 'lfz-learning-v1': {}, 'dojo.account': {}, 'dalal-dojo-v1': {}, 'other-site-key': 1 });
  const b = S.siteBackup(st, new Date(0));
  assert.deepEqual(Object.keys(b.keys).sort(), ['dalal-dojo-v1', 'day.v1', 'dojo.account', 'kfz.state', 'lfz-learning-v1']);
  assert.deepEqual(S.backupApps(b.keys), { dinachari: 1, kitchen: 1, llm: 1, dojo: 2 });
});
