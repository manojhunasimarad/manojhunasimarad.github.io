// The ETL step guide in the learning desk (studio.html#etl and #etl/<section>): every step of the
// e-commerce pipeline with what you learn, the exact commands and where they run, the output you
// should see, questions with answers, and the "Done when" boxes you tick yourself. Works offline.
// Content: content/etl-guide.json (from the repository's docs and the 25 Nov review). Ticks: journey-core.mjs.
import { GUIDE_KEY, emptyGuide, guideProgress, isTicked, setTick, lockedBy, formatVerdict } from './journey-core.mjs';
import { buildPanel, current as railNow } from './rail.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
let guide = null, titles = null;
// Speedrun lock (on unless turned off with the word SKIP) and the video-or-reading test, both on this device only.
const LOCK_KEY = 'lfz-etl-lock-v1', FORMAT_KEY = 'lfz-etl-format-v1';
const lockOn = () => read(LOCK_KEY, true) !== false;
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
  return `<p class="eg-loop"><b>Speedrun loop</b> <span>1 Read “What you learn”</span> <span>2 ${how}, max 45 min</span> <span>3 Run it</span> <span>4 Check yourself, closed book</span> <span>5 Tick “Done when”: the next step opens</span></p>`;
}
const load = async () => guide || (guide = await fetch('content/etl-guide.json').then(r => { if (!r.ok) throw Error('The ETL guide could not load.'); return r.json(); }));
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
    case 'check': return `<ul class="eg-ticks">${b.items.map(i => `<li><label><input type="checkbox" data-tick="${esc(i.id)}"${isTicked(state, i.id) ? ' checked' : ''}><span>${inline(i.text)}</span></label></li>`).join('')}</ul>`;
    default: return '';
  }
}

function sectionCard(s, p, nextId) {
  const x = p.sections.find(y => y.id === s.id), pc = x.total ? Math.round(100 * x.done / x.total) : 0;
  const state = x.total && x.done === x.total ? 'done' : lockOn() && lockedBy(p, s.id) ? 'locked' : !x.total ? 'read-once' : s.id === nextId ? 'now' : '';
  return `<li class="eg-card ${state}"><a href="#etl/${esc(s.id)}"><span class="eg-num">${s.kind === 'step' ? s.n : s.kind === 'intro' ? 'i' : s.kind === 'setup' ? '⚙' : '+'}</span>
    <span class="eg-card-main"><b>${esc(s.title)}</b><small>${inline(s.summary || '')}</small>
    ${x.total ? `<span class="eg-card-meter"><span class="jr-meter use"><i style="width:${pc}%"></i></span><em>${x.done}/${x.total}</em></span>` : '<span class="eg-card-meter"><em>read once</em></span>'}</span>
    ${state === 'now' ? '<span class="eg-badge">continue</span>' : state === 'done' ? '<span class="eg-badge ok">done</span>' : state === 'locked' ? '<span class="eg-badge lock">🔒 locked</span>' : ''}</a></li>`;
}

