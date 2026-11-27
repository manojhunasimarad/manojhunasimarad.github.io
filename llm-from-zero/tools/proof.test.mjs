// Proof boxes of the ETL step guide (etl-proof-core.mjs, content/etl-proofs.json) and the growing
// pipeline map (etl-map.mjs). The pasted outputs below are what the repository really prints:
// step 1 was run from github.com/manojhunasimarad/ETL at 671d71d (seed 42); the others are built
// from the print formats in src/ecom_etl/cli.py with the numbers in the step notes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { checkPaste, checkGithub, ciVerdict, storySection, resultsRows, secretIn, proofFor, kindsOf, recordPass, clearProof, proofComplete, parseRepo, filesNeeded, emptyProofs, DEFAULT_REPO } from '../etl-proof-core.mjs';
import { pipelineMap, partStates, PARTS } from '../etl-map.mjs';
import { emptyGuide, setTick, guideItems, guideProgress, lockedBy } from '../journey-core.mjs';

const root = new URL('../', import.meta.url);
const json = async f => JSON.parse(await fs.readFile(new URL(f, root), 'utf8'));
const ctx = DEFAULT_REPO;

const STEP1 = String.raw`Wrote synthetic data to D:/sem3_4/ETL/data/raw/synthetic in 0.3s
  customers                   10,115 rows
  sellers                        312 rows
  category_translation            20 rows
  products                     3,333 rows
  orders                      10,103 rows
  order_items                 11,310 rows
  order_payments              10,599 rows
  injected defects: 1,424 (see _defects.csv)
Profiled D:/sem3_4/ETL/data/raw/synthetic in 0.2s
  customers                   10,115 rows
  sellers                        312 rows
  category_translation            20 rows
  products                     3,333 rows
  orders                      10,103 rows
  order_items                 11,310 rows
  order_payments              10,599 rows

17 findings:
  [error] customers       duplicate_rows                                                   115
  [error] order_items     fk:product_id->products                                          115
  [error] order_items     range:price                                                      116
  [error] order_items     type:price                                                       115
  [error] order_payments  accepted_values_invalid:payment_type                             123
  [error] order_payments  duplicate_rows                                                   105
  [error] order_payments  fk:order_id->orders                                              125
  [error] orders          accepted_values_invalid:order_status                             105
  [error] orders          duplicate_rows                                                   103
  [error] orders          future_timestamps                                                 98
  [error] orders          not_null:customer_id                                             100
  [error] orders          sequence:order_delivered_customer_date>=order_delivered_carrier_date        91
  [error] orders          sequence:order_delivered_customer_date>=order_purchase_timestamp        91
  [error] products        fk:product_category_name->category_translation                    25
  [warn ] orders          accepted_values_fixable:order_status                              88
  [warn ] orders          payment_reconciliation                                           333
  [info ] orders          orders_without_items                                              66

Injected vs detected: 14/14 defect types match exactly

Report: D:/sem3_4/ETL/reports/profile_synthetic.md`;
const WITH_YOUR_TURN = STEP1.replace('\n17 findings:', '\n18 findings:').replace('  [warn ] orders          accepted_values_fixable', '  [warn ] customers       customers_without_orders                                         100\n  [warn ] orders          accepted_values_fixable');
const PYTEST_OK = '........................ss....\n98 passed, 57 skipped in 41.20s';
const CORE = String.raw`Built schema synthetic_core in 3.2s
  table                        raw      core   removed
  customers                  5,062     5,000        62
  sellers                      156       156         0
  category_translation          20        22        -2
  products                   1,666     1,666         0
  orders                     5,061     4,805       256
  order_items                5,656     5,333       323
  order_payments             5,286     4,914       372`;
const SILVER = String.raw`Silver written to /app/data/lake/synthetic/silver in 21.4s
  table                     bronze   dupes  quarantine    silver
  customers                  5,062      62           0     5,000
  orders                     5,061      61         195     4,805
  order_items                5,656       0         323     5,333
  order_payments             5,286      59         313     4,914`;
