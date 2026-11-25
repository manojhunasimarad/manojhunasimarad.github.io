import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {DEFAULTS, KINDS, BODY, RECALL, normalise, buildWeek, weekMinutes, nowAndNext, alarmList, weekIcs, startTimer, remaining, advance, breakTip, toMin, fromMin} from '../clock-core.mjs';
import {SECTIONS, ALL_TABS, where, locate, href} from '../site-nav.mjs';
const root = new URL('../', import.meta.url);

test('Every place in both apps belongs to exactly the section you would expect', () => {
  const cases = {
    's:': 'today', 's:today': 'today', 's:clock': 'today', 'p:/': 'today', 'p:/focus': 'today',
    's:library': 'learn', 's:lesson/py-01': 'learn', 'p:/learn': 'learn', 'p:/lesson/py-01': 'learn', 'p:/read': 'learn', 'p:/read?x=1': 'learn', 'p:/paper/0a1b': 'learn', 'p:/ask': 'learn', 'p:/lists/build': 'learn', 's:lab': 'learn',
    'p:/practice/python': 'practice', 'p:/ex/py-1': 'practice', 'p:/review/py-1': 'practice', 'p:/mock': 'practice',
    'p:/recall': 'review', 'p:/recall?id=3': 'review', 'p:/quiz': 'review', 'p:/quiz/run': 'review', 's:quiz': 'review',
    'p:/etl': 'projects', 'p:/etl?goal=whole': 'projects', 'p:/etl/check': 'projects', 'p:/etl/check?t=x': 'projects', 's:projects': 'projects', 's:notebook': 'projects',
    's:progress': 'progress', 's:roadmap': 'progress', 's:topic/python': 'progress', 's:topic/python?review': 'progress', 'p:/map': 'progress', 'p:/skill/x': 'progress', 'p:/roles': 'progress', 'p:/certs': 'progress',
    's:setup': 'settings', 'p:/settings': 'settings'
  };
  for (const [place, section] of Object.entries(cases)) {
    const p = place === 's:' ? where('studio', '') : place;
    assert.equal(locate(p)?.section, section, place);
  }
  assert.equal(locate('p:/etl/check').tab.name, 'Check what you know');
  assert.equal(locate('p:/etl?goal=whole').tab.name, 'ETL project');
  assert.equal(locate('p:/nowhere'), null);
});

test('Every tab target resolves back to its own tab, and links stay on the same page when they can', () => {
  for (const t of ALL_TABS) {
    const page = t.to.startsWith('s:') ? 'studio' : 'practice';
    assert.equal(locate(where(page, t.to.slice(2))).tab.to, t.to, t.name);
  }
  assert.equal(href('s:#today', 'studio'), '#today');
  assert.equal(href('p:#/recall', 'studio'), 'index.html#/recall');
  assert.equal(href('s:#clock', 'practice'), 'studio.html#clock');
  assert.equal(SECTIONS.filter(s => !s.hidden).length, 6);
  assert.equal(new Set(SECTIONS.map(s => s.key)).size, SECTIONS.length);
});