export async function renderGuide(screen, hash) {
  let g;
  try { g = await load(); } catch (e) { screen.innerHTML = `<h1>ETL step guide</h1><p>${esc(e.message)} It needs one online visit before it works offline.</p>`; return; }
  const state = read(GUIDE_KEY, null) || emptyGuide(), names = await topicTitles();
  const p = guideProgress(g, state), id = hash.split('/')[1] || '';
  const s = g.sections.find(x => x.id === id);
  if (!s) {
    screen.innerHTML = `<div class="eg-top"><div><p class="eyebrow">PROJECTS · E-COMMERCE ETL PIPELINE</p><h1>ETL step guide</h1>
        <p class="intro">Every step of your pipeline: what you learn, the exact commands and where they run, the output you should see, questions with answers, and boxes you tick when you have done it yourself. Your ticks sync across devices.</p>
        <p class="eg-actions"><a class="button primary" href="#etl/${esc(p.next?.id || 'start')}">${p.done ? 'Continue' : 'Start'}: ${esc(p.next?.short || 'Start here')} →</a> <a class="button" href="${esc(g.repo)}" target="_blank" rel="noopener">The repository ↗</a> <a class="button" href="index.html#/etl?goal=whole">Topics each step needs</a></p></div>
      <aside class="eg-aside" data-journey="build-compact"></aside></div>
      ${lockControl()}
      <ol class="eg-cards">${g.sections.map(x => sectionCard(x, p, p.next?.id)).join('')}</ol>`;
    fill(screen); return;
  }
  const i = g.sections.indexOf(s), prev = g.sections[i - 1], next = g.sections[i + 1];
  const chips = `<nav class="eg-crumbs" aria-label="Guide sections"><a href="#etl">← All steps</a><span class="eg-chips">${g.sections.map(y => { const q = p.sections.find(z => z.id === y.id); const lk = lockOn() && !(q.total && q.done === q.total) && lockedBy(p, y.id); return `<a href="#etl/${esc(y.id)}"${y.id === s.id ? ' aria-current="page"' : ''} class="${q.total && q.done === q.total ? 'done' : lk ? 'locked' : ''}">${lk ? '🔒 ' : ''}${esc(y.short)}</a>`; }).join('')}</span></nav>`;
  const blocker = lockOn() ? lockedBy(p, s.id) : null;
  if (blocker) {
    screen.innerHTML = `${chips}<div class="eg-layout"><article class="eg-main">
      <p class="eyebrow">${s.kind === 'step' ? `STEP ${s.n} OF 11` : 'LOCKED'}</p><h1>${esc(s.title)}</h1><p class="intro">${inline(s.summary || '')}</p>
      <div class="eg-locked"><p><b>🔒 Locked.</b> Speedrun rule: one step at a time, in order. Finish <b>${esc(blocker.short)}: ${esc(blocker.title)}</b> first: ${blocker.done} of ${blocker.total} boxes ticked.</p>
      <p><a class="button primary" href="#etl/${esc(blocker.id)}">Go to ${esc(blocker.short)} →</a></p></div>
    </article><aside class="eg-aside"><div data-journey="build-compact"></div></aside></div>`;
    fill(screen); return;
  }
  const x = p.sections.find(y => y.id === s.id), pc = x.total ? Math.round(100 * x.done / x.total) : 0;
  const heads = s.blocks.filter(b => b.t === 'h').map(b => `<li><a href="#etl/${esc(s.id)}" data-jump="${esc(s.id + '-' + slug(b.text))}">${inline(b.text)}</a></li>`).join('');
  const topics = (s.topics || []).length ? `<p class="eg-topics">Topics this step needs: ${s.topics.map(t => `<a href="#topic/${esc(t)}">${esc(names.get(t) || t)}</a>`).join(' · ')}</p>` : '';
  let qn = 0;
  screen.innerHTML = `${chips}
    <div class="eg-layout"><article class="eg-main">
      <p class="eyebrow">${s.kind === 'step' ? `STEP ${s.n} OF 11` : s.kind === 'setup' ? 'BEFORE THE STEPS' : s.kind === 'intro' ? 'READ ONCE' : 'AFTER THE STEPS'}${s.minutes ? ` · ABOUT ${s.minutes} MIN` : ''}</p>
      <h1>${esc(s.title)}</h1><p class="intro">${inline(s.summary || '')}</p>
      ${x.total ? `<div class="eg-progress"><span class="jr-meter use big"><i style="width:${pc}%"></i></span><span><b id="eg-count">${x.done} of ${x.total}</b> boxes ticked</span></div>` : ''}
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

function lockControl() {
  return lockOn()
    ? `<details class="eg-lockctl"><summary>🔒 Speedrun lock is on: each step opens when the one before is fully ticked</summary><p>To turn it off, type <b>SKIP</b> and press the button. Then every step opens and nothing stops you skipping.</p><p><input type="text" data-lock-word aria-label="Type SKIP to turn the lock off" autocomplete="off"> <button type="button" data-lock-off>Turn the lock off</button></p></details>`
    : `<details class="eg-lockctl" open><summary>🔓 Speedrun lock is off</summary><p><button type="button" class="primary" data-lock-on>Turn the lock back on</button></p></details>`;
}

function onFormat(e) {
  const box = e.target.closest('[data-ft]'); if (!box) return;
  const r = read(FORMAT_KEY, {}) || {}, n = parseFloat(box.value);
  if (Number.isFinite(n) && n >= 0 && n <= 600) r[box.dataset.ft] = n; else delete r[box.dataset.ft];
  save(FORMAT_KEY, r);
  const out = e.currentTarget.querySelector('[data-ft-out]'); if (out) out.innerHTML = verdictText(formatVerdict(r));
}

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
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
}

function onTick(e) {
  const box = e.target.closest('[data-tick]'); if (!box) return;
  const state = setTick(read(GUIDE_KEY, null) || emptyGuide(), box.dataset.tick, box.checked);
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify(state)); } catch { box.checked = !box.checked; return; }
  const sec = location.hash.split('/')[1];
  if (guide) {
    const x = guideProgress(guide, state).sections.find(y => y.id === sec);
    const count = document.getElementById('eg-count'); if (x && count) { count.textContent = `${x.done} of ${x.total}`; const m = count.closest('.eg-progress')?.querySelector('i'); if (m) m.style.width = `${Math.round(100 * x.done / x.total)}%`; }
  }
  window.dispatchEvent(new Event('lfz-progress'));
}