const RUN = String.raw`Pipeline success in 74.2s: generate 3.1s, bronze 9.0s, silver 30.2s, gold 20.4s
Data quality: 115 checks (80 row-level, 35 table-level), 14 flagged, 0 blocking
  bronze records 91,521: quarantined 3,497, duplicates removed 622, fixed 471
  vs injected defects: quarantine precision 100.0%, recall 100.0%
  [warn] orders.volume_change: 4805 -> 19194 rows
  report: reports/dq_report_synthetic.md`;
const STREAM = String.raw`Processed everything in order_events in 48.3s
  bronze_records        3,063
  quarantined           32
  silver_events         2,968
  daily_windows         151
  daily_revenue         414,831.77`;
const DRY = '40 reviews, 37 with a comment, 35 unique, 0 already cached.\nWould label 35 comments in 1 request(s) of up to 40: about 830 input and 636 output tokens, 0.1 min at 8 requests/min.';

test('every proof belongs to a real tick box, every rule compiles and says what it checks', async () => {
  const [g, P] = await Promise.all([json('content/etl-guide.json'), json('content/etl-proofs.json')]);
  const ids = new Set(guideItems(g).map(i => i.id));
  const known = new Set(['story', 'results', 'resultsAny', 'fileLacks', 'ci', 'head']);
  assert(Object.keys(P.proofs).length >= 45, 'most boxes have a proof');
  for (const [id, spec] of Object.entries(P.proofs)) {
    assert(ids.has(id), 'no tick box ' + id);
    assert(kindsOf(spec).length, id + ' has no proof');
    if (spec.paste) {
      assert(spec.paste.run && spec.paste.where, id + ' says what to run and where');
      for (const r of [...(spec.paste.need || []), ...(spec.paste.forbid || []), ...(spec.paste.hints || [])]) {
        assert(r.say, id + ' rule without words'); new RegExp(r.re.replace(/\{owner\}/g, 'x'), [...new Set('m' + (r.flags || ''))].join(''));
      }
      assert(spec.paste.pytest || (spec.paste.need || []).length, id + ' needs something');
    }
    for (const c of spec.github || []) { assert(known.has(c.check), id + ': ' + c.check); if (c.file) assert(P.files[c.file], id + ': no path for ' + c.file); }
    if ((spec.github || []).some(c => c.check === 'head')) assert(spec.paste?.sha, id + ': head needs a pasted commit id');
  }
  // Boxes that need a secret are never proven by pasting.
  assert(!proofFor(P, 'setup:gemini-key-in-env'));
  // Every step has at least one box that needs real proof, and every story box is checked on GitHub.
  for (const s of g.sections.filter(s => s.kind === 'step')) assert(s.blocks.some(b => b.t === 'check' && b.items.some(i => proofFor(P, i.id))), s.id);
  for (const i of guideItems(g).filter(i => /stories/i.test(i.text))) assert(proofFor(P, i.id)?.github?.some(c => c.check === 'story'), i.id);
});

