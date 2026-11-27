// The ETL step guide in the learning desk (studio.html#etl and #etl/<section>): every step of the
// e-commerce pipeline with what you learn, the exact commands and where they run, the output you
// should see, questions with answers, and the "Done when" boxes you tick yourself. Works offline.
// Content: content/etl-guide.json (from the repository's docs and the 25 Nov review). Ticks: journey-core.mjs.
import { GUIDE_KEY, emptyGuide, guideProgress, isTicked, setTick, lockedBy, formatVerdict } from './journey-core.mjs';
import { buildPanel, current as railNow } from './rail.mjs';
import { PROOF_KEY, proofFor, kindsOf, checkPaste, recordPass, clearProof, proofComplete, emptyProofs } from './etl-proof-core.mjs';
import { repoSetting, saveRepo, runGithubChecks } from './etl-proof.mjs';
import { pipelineMap } from './etl-map.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
let guide = null, titles = null, proofs = null;
// Speedrun lock (on unless turned off with the word SKIP) and the video-or-reading test, both on this device only.
const LOCK_KEY = 'lfz-etl-lock-v1', FORMAT_KEY = 'lfz-etl-format-v1';
const lockOn = () => read(LOCK_KEY, true) !== false;
const SEEN_KEY = 'lfz-etl-map-seen-v1';
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const FT_ROWS = [['v', 'Video', 'lessons you watched'], ['r', 'Reading', 'lessons you read as text']];
function verdictText(v) {
  if (!v.winner) return 'Fill in both rows to see your result.';
  const nums = `Video ${v.video} · reading ${v.reading} points per 10 minutes.`;
  if (v.winner === 'tie') return `<b>No clear winner</b> (less than 20% apart). ${nums} Pick whichever you feel like that day: what you do after (Check yourself, closed book) matters more than the format.`;
  return v.winner === 'video'
    ? `<b>Video wins.</b> ${nums} For steps 3–9: video first at 1.5× or faster, then read only the part you missed.`
    : `<b>Reading wins.</b> ${nums} For steps 3–9: read first (headings, then bold lines, then the rest), and open a video only for a part that does not click.`;
}
function formatTest() {
  const r = read(FORMAT_KEY, {}) || {};
  const cell = (k, x) => `<input type="number" inputmode="decimal" min="0" max="600" step="0.5" data-ft="${k}${x}" value="${Number.isFinite(r[k + x]) ? r[k + x] : ''}" aria-label="${k === 'v' ? 'Video' : 'Reading'} ${x === 'Min' ? 'minutes' : 'points recalled'}">`;
  return `<div class="eg-ft"><div class="table-scroll eg-table"><table><thead><tr><th scope="col">Format</th><th scope="col">Minutes spent</th><th scope="col">Points recalled</th></tr></thead><tbody>${FT_ROWS.map(([k, name, hint]) => `<tr><td><b>${name}</b><br><small>${hint}</small></td><td>${cell(k, 'Min')}</td><td>${cell(k, 'Pts')}</td></tr>`).join('')}</tbody></table></div><p class="eg-ft-out" data-ft-out aria-live="polite">${verdictText(formatVerdict(r))}</p></div>`;
}
function loopLine() {
  const v = formatVerdict(read(FORMAT_KEY, {}) || {}).winner;
  const how = v === 'video' ? 'watch (your test: video wins)' : v === 'reading' ? 'read (your test: reading wins)' : 'watch or read';
  return `<p class="eg-loop"><b>Speedrun loop</b> <span>1 Read “What you learn”</span> <span>2 ${how}, max 45 min</span> <span>3 Run it</span> <span>4 Check yourself, closed book</span> <span>5 Prove it: paste your run, push to GitHub, tick the rest — the next step opens</span></p>`;
}
const load = async () => {
  if (!proofs) proofs = await fetch('content/etl-proofs.json').then(r => r.ok ? r.json() : { proofs: {} }).catch(() => ({ proofs: {} }));
  return guide || (guide = await fetch('content/etl-guide.json').then(r => { if (!r.ok) throw Error('The ETL guide could not load.'); return r.json(); }));
};
const topicTitles = async () => titles || (titles = await fetch('content/learning-graph.json').then(r => r.ok ? r.json() : { nodes: [] }).then(g => new Map(g.nodes.map(n => [n.id, n.title]))).catch(() => new Map()));

