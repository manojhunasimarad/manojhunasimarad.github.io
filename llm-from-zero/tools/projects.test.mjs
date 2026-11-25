// The resume projects (content/projects.json): every step, topic, lesson and question connects,
// every goal prunes like the ETL project's, and the pages are routed, served and synced.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {closure, planFor, studyOrder} from '../etl-core.mjs';
import {recommendedTopic} from '../quiz-core.mjs';
const root = new URL('../', import.meta.url);
const read = p => fs.readFile(new URL(p, root), 'utf8');
const [graph, projects, course, quiz] = await Promise.all(['content/learning-graph.json', 'content/projects.json', 'content/lessons.json', 'content/quiz.json'].map(async p => JSON.parse(await read(p))));
const byId = new Map(graph.nodes.map(n => [n.id, n]));
const lessonIds = new Set(course.lessons.map(l => l.id));

test('Every project connects: steps to topics of its group, lessons, code paths and a whole-project goal', () => {
  assert.deepEqual(projects.projects.map(p => p.id), ['rag', 'fl', 'gpu']);
  for (const p of projects.projects) {
    const mine = graph.nodes.filter(n => n.group === p.group);
    assert(mine.length >= 6, p.id);
    assert.deepEqual(p.steps.map(s => s.n), p.steps.map((_, i) => i + 1));
    for (const s of p.steps) {
      assert(s.targets.length && s.targets.every(t => byId.get(t)?.group === p.group), s.title);
      assert(lessonIds.has(s.lesson), s.lesson);
      assert(s.done.length >= 2 && s.builds.length > 10, s.title);
    }
    assert(lessonIds.has(p.whole.lesson));
    const whole = closure(graph, p.whole.targets);
    for (const n of mine) { assert(whole.has(n.id), p.id + ' whole does not need ' + n.id); n.lessons.forEach(l => assert(lessonIds.has(l), l)); }
    assert(graph.tracks.some(t => JSON.stringify(t.targets) === JSON.stringify(p.whole.targets)), 'no studio track for ' + p.id);
    const c = course.courses.find(c => c.id === 'proj-' + p.id);
    assert(c && c.lessons.every(l => lessonIds.has(l)), 'no course for ' + p.id);
    if (p.repo) assert(p.repo.startsWith('https://github.com/') && p.code_base.startsWith(p.repo));
  }
});

test('Every project topic has two well-formed questions, and answers are spread over the options', () => {
  const ours = quiz.questions.filter(q => /^(rp|flp|gp)-/.test(q.node || ''));
  assert(ours.length >= 30);
  for (const n of graph.nodes.filter(n => /^(rp|flp|gp)-/.test(n.id) && !n.id.endsWith('capstone'))) {
    const qs = ours.filter(q => recommendedTopic(q) === n.id);
    assert(qs.length >= 2, n.id);
    for (const q of qs) { assert.equal(q.options.length, 4); assert(q.answer >= 0 && q.answer < 4); assert.equal(new Set(q.options).size, 4, q.id); }
  }
  const positions = new Set(ours.map(q => q.answer));
  assert.equal(positions.size, 4, 'the right answer must not always sit in one place');
});

test('Every goal prunes like the ETL page: knowing the prerequisites leaves only the step', () => {
  for (const p of projects.projects) for (const s of [...p.steps, p.whole]) {
    const full = closure(graph, s.targets), order = studyOrder(graph, full);
    for (const [i, id] of order.entries()) for (const q of byId.get(id).needs) if (full.has(q)) assert(order.indexOf(q) < i);
    const known = new Map([...full].filter(id => !s.targets.includes(id)).map(id => [id, 'marked known']));
    assert.deepEqual([...planFor(graph, s.targets, known).study].sort(), [...s.targets].sort(), s.title);
  }
});

test('Pages are routed, linked, served, precached and synced', async () => {
  const [app, index, studio, serve, server, config, sync] = await Promise.all(['app.js', 'index.html', 'studio.html', 'tools/serve.mjs', 'py/server.py', 'config.js', 'cloud-sync.mjs'].map(read));
  assert(app.includes('[/^\\/project\\/([\\w-]+)(?:\\?(.*))?$/, projectPage, "projects"]'));
  assert(app.includes('[/^\\/projects$/, projectsHome, "projects"]'));
  assert(index.includes('<a href="#/projects" data-nav="projects">Projects</a>'));
  assert(studio.includes('index.html#/projects'));
  for (const f of ['etl-check.mjs', 'theme.js', 'cloud-sync.mjs', 'sync-ui.mjs', 'offline.mjs']) { assert(serve.includes(`'${f}'`), f); assert(server.includes(`"${f}"`), f); }
  assert(config.includes('"content/projects.json"'));
  assert(sync.includes('lfz-proj-${p.id}-v1') && sync.includes('lfz-proj-${p.id}-check-v1'));
});