test('real outputs pass; wrong data, failed tests and other machines' + "'" + ' numbers do not', async () => {
  const P = await json('content/etl-proofs.json'), rule = id => proofFor(P, id).paste;
  // Step 1: the real run.
  const s1 = checkPaste(rule('s1:generate-and-profile-ran'), STEP1, ctx);
  assert(s1.ok, JSON.stringify(s1));
  const other = checkPaste(rule('s1:generate-and-profile-ran'), STEP1.replace(/10,103 rows/g, '20,207 rows'), ctx);
  assert(!other.ok && other.hints.length, 'another --orders gets a hint');
  // The "your turn" function: right count passes, a row count instead of distinct ids does not.
  assert(checkPaste(rule('s1:customers-without-orders-written-its-3-t'), '3 passed in 2.1s\n' + WITH_YOUR_TURN, ctx).ok);
  const off = checkPaste(rule('s1:customers-without-orders-written-its-3-t'), '3 passed in 2.1s\n' + WITH_YOUR_TURN.replace(/customers_without_orders(\s+)100/, 'customers_without_orders$1101'), ctx);
  assert(!off.ok && off.hints.some(h => /distinct|once/.test(h)));
  const notYet = checkPaste(rule('s1:customers-without-orders-written-its-3-t'), '3 skipped in 1.0s\n' + STEP1, ctx);
  assert(!notYet.ok && notYet.hints.some(h => /skip/.test(h)));
  // Steps 2, 3, 5, 9 and the setup.
  assert(checkPaste(rule('s2:load-raw-and-build-core-ran-and-match-th'), CORE, ctx).ok);
  assert(!checkPaste(rule('s2:load-raw-and-build-core-ran-and-match-th'), CORE.replace('4,805       256', '4,806       255'), ctx).ok);
  assert(checkPaste(rule('s3:bronze-and-silver-ran-in-docker'), SILVER, ctx).ok);
  assert(checkPaste(rule('s5:run-succeeded-on-20-000-orders-and-match'), RUN, ctx).ok);
  const stopped = checkPaste(rule('s5:run-succeeded-on-20-000-orders-and-match'), 'STOPPED: gate orders.quarantine_share failed\n' + RUN, ctx);
  assert(!stopped.ok && stopped.problems.length);
  assert(checkPaste(rule('s5:gate-blocked-on-purpose-exit-code-2-seen'), 'STOPPED: gate failed\nexit code 2', ctx).ok);
  assert(checkPaste(rule('s9:produce-and-stream-ran-and-your-numbers'), STREAM, ctx).ok);
  assert(checkPaste(rule('latest:dry-run-of-enrich-reviews-prints-a-plan'), DRY, ctx).ok);
  assert(checkPaste(rule('setup:pytest-q-shows-0-failed'), PYTEST_OK, ctx).ok);
  const failed = checkPaste(rule('setup:pytest-q-shows-0-failed'), 'FAILED tests/test_x.py::t - assert 1 == 2\n1 failed, 97 passed in 40.1s', ctx);
  assert(!failed.ok && failed.problems.some(p => /failed/.test(p)));
  assert(checkPaste(rule('setup:git-name-and-email-correct'), 'manojhunasimarad\n89728596+manojhunasimarad@users.noreply.github.com\r\n', ctx).ok);
  assert(!checkPaste(rule('setup:git-name-and-email-correct'), 'Manoj H\nmanoj@company.com', ctx).ok);
  assert(checkPaste(rule('setup:git-name-and-email-correct'), 'someone\n123+someone@users.noreply.github.com', { owner: 'someone' }).ok, 'a fork checks its own owner');
  assert(checkPaste(rule('setup:venv-created-and-active'), 'D:\\sem3_4\\ETL\\.venv', ctx).ok);
  assert(!checkPaste(rule('setup:venv-created-and-active'), 'C:\\Users\\manoj\\AppData\\Local\\Programs\\Python\\Python312', ctx).ok);
  assert(checkPaste(rule('setup:docker-desktop-runs'), 'Client:\n Version: 28.0.1\n\nServer: Docker Desktop 4.40.0 (187762)\n Engine:\n  Version: 28.0.1', ctx).ok);
  assert(!checkPaste(rule('setup:docker-desktop-runs'), 'Client:\n Version: 28.0.1\nerror during connect: this error may indicate that the docker daemon is not running', ctx).ok);
  // Empty paste, and a commit id is read for the GitHub comparison.
  assert(!checkPaste(rule('s1:generate-and-profile-ran'), '   ', ctx).ok);
  assert.equal(checkPaste(rule('latest:local-main-updated-with-git-pull'), '671d71d (HEAD -> main, origin/main) Merge pull request #11', ctx).sha, '671d71d');
});

test('a key or password in the paste is refused before anything is checked', () => {
  const rule = { need: [{ re: 'x', say: 'x' }] };
  for (const t of ['GEMINI_API_KEY=AIzaSyA1234567890abcdefghijklmnopqrstuv', 'ghp_' + 'a'.repeat(36), 'github_pat_' + 'b'.repeat(40), 'password = hunter2secret', '-----BEGIN OPENSSH PRIVATE KEY-----']) {
    const r = checkPaste(rule, 'x\n' + t, ctx);
    assert(!r.ok && r.secret && r.problems[0].includes('Nothing was checked'), t);
  }
  assert.equal(secretIn(DRY), null, 'token counts are not secrets');
  assert.equal(secretIn(STEP1), null);
});