test('Every practice-app route has a home in the navigation', async () => {
  const app = await fs.readFile(new URL('app.js', root), 'utf8');
  const routes = [...app.matchAll(/\[\/\^\\\/\??([^$]*)\$\/, (\w+), "(\w+)"\]/g)].map(m => m[1]);
  assert(routes.length > 15);
  const sample = r => '/' + r.replace(/\\\//g, '/').replace(/\(\?:\\\?\(\.\*\)\)\?/, '').replace(/\(\[\\w-\]\+\)|\(\\w\+\)|\(\[0-9a-f\]\+\)/, 'x1').replace(/^\//, '');
  for (const r of routes) { const path = sample(r).replace(/^\/\//, '/'); assert(locate('p:' + (path === '/' ? '/' : path)), 'no section for ' + path); }
});

test('Root files used by the pages are served by both local servers and saved for offline', async () => {
  const read = f => fs.readFile(new URL(f, root), 'utf8');
  const [studio, index, serve, server, config] = await Promise.all(['studio.html', 'index.html', 'tools/serve.mjs', 'py/server.py', 'config.js'].map(read));
  const ctx = { self: {} }; vm.runInNewContext(config, ctx);
  const files = new Set([...(studio + index).matchAll(/(?:src|href)="([\w.-]+\.(?:m?js|css))"/g)].map(m => m[1]));
  const queue = [...files].filter(f => f.endsWith('.mjs'));
  while (queue.length) {   // follow imports of the modules
    const f = queue.pop(), text = await read(f);
    for (const m of text.matchAll(/(?:from|import\()\s*['"]\.\/([\w.-]+\.mjs)['"]/g)) if (!files.has(m[1])) { files.add(m[1]); queue.push(m[1]); }
  }
  for (const f of files) {
    if (['config.js', 'boot.js'].includes(f)) continue;   // web-only start-up files; the native server swaps them for app.js
    assert(serve.includes(`'${f}'`), 'tools/serve.mjs does not serve ' + f);
    assert(server.includes(`"${f}"`), 'py/server.py does not serve ' + f);
    assert(ctx.self.LFZ_CONFIG.precache.includes(f), 'config.js precache misses ' + f);
  }
});

test('The week follows the routine: learn in the morning, recall before sleep, nothing overlaps work or sleep', () => {
  const week = buildWeek(DEFAULTS);
  assert(week.length >= 20);
  for (let d = 0; d < 7; d++) {
    const day = week.filter(b => b.day === d);
    assert(day.some(b => b.kind === 'recall' && b.end <= DEFAULTS.sleep), 'recall before sleep on ' + d);
    for (let i = 1; i < day.length; i++) assert(toMin(day[i].start) >= toMin(day[i - 1].start) + day[i - 1].mins, 'overlap on day ' + d);
    for (const b of day) {
      assert(toMin(b.start) >= toMin(DEFAULTS.wake) && toMin(b.start) + b.mins <= toMin(DEFAULTS.sleep), `${b.title} outside the waking day`);
      if (DEFAULTS.workdays.includes(d) && b.kind !== 'listen' && b.kind !== 'review') assert(toMin(b.start) + b.mins <= toMin(DEFAULTS.workStart) || toMin(b.start) >= toMin(DEFAULTS.workEnd), `${b.title} during work`);
    }
  }
  assert(week.some(b => b.day === 1 && b.kind === 'listen'), 'office days have a commute listen');
  assert(!week.some(b => b.day === 3 && b.kind === 'listen'), 'home days have no commute');
  const mins = weekMinutes(week); assert(mins > 600 && mins < 1200, String(mins));
  assert(week.every(b => KINDS[b.kind] && b.body.every(id => BODY.some(x => x.id === id) || RECALL.some(x => x.id === id))));
});

test('Odd routines do not break the week', () => {
  const late = buildWeek({ wake: '08:30', sleep: '00:30', workStart: '10:00', workEnd: '19:00', commute: 0, workdays: [1, 2, 3, 4, 5, 6], office: [] });
  assert(late.every(b => /^\d\d:\d\d$/.test(b.start) && b.mins > 0));
  assert(late.some(b => b.kind === 'recall'));
  const junk = normalise({ wake: 'x', commute: '-5', workdays: [9, 'a', 2], office: [2, 3] });
  assert.equal(junk.wake, DEFAULTS.wake); assert.equal(junk.commute, 0); assert.deepEqual(junk.workdays, [2]); assert.deepEqual(junk.office, [2]);
  assert.equal(fromMin(1500), '01:00');
});

test('Now and next find the right block, also across midnight and the week end', () => {
  const week = buildWeek(DEFAULTS);
  const mon = new Date(2026, 10, 23, 6, 45);   // a Monday
  assert.equal(nowAndNext(week, mon).current.kind, 'learn');
  const night = new Date(2026, 10, 23, 23, 0), nn = nowAndNext(week, night);
  assert.equal(nn.current, null); assert.equal(nn.next.day, 2); assert(nn.minsToNext > 0 && nn.minsToNext < 1440);
  const sat = new Date(2026, 10, 28, 23, 50); assert.equal(nowAndNext(week, sat).next.day, 0);
});

test('Calendar file: valid lines, weekly repeats, two alarms each, folded at 75 octets', () => {
  const week = buildWeek(DEFAULTS), ics = weekIcs(week, { now: new Date(2026, 10, 25, 6, 0), base: 'https://example.org/llm-from-zero/studio.html', resolve: l => href(l, 'x') });
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR'); assert.equal(lines.at(-2), 'END:VCALENDAR');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, week.length);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, week.length * 2);
  assert.equal((ics.match(/RRULE:FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)\r\n/g) || []).length, week.length);
  for (const l of lines) assert(new TextEncoder().encode(l).length <= 75, l);
  assert(ics.includes('index.html#/recall'));
  assert(!/[^\\][,;](?=[^\r\n]*\r\n)/.test(lines.filter(l => l.startsWith('SUMMARY:')).join('\r\n') + '\r\n'), 'unescaped , or ; in a summary');
  const uids = lines.filter(l => l.startsWith('UID:')); assert.equal(new Set(uids).size, uids.length);
  const al = alarmList(week); assert(al.length < week.length); assert(al.every(a => a.dayText));
});

test('Timer: rounds, breaks, end, and a long gap ends quietly', () => {
  const t0 = 1_000_000;
  let st = startTimer('learn', { now: t0 });
  assert.equal(remaining(st, t0), 25 * 60);
  assert.equal(advance(st, t0 + 1000).event, null);
  let r = advance(st, t0 + 25 * 60e3); assert.equal(r.event, 'work-done'); assert.equal(r.state.phase, 'break');
  r = advance(r.state, t0 + 30 * 60e3 + 5); assert.equal(r.event, 'break-done'); assert.equal(r.state.round, 2);
  r = advance(r.state, t0 + 56 * 60e3); assert.equal(r.event, 'done'); assert.equal(r.state, null);
  assert.equal(advance(startTimer('recall', { now: t0 }), t0 + 15 * 60e3).event, 'done');
  assert.equal(advance(startTimer('use', { now: t0 }), t0 + 5 * 3600e3).event, 'expired');
  assert(BODY.includes(breakTip(1, new Date(2026, 0, 5))));
});