/** `code`, **bold** and [links](https://…) inside a line of guide text; everything else is escaped. */
export function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[\w/-]*)\)/g, (_, label, url) => `<a href="${url}"${url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${label}${url.startsWith('http') ? ' ↗' : ''}</a>`);
  return s;
}
const LANG = { powershell: 'PowerShell', python: 'Python', sql: 'SQL', bash: 'Bash', text: 'What you should see', '': 'Commands' };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function block(b, sid, state, qn) {
  switch (b.t) {
    case 'h': return `<h3 id="${sid}-${slug(b.text)}">${inline(b.text)}${b.sub ? ` <small>${inline(b.sub)}</small>` : ''}</h3>`;
    case 'p': return `<p>${inline(b.text)}</p>`;
    case 'ul': return `<ul class="eg-list">${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`;
    case 'ol': return `<ol class="eg-list">${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</ol>`;
    case 'code': return `<figure class="eg-code${b.lang === 'text' ? ' out' : ''}"><figcaption><span>${esc(LANG[b.lang] || b.lang)}</span>${b.lang === 'text' ? '' : '<button type="button" class="eg-copy" data-copy>Copy</button>'}</figcaption><pre><code>${esc(b.code)}</code></pre></figure>`;
    case 'table': return `<div class="table-scroll eg-table"><table><thead><tr>${b.rows[0].map(c => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.slice(1).map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    case 'qa': return `<p class="eg-hint">Answer out loud or on paper first, then open the answer and compare.</p><ol class="eg-qa">${b.items.map(x => `<li><details><summary>${inline(x.q)}</summary><p>${inline(x.a)}</p></details></li>`).join('')}</ol>`;
    case 'formattest': return formatTest();
    case 'check': return checkBlock(b, state);
    default: return '';
  }
}

/* ------------------------------------------------------------------ proof: run it, paste it, push it */
const proofRec = () => { const r = read(PROOF_KEY, null); return r && r.app === 'lfz-etl-proof' ? r : emptyProofs(); };
const KIND = { paste: ['▶', 'run + paste'], github: ['⎇', 'GitHub'] };
const tags = spec => kindsOf(spec).map(k => `<em class="eg-pf-tag ${k}" title="${k === 'paste' ? 'Ticks itself when you paste the output of your own run' : 'Ticks itself when your GitHub repository shows the work'}">${KIND[k][0]} ${KIND[k][1]}</em>`).join('');
function describe(c) {
  switch (c.check) {
    case 'story': return `Step ${c.step} in <code>docs/STORIES.md</code> has no “(fill in)” left`;
    case 'results': return `the “${esc(c.row)}” row in <code>docs/RESULTS.md</code> has your number`;
    case 'ci': return 'CI is green on the newest commit of <code>main</code>';
    case 'head': return 'your laptop is on the same commit as <code>main</code> on GitHub';
    default: return esc(c.say || c.check);
  }
}
const passedLine = (when, what) => `<p class="eg-pf-ok">✓ ${what} passed on ${new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.</p>`;

function proofPanel(id, spec, ticked, item, open) {
  const repo = repoSetting(); let n = 0;
  const paste = spec.paste ? `<div class="eg-pf-part" data-part="paste">
      <p class="eg-pf-step"><b>${++n} Run</b> <span>${esc(spec.paste.where || '')}</span></p>
      <figure class="eg-code"><figcaption><span>Command</span><button type="button" class="eg-copy" data-copy>Copy</button></figcaption><pre><code>${esc(spec.paste.run)}</code></pre></figure>
      <label class="eg-pf-step" for="pft-${esc(id)}"><b>${++n} Paste</b> <span>what your terminal printed (all of it is fine). It is checked here and not saved.</span></label>
      <textarea id="pft-${esc(id)}" data-pf-text rows="5" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Paste the output here. Never paste keys or passwords."></textarea>
      <p><button type="button" class="primary" data-pf-paste="${esc(id)}">Check my output</button></p>
      <div data-pf-out aria-live="polite">${item && item.paste ? passedLine(item.paste, 'Your run') : ''}</div></div>` : '';
  const gh = spec.github ? `<div class="eg-pf-part" data-part="github">
      <p class="eg-pf-step"><b>${++n} Push</b> <span>commit and push to <a href="https://github.com/${esc(repo.owner)}/${esc(repo.repo)}" target="_blank" rel="noopener">${esc(repo.owner)}/${esc(repo.repo)} ↗</a>, then check. It checks that ${spec.github.map(describe).join(', and ')}.</span></p>
      <p><button type="button"${spec.paste ? '' : ' class="primary"'} data-pf-gh="${esc(id)}">Check my GitHub</button></p>
      <div data-pf-gh-out aria-live="polite">${item && item.github ? passedLine(item.github, 'The GitHub check') : ''}</div></div>` : '';
  const sum = ticked ? '✓ Proven. Open to see the proof steps again' : `Prove it to tick: ${kindsOf(spec).map(k => KIND[k][1]).join(' and ')}`;
  return `<details class="eg-pf" id="pf-${esc(id)}"${open ? ' open' : ''}><summary>${sum}</summary>${paste}${gh}</details>`;
}

function checkBlock(b, state) {
  const rec = proofRec(); let opened = false;
  const anyProof = b.items.some(i => proofFor(proofs, i.id));
  const rows = b.items.map(i => {
    const spec = proofFor(proofs, i.id), on = isTicked(state, i.id);
    if (!spec) return `<li><label><input type="checkbox" data-tick="${esc(i.id)}"${on ? ' checked' : ''}><span>${inline(i.text)}</span></label></li>`;
    const open = !on && !opened; if (open) opened = true;
    return `<li class="eg-pf-item${on ? ' ok' : ''}" data-pf-item="${esc(i.id)}"><label><input type="checkbox" data-tick="${esc(i.id)}" data-proof${on ? ' checked' : ' disabled'} aria-describedby="pf-${esc(i.id)}"><span>${inline(i.text)} ${tags(spec)}</span></label>
      ${proofPanel(i.id, spec, on, rec.items[i.id], open)}</li>`;
  }).join('');
  return `${anyProof ? '<p class="eg-hint eg-pf-hint">Boxes marked <b>▶ run + paste</b> tick themselves when you paste the output of your own run; <b>⎇ GitHub</b> when your repository on GitHub shows the work. You tick the rest yourself, honestly.</p>' : ''}<ul class="eg-ticks">${rows}</ul>`;
}

/* ------------------------------------------------------------------ the growing pipeline map */
function mapFor(p) {
  let seen = null; try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); if (Array.isArray(v)) seen = new Set(v); } catch { /* first visit */ }
  const m = pipelineMap(p, { lockOn: lockOn(), lockedBy, seen });
  // Remember what was shown, after the unlock animation has had time to play.
  const done = Object.entries(m.states).filter(([, st]) => st === 'done').map(([id]) => id);
  setTimeout(() => save(SEEN_KEY, done), m.fresh.length ? 2500 : 0);
  return m;
}
const legend = '<p class="pm-legend"><span class="pm-key done">✓ built</span><span class="pm-key now">NOW</span><span class="pm-key open">open</span><span class="pm-key locked">🔒 locked</span></p>';
function mapCard(p) {
  const m = mapFor(p);
  return `<div class="eg-map" data-map><p class="eyebrow">YOUR PIPELINE</p><h2>${m.built} of ${m.total} parts built</h2>
    <p class="eg-map-note">Each step you finish adds its part. Tap a part to open it.</p>${m.svg}${legend}</div>`;
}
function miniMap(p, open = false) {
  const m = mapFor(p);
  return `<details class="eg-mapmini" data-map${open ? ' open' : ''}><summary>🗺 Your pipeline: ${m.built} of ${m.total} parts built</summary>${m.svg}${legend}</details>`;
}

/* ------------------------------------------------------------------ cards */
function stateOf(s, p, nextId) {
  const x = p.sections.find(y => y.id === s.id);
  return x.total && x.done === x.total ? 'done' : lockOn() && lockedBy(p, s.id) ? 'locked' : !x.total ? 'read-once' : s.id === nextId ? 'now' : '';
}
function sectionCard(s, p, nextId) {
  const x = p.sections.find(y => y.id === s.id), pc = x.total ? Math.round(100 * x.done / x.total) : 0;
  const state = stateOf(s, p, nextId);
  const locked = state === 'locked';
  return `<li class="eg-card ${state}"><a href="#etl/${esc(s.id)}"><span class="eg-num">${s.kind === 'step' ? s.n : s.kind === 'intro' ? 'i' : s.kind === 'setup' ? '⚙' : '+'}</span>
    <span class="eg-card-main"><b>${esc(s.title)}</b>${locked ? '' : `<small>${inline(s.summary || '')}</small>`}
    ${locked ? '' : x.total ? `<span class="eg-card-meter"><span class="jr-meter use"><i style="width:${pc}%"></i></span><em>${x.done}/${x.total}</em></span>` : '<span class="eg-card-meter"><em>read once</em></span>'}</span>
    ${state === 'now' ? '<span class="eg-badge">continue</span>' : state === 'done' ? '<span class="eg-badge ok">done</span>' : locked ? '<span class="eg-badge lock">🔒 locked</span>' : ''}</a></li>`;
}
function proofCount(s, state) {
  const ids = s.blocks.filter(b => b.t === 'check').flatMap(b => b.items.map(i => i.id));
  const need = ids.filter(id => proofFor(proofs, id));
  return { need: need.length, done: need.filter(id => isTicked(state, id)).length };
}
function nowCard(g, p, state) {
  const s = p.next && g.sections.find(x => x.id === p.next.id);
  if (!s) return `<div class="eg-now done"><p class="eyebrow">ALL DONE</p><h2>Every step is built and proven 🎉</h2><p>Re-run the numbers on your own machine before an interview, and keep RESULTS.md and STORIES.md current.</p></div>`;
  const x = p.sections.find(y => y.id === s.id), pc = x.total ? Math.round(100 * x.done / x.total) : 0, pf = proofCount(s, state);
  const intro = g.sections.find(y => y.kind === 'intro');
  return `<div class="eg-now"><p class="eyebrow">DO THIS NOW${s.minutes ? ` · ABOUT ${s.minutes} MIN` : ''}</p>
    <h2>${s.kind === 'step' ? `Step ${s.n}: ` : ''}${esc(s.title)}</h2><p>${inline(s.summary || '')}</p>
    <div class="eg-progress"><span class="jr-meter use big"><i style="width:${pc}%"></i></span><span><b>${x.done} of ${x.total}</b> boxes${pf.need ? ` · ${pf.done} of ${pf.need} proven` : ''}</span></div>
    <p class="eg-actions"><a class="button primary" href="#etl/${esc(s.id)}">Open ${esc(s.short)} →</a>${intro && s.id !== intro.id ? ` <a class="button" href="#etl/${esc(intro.id)}">${esc(intro.title)} (read once)</a>` : ''}</p>
    <p class="eg-now-how"><b>Done</b> means: you ran it on your laptop, pasted the output here, and pushed your work to GitHub. Then the next part of the map unlocks.</p></div>`;
}
const soonItem = x => `<li><a href="#etl/${esc(x.id)}">🔒 <b>${esc(x.kind === 'step' ? 'Step ' + x.n : x.short)}</b> ${esc(x.title)}</a></li>`;
function repoControl() {
  const r = repoSetting();
  return `<details class="eg-lockctl eg-repoctl"><summary>⎇ Proofs read github.com/${esc(r.owner)}/${esc(r.repo)}</summary>
    <p>Change it only if your copy of the project lives somewhere else (it must be public). <input type="text" data-repo value="${esc(r.owner + '/' + r.repo)}" aria-label="Your repository, owner/name" autocomplete="off" spellcheck="false"> <button type="button" data-repo-save>Save</button> <span data-repo-out aria-live="polite"></span></p></details>`;
}

export async function renderGuide(screen, hash) {
  let g;
  try { g = await load(); } catch (e) { screen.innerHTML = `<h1>ETL step guide</h1><p>${esc(e.message)} It needs one online visit before it works offline.</p>`; return; }
  const state = read(GUIDE_KEY, null) || emptyGuide(), names = await topicTitles();
  const p = guideProgress(g, state), id = hash.split('/')[1] || '';
  const s = g.sections.find(x => x.id === id);
  if (!s) {
    const head = `<div class="eg-top"><div><p class="eyebrow">PROJECTS · E-COMMERCE ETL PIPELINE</p><h1>ETL step guide</h1>
        <p class="intro">One step at a time: run it on your laptop, paste what it printed, push your work to GitHub. Each step you finish adds its part to your pipeline map and opens the next one. Ticks sync across devices.</p>
        <p class="eg-actions"><a class="button primary" href="#etl/${esc(p.next?.id || 'start')}">${p.done ? 'Continue' : 'Start'}: ${esc(p.next?.short || 'Start here')} →</a> <a class="button" href="${esc(g.repo)}" target="_blank" rel="noopener">The repository ↗</a> <a class="button" href="index.html#/etl?goal=whole">Topics each step needs</a></p></div>
      <aside class="eg-aside" data-journey="build-compact"></aside></div>`;
    if (lockOn()) {
      const done = g.sections.filter(x => stateOf(x, p, p.next?.id) === 'done');
      const soon = g.sections.filter(x => stateOf(x, p, p.next?.id) === 'locked');
      screen.innerHTML = `${head}<section class="eg-focus">${mapCard(p)}${nowCard(g, p, state)}</section>
        ${lockControl()}${repoControl()}
        ${done.length ? `<details class="eg-donebox"><summary>Done (${done.length})</summary><ol class="eg-cards">${done.map(x => sectionCard(x, p, p.next?.id)).join('')}</ol></details>` : ''}
        ${soon.length ? `<h2 class="eg-h2">Coming up</h2><ol class="eg-soon">${soon.slice(0, 2).map(soonItem).join('')}</ol>${soon.length > 2 ? `<details class="eg-donebox"><summary>${soon.length - 2} more locked</summary><ol class="eg-soon">${soon.slice(2).map(soonItem).join('')}</ol></details>` : ''}` : ''}`;
    } else {
      screen.innerHTML = `${head}<section class="eg-focus">${mapCard(p)}${nowCard(g, p, state)}</section>${lockControl()}${repoControl()}
        <ol class="eg-cards">${g.sections.map(x => sectionCard(x, p, p.next?.id)).join('')}</ol>`;
    }
    fill(screen); return;
  }
  const i = g.sections.indexOf(s), prev = g.sections[i - 1], next = g.sections[i + 1];
  const chips = `<nav class="eg-crumbs" aria-label="Guide sections"><a href="#etl">← All steps</a><span class="eg-chips">${g.sections.map(y => { const q = p.sections.find(z => z.id === y.id); const lk = lockOn() && !(q.total && q.done === q.total) && lockedBy(p, y.id); return `<a href="#etl/${esc(y.id)}"${y.id === s.id ? ' aria-current="page"' : ''} class="${q.total && q.done === q.total ? 'done' : lk ? 'locked' : ''}">${lk ? '🔒 ' : ''}${esc(y.short)}</a>`; }).join('')}</span></nav>`;
  const blocker = lockOn() ? lockedBy(p, s.id) : null;
  if (blocker) {
    screen.innerHTML = `${chips}<div class="eg-layout"><article class="eg-main">
      <p class="eyebrow">${s.kind === 'step' ? `STEP ${s.n} OF 11` : 'LOCKED'}</p><h1>${esc(s.title)}</h1>
      <div class="eg-locked"><p><b>🔒 Locked.</b> One step at a time, in order. Finish <b>${esc(blocker.short)}: ${esc(blocker.title)}</b> first: ${blocker.done} of ${blocker.total} boxes done.</p>
      <p><a class="button primary" href="#etl/${esc(blocker.id)}">Go to ${esc(blocker.short)} →</a></p></div>
      ${miniMap(p, true)}
    </article><aside class="eg-aside"><div data-journey="build-compact"></div></aside></div>`;
    fill(screen); return;
  }
  const x = p.sections.find(y => y.id === s.id), pc = x.total ? Math.round(100 * x.done / x.total) : 0;
  const heads = s.blocks.filter(b => b.t === 'h').map(b => `<li><a href="#etl/${esc(s.id)}" data-jump="${esc(s.id + '-' + slug(b.text))}">${inline(b.text)}</a></li>`).join('');
  const topics = (s.topics || []).length ? `<p class="eg-topics">Topics this step needs: ${s.topics.map(t => `<a href="#topic/${esc(t)}">${esc(names.get(t) || t)}</a>`).join(' · ')}</p>` : '';
  const pf = proofCount(s, state);
  let qn = 0;
  screen.innerHTML = `${chips}
    <div class="eg-layout"><article class="eg-main" data-section="${esc(s.id)}">
      <p class="eyebrow">${s.kind === 'step' ? `STEP ${s.n} OF 11` : s.kind === 'setup' ? 'BEFORE THE STEPS' : s.kind === 'intro' ? 'READ ONCE' : 'AFTER THE STEPS'}${s.minutes ? ` · ABOUT ${s.minutes} MIN` : ''}</p>
      <h1>${esc(s.title)}</h1><p class="intro">${inline(s.summary || '')}</p>
      ${x.total ? `<div class="eg-progress"><span class="jr-meter use big"><i style="width:${pc}%"></i></span><span><b id="eg-count">${x.done} of ${x.total}</b> boxes done${pf.need ? ` · <span id="eg-pfcount">${pf.done} of ${pf.need}</span> proven` : ''}</span></div>` : ''}
      <div data-celebrate>${x.total && x.done === x.total ? celebrate(g, s) : ''}</div>
      ${pf.need ? `<p class="eg-pf-jump"><a href="#etl/${esc(s.id)}" data-jump-proof>Jump to “Done when” and prove it ↓</a></p>` : ''}
      ${miniMap(p)}
      <p class="eg-actions">${s.kind === 'step' || s.kind === 'setup' ? `<button type="button" class="primary" data-coach-start data-kind="use" data-plan="25,5,2" data-link="s:#etl/${esc(s.id)}" data-title="ETL ${esc(s.short)}: ${esc(s.title)}">▶ Start 2 × 25 min on this</button>` : ''}${s.note ? `<a class="button" href="${esc(s.note)}" target="_blank" rel="noopener">Full study note ↗</a>` : ''}</p>
      ${s.kind === 'step' ? loopLine() : ''}
      ${topics}
      ${s.blocks.map(b => block(b, s.id, state, qn++)).join('\n')}
      <nav class="eg-pager">${prev ? `<a class="button" href="#etl/${esc(prev.id)}">← ${esc(prev.short)}</a>` : '<span></span>'}${next ? `<a class="button primary" href="#etl/${esc(next.id)}">${esc(next.short)}: ${esc(next.title)} →</a>` : '<a class="button" href="#etl">All steps</a>'}</nav>
    </article>
    <aside class="eg-aside">${heads ? `<div class="eg-toc"><p class="eyebrow">ON THIS PAGE</p><ol>${heads}</ol></div>` : ''}<div data-journey="build-compact"></div></aside></div>`;
  fill(screen);
  screen.onchange = onTick;
  screen.oninput = onFormat;
}

function celebrate(g, s) {
  const i = g.sections.indexOf(s), next = g.sections.slice(i + 1).find(y => (y.blocks || []).some(b => b.t === 'check'));
  return `<div class="eg-unlocked" role="status"><p><b>✓ ${esc(s.kind === 'step' ? 'Step ' + s.n : s.short)} is done.</b> ${next ? `Its part is on your map, and <b>${esc(next.kind === 'step' ? 'Step ' + next.n : next.short)}: ${esc(next.title)}</b> is unlocked.` : 'That was the last one.'}</p>
    ${next ? `<p><a class="button primary" href="#etl/${esc(next.id)}">Open ${esc(next.short)} →</a> <a class="button" href="#etl">See the map</a></p>` : '<p><a class="button primary" href="#etl">See your whole pipeline</a></p>'}</div>`;
}

function lockControl() {
  return lockOn()
    ? `<details class="eg-lockctl"><summary>🔒 Speedrun lock is on: each step opens when the one before is done and proven</summary><p>To turn it off, type <b>SKIP</b> and press the button. Then every step opens and nothing stops you skipping. Proof boxes still need proof.</p><p><input type="text" data-lock-word aria-label="Type SKIP to turn the lock off" autocomplete="off"> <button type="button" data-lock-off>Turn the lock off</button></p></details>`
    : `<details class="eg-lockctl" open><summary>🔓 Speedrun lock is off</summary><p><button type="button" class="primary" data-lock-on>Turn the lock back on</button></p></details>`;
}

function onFormat(e) {
  const box = e.target.closest('[data-ft]'); if (!box) return;
  const r = read(FORMAT_KEY, {}) || {}, n = parseFloat(box.value);
  if (Number.isFinite(n) && n >= 0 && n <= 600) r[box.dataset.ft] = n; else delete r[box.dataset.ft];
  save(FORMAT_KEY, r);
  const out = e.currentTarget.querySelector('[data-ft-out]'); if (out) out.innerHTML = verdictText(formatVerdict(r));
}

const list = (items, cls) => `<ul class="eg-pf-list ${cls || ''}">${items.map(i => `<li class="${i.ok ? 'ok' : 'no'}">${i.ok ? '✓' : '✗'} ${esc(i.say)}</li>`).join('')}</ul>`;

function fill(screen) {
  const s = railNow();
  screen.querySelectorAll('[data-journey="build-compact"]').forEach(el => { if (s) el.innerHTML = buildPanel(s, { tiles: false }); });
  screen.onclick = e => {
    const c = e.target.closest('[data-copy]');
    if (c) { const code = c.closest('figure').querySelector('code').textContent; navigator.clipboard?.writeText(code).then(() => { c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1500); }, () => { c.textContent = 'Select and copy'; }); return; }
    if (e.target.closest('[data-lock-off]')) {
      const w = screen.querySelector('[data-lock-word]');
      if ((w?.value || '').trim().toUpperCase() !== 'SKIP') { w?.focus(); if (w) w.placeholder = 'type SKIP'; return; }
      save(LOCK_KEY, false); renderGuide(screen, location.hash.slice(1)); return;
    }
    if (e.target.closest('[data-lock-on]')) { save(LOCK_KEY, true); renderGuide(screen, location.hash.slice(1)); return; }
    if (e.target.closest('[data-repo-save]')) {
      const v = screen.querySelector('[data-repo]'), out = screen.querySelector('[data-repo-out]');
      const r = saveRepo(v?.value);
      if (out) out.textContent = r ? `Saved: proofs now read ${r.owner}/${r.repo}.` : 'Write it as owner/name, for example manojhunasimarad/ETL.';
      if (r) setTimeout(() => renderGuide(screen, location.hash.slice(1)), 900);
      return;
    }
    const pp = e.target.closest('[data-pf-paste]'); if (pp) { onPaste(screen, pp); return; }
    const pg = e.target.closest('[data-pf-gh]'); if (pg) { onGithub(screen, pg); return; }
    if (e.target.closest('[data-jump-proof]')) { e.preventDefault(); const t = screen.querySelector('.eg-pf-item:not(.ok)') || screen.querySelector('.eg-ticks'); t?.scrollIntoView({ behavior: 'smooth', block: 'start' }); const d = t?.querySelector('details'); if (d) d.open = true; return; }
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
}

function onPaste(screen, btn) {
  const id = btn.dataset.pfPaste, spec = proofFor(proofs, id); if (!spec?.paste) return;
  const part = btn.closest('[data-part]'), ta = part.querySelector('[data-pf-text]'), out = part.querySelector('[data-pf-out]');
  const res = checkPaste(spec.paste, ta.value, repoSetting());
  if (res.secret) ta.value = '';
  if (!res.ok) {
    out.innerHTML = `${res.problems.map(p => `<p class="eg-pf-bad">${esc(p)}</p>`).join('')}${res.items.length && !res.secret ? `<p class="eg-pf-lead">Not yet. What your output shows:</p>${list(res.items)}` : ''}${res.hints.map(h => `<p class="eg-pf-hintline">💡 ${esc(h)}</p>`).join('')}`;
    return;
  }
  const rec = recordPass(proofRec(), id, 'paste', res.sha ? { sha: res.sha } : {});
  save(PROOF_KEY, rec);
  ta.value = '';
  const rest = spec.github ? '<p class="eg-pf-lead">Your run is proven. Now push and press <b>Check my GitHub</b> below.</p>' : '';
  out.innerHTML = `<p class="eg-pf-ok">✓ Your run matches.</p>${list(res.items, 'ok')}${rest}`;
  if (proofComplete(spec, rec.items[id])) proveTick(screen, id);
}

async function onGithub(screen, btn) {
  const id = btn.dataset.pfGh, spec = proofFor(proofs, id); if (!spec?.github) return;
  const out = btn.closest('[data-part]').querySelector('[data-pf-gh-out]'), rec0 = proofRec();
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Checking GitHub…'; out.innerHTML = '';
  try {
    const res = await runGithubChecks(spec.github, proofs.files || {}, { sha: rec0.items[id]?.sha });
    if (!res.ok) { out.innerHTML = `<p class="eg-pf-lead">Not yet, on <a href="https://github.com/${esc(res.repo.owner)}/${esc(res.repo.repo)}/tree/${esc(res.sha)}" target="_blank" rel="noopener">${esc(res.sha.slice(0, 7))} ↗</a>:</p>${list(res.results.map(r => ({ ok: r.ok, say: r.say })))}`; return; }
    const rec = recordPass(proofRec(), id, 'github', { at_sha: res.sha.slice(0, 12) });
    save(PROOF_KEY, rec);
    out.innerHTML = `<p class="eg-pf-ok">✓ GitHub shows it (commit ${esc(res.sha.slice(0, 7))}).</p>${list(res.results, 'ok')}${spec.paste && !rec.items[id]?.paste ? '<p class="eg-pf-lead">Now run it and paste your output above.</p>' : ''}`;
    if (proofComplete(spec, rec.items[id])) proveTick(screen, id);
  } catch (err) {
    out.innerHTML = `<p class="eg-pf-bad">${esc(err.message)}</p>`;
  } finally { btn.disabled = false; btn.textContent = label; }
}

/** A proof passed in full: tick the box, as if the learner had ticked it. */
function proveTick(screen, id) {
  const box = screen.querySelector(`[data-tick="${CSS.escape(id)}"]`);
  if (!box || box.checked) return;
  box.disabled = false; box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

function onTick(e) {
  const box = e.target.closest('[data-tick]'); if (!box) return;
  const id = box.dataset.tick, spec = proofFor(proofs, id);
  if (spec && box.checked && !proofComplete(spec, proofRec().items[id])) { box.checked = false; box.disabled = true; return; }
  const state = setTick(read(GUIDE_KEY, null) || emptyGuide(), id, box.checked);
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify(state)); } catch { box.checked = !box.checked; return; }
  if (spec) {
    const li = box.closest('.eg-pf-item');
    if (!box.checked) { save(PROOF_KEY, clearProof(proofRec(), id)); box.disabled = true; li?.querySelectorAll('[data-pf-out],[data-pf-gh-out]').forEach(o => { o.innerHTML = ''; }); }
    li?.classList.toggle('ok', box.checked);
    const sum = li?.querySelector('summary'); if (sum) sum.textContent = box.checked ? '✓ Proven. Open to see the proof steps again' : `Prove it to tick: ${kindsOf(spec).map(k => KIND[k][1]).join(' and ')}`;
  }
  const sec = location.hash.split('/')[1];
  if (guide) {
    const p = guideProgress(guide, state), x = p.sections.find(y => y.id === sec);
    const count = document.getElementById('eg-count'); if (x && count) { count.textContent = `${x.done} of ${x.total}`; const m = count.closest('.eg-progress')?.querySelector('i'); if (m) m.style.width = `${Math.round(100 * x.done / x.total)}%`; }
    const s = guide.sections.find(y => y.id === sec);
    const pfc = document.getElementById('eg-pfcount'); if (s && pfc) { const c = proofCount(s, state); pfc.textContent = `${c.done} of ${c.need}`; }
    const slot = document.querySelector('[data-celebrate]');
    if (s && x && slot) {
      const complete = x.total && x.done === x.total;
      slot.innerHTML = complete ? celebrate(guide, s) : '';
      const mm = document.querySelector('.eg-mapmini');
      if (mm) { const open = mm.open || complete; mm.outerHTML = miniMap(p, open); }
      if (complete) slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  window.dispatchEvent(new Event('lfz-progress'));
}