test('GitHub checks: stories, results rows, the pushed function, CI and the laptop commit', () => {
  const stories = '# Interview stories\n\n## Step 1: Data sources\n\n- **Problem**: real issue\n- **Result**: 17 findings\n- **Trade-off / next time**: (fill in)\n\n## Step 2: Postgres\n\n- **Trade-off / next time**: COPY as text costs a second pass\n\n## Step 3: Spark\n\n- **Result**: see the quarantine counts per reason in the silver report; nothing disappears\n- **Trade-off / next time**: try_cast hides typos\n\n## Step 10: Cloud\n\n- **Result**: 70 s\n';
  assert.match(storySection(stories, 1), /fill in/); assert.doesNotMatch(storySection(stories, 1), /Postgres/);
  assert.match(storySection(stories, 10), /70 s/); assert.equal(storySection(stories, 7), null);
  assert(!checkGithub({ check: 'story', step: 1 }, { stories }).ok);
  assert(checkGithub({ check: 'story', step: 2 }, { stories }).ok);
  assert(!checkGithub({ check: 'story', step: 3, forbid: ['see the quarantine counts per reason'] }, { stories }).ok);
  assert(checkGithub({ check: 'story', step: 3 }, { stories }).ok);
  const results = '# Results\n\n| Metric | Value | Data | Command | Machine | Date |\n|---|---|---|---|---|---|\n| Olist source records (orders / customers) | pending | Olist | `profile` | | |\n| Batch runtime, baseline | 176.9 s | 201,874 orders | `benchmark --repeat 2` | GitHub runner, 4 cores | 2026-11-22 |\n| Databricks Free Edition run | 61 s | 20,000 | notebook | Databricks serverless | 2026-11-29 |\n';
  assert.equal(resultsRows(results).length, 3);
  assert(!checkGithub({ check: 'results', row: 'Olist source records' }, { results }).ok);
  assert(checkGithub({ check: 'results', row: 'Databricks Free Edition run' }, { results }).ok);
  const bench = { check: 'resultsAny', all: ['benchmark'], not: ['GitHub runner', 'pending'] };
  assert(!checkGithub(bench, { results }).ok, 'the CI row is not your laptop');
  assert(checkGithub(bench, { results: results + '| Batch runtime, laptop | 58.1 s | 50,000 orders | `benchmark --repeat 2` | Lenovo i7, 16 GB | 2026-11-30 |\n' }).ok);
  assert(checkGithub({ check: 'resultsAny', all: ['ask'], re: '\\b\\d+ of 10\\b', not: ['pending'] }, { results: results + '| Ask your data, ask-eval | 8 of 10 match | synthetic | `ask-eval` | laptop | 2026-11-30 |\n' }).ok);
  const placeholder = 'raise NotImplementedError("your turn: implement customers_without_orders in profiling.py (step 1)")';
  assert(!checkGithub({ check: 'fileLacks', file: 'profiling', text: 'your turn: implement customers_without_orders' }, { profiling: placeholder }).ok);
  assert(checkGithub({ check: 'fileLacks', file: 'profiling', text: 'your turn: implement customers_without_orders' }, { profiling: 'return int(n)' }).ok);
  const sha = '671d71d708b11b5446a0954d6252d87669f8754f';
  assert(checkGithub({ check: 'head' }, { sha }, { sha: '671d71d' }).ok);
  assert(!checkGithub({ check: 'head' }, { sha }, { sha: 'bb0e9b1' }).ok);
  assert(!checkGithub({ check: 'head' }, { sha }, {}).ok);
  const run = (name, status, conclusion, head = sha, event = 'push') => ({ name, status, conclusion, head_sha: head, event });
  assert(ciVerdict({ workflow_runs: [run('CI', 'completed', 'success')] }, sha).ok);
  assert(!ciVerdict({ workflow_runs: [run('CI', 'in_progress', null)] }, sha).ok);
  assert(!ciVerdict({ workflow_runs: [run('CI', 'completed', 'failure')] }, sha).ok);
  assert(!ciVerdict({ workflow_runs: [run('CI', 'completed', 'success', 'other')] }, sha).ok, 'only runs on the newest commit count');
  assert(ciVerdict({ workflow_runs: [run('CI', 'completed', 'success'), run('Benchmark', 'completed', 'failure', sha, 'workflow_dispatch')] }, sha).ok, 'a manual benchmark run does not block');
  assert.deepEqual([...filesNeeded([{ check: 'story' }, { check: 'ci' }])].sort(), ['runs', 'sha', 'stories']);
  assert.deepEqual(parseRepo('https://github.com/someone/ETL.git'), { owner: 'someone', repo: 'ETL', branch: 'main' });
  assert.equal(parseRepo('not a repo'), null);
});

test('a box is proven only when every part passed; unticking forgets the proof', () => {
  const spec = { paste: {}, github: [] };
  let rec = recordPass(emptyProofs(), 'a', 'paste', { sha: 'abc1234' }, 5);
  assert(!proofComplete(spec, rec.items.a));
  rec = recordPass(rec, 'a', 'github', {}, 6);
  assert(proofComplete(spec, rec.items.a)); assert.equal(rec.items.a.sha, 'abc1234');
  assert.equal(clearProof(rec, 'a').items.a, undefined);
});

test('the pipeline map grows: one part per finished section, the next one marked, the rest locked', async () => {
  const g = await json('content/etl-guide.json');
  let state = emptyGuide();
  let p = guideProgress(g, state);
  let m = pipelineMap(p, { lockOn: true, lockedBy });
  assert.equal(m.built, 0); assert.equal(m.total, PARTS.length + 1, 'every part plus Airflow is drawn');
  assert.equal(m.states.setup, 'now'); assert.equal(m.states.s3, 'locked'); assert.equal(m.states.s8, 'locked');
  assert.match(m.svg, /^<svg[^>]+viewBox/); assert.equal((m.svg.match(/class="pm-node /g) || []).length, PARTS.length + 1);
  assert(!m.svg.includes('bronze → silver'), 'locked parts show only their name');
  for (const id of g.sections.find(s => s.id === 'setup').blocks.filter(b => b.t === 'check').flatMap(b => b.items.map(i => i.id))) state = setTick(state, id, true);
  p = guideProgress(g, state);
  m = pipelineMap(p, { lockOn: true, lockedBy, seen: new Set() });
  assert.equal(m.built, 1); assert.equal(m.states.setup, 'done'); assert.equal(m.states.latest, 'now');
  assert.deepEqual(m.fresh, ['setup'], 'a part finished since the last visit gets the unlock animation');
  assert.match(m.svg, /pm-edge next/, 'the line into the next part is drawn');
  assert.deepEqual(pipelineMap(p, { lockOn: true, lockedBy, seen: new Set(['setup']) }).fresh, []);
  const open = partStates(p, false, lockedBy);
  assert.equal(open.s5, 'open', 'with the lock off nothing is locked');
  assert(!/[<>]script/i.test(m.svg));
});

test('the proof and map modules are served, precached and loaded by the guide', async () => {
  const read = f => fs.readFile(new URL(f, root), 'utf8');
  const [guide, serve, server, config] = await Promise.all(['etl-guide.mjs', 'tools/serve.mjs', 'py/server.py', 'config.js'].map(read));
  const c = { self: {} }; vm.runInNewContext(config, c);
  for (const f of ['etl-proof-core.mjs', 'etl-proof.mjs', 'etl-map.mjs']) {
    assert(serve.includes(`'${f}'`) && server.includes(`"${f}"`) && c.self.LFZ_CONFIG.precache.includes(f), f);
  }
  assert(c.self.LFZ_CONFIG.precache.includes('content/etl-proofs.json'));
  assert(guide.includes("fetch('content/etl-proofs.json')"));
});
