// "Know yourself" (studio.html#me): a timed video-or-reading test on real lessons, and the profile it builds.
// The test runs one lesson at a time: study (timed) → 2-minute recall typed here → tick the lines the
// transcript supports. Results stay in this browser and sync to the visitor's own gist; rules in self-core.mjs.
import { SELF_KEY, DRAFT_KEY, RECALL_SECONDS, SPEEDS, STANDARD, emptySelf, addRun, deleteRun, scoreRun, profile, recallLines } from './self-core.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const day = at => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const NAME = { video: 'Watch', reading: 'Read' };
let ticker = null;

export const selfState = () => read(SELF_KEY, null) || emptySelf();
/** For other pages (the ETL guide): 'video', 'reading', 'tie' or null. */
export const preferredFormat = () => profile(selfState()).winner;

const HOW = {
  video: speed => `Open the lesson. Set the player to <b>${speed}×</b> and turn captions on. Press <b>Start studying</b> here, then press play. Watch it once from start to end: no pausing, no rewinding, no notes. Press <b>Done studying</b> when the video ends.`,
  reading: () => 'Open the lesson, <b>pause and mute</b> the video, and open the <b>Transcript</b> tab below the player. Press <b>Start studying</b> here, then read the transcript once at your own pace: no notes, and do not play the video. Press <b>Done studying</b> at the last line.'
};

export function renderSelf(el) {
  clearInterval(ticker);
  const st = selfState(), p = profile(st), draft = read(DRAFT_KEY, null);
  el.innerHTML = `
  <p class="eyebrow">PROGRESS · KNOW YOURSELF</p>
  <h1>Know yourself</h1>
  <p class="intro">Measure how <b>you</b> learn fastest, on real lessons: how many correct points you keep per 10 minutes when you watch a lesson and when you read it. Results stay in this browser (and in your own sync gist if sync is on), so everyone who uses this site gets their own profile.</p>
  ${profilePanel(p)}
  <section class="ck-panel" id="me-test"><div class="ck-head"><h2>The 25-minute test</h2><span class="muted small">four lessons · watch, read, watch, read · about 25 minutes</span></div>
    ${draft ? runner(draft) : intro()}
  </section>
  ${history(st)}
  <section class="ck-panel"><div class="ck-head"><h2>Why this test, and its limits</h2></div>
    <ul class="me-notes">
      <li>Studies that tested it found no proof that matching lessons to a person's preferred format makes them learn more. What reliably helps is testing yourself after studying, which is why the recall step is part of the test. What this page measures is your <b>speed</b>: correct points per minute of study in each format.</li>
      <li>Four lessons is a small sample. Repeat the test now and then on other material (change the lessons before you start) and the profile averages the runs and shows your trend.</li>
      <li>Be strict when you tick: a line counts only if the transcript clearly says it. Vague lines ("tables are important") do not count.</li>
    </ul>
  </section>`;
  wire(el);
  if (draft) tick(el, draft);
}

function profilePanel(p) {
  if (!p.complete) return `<section class="ck-panel me-profile"><div class="ck-head"><h2>Your learning profile</h2></div><p>No result yet. Take the 25-minute test below; the profile fills in when you finish it.</p></section>`;
  const L = p.latest, call = p.winner === 'tie' ? 'No clear winner: video and reading are within 20% for you'
    : p.winner === 'video' ? 'You learn faster from <b>video</b>' : 'You learn faster from <b>reading</b>';
  const tile = (name, s, avg) => `<div class="me-tile"><span class="ck-kicker">${name}</span><b>${s.rate}</b><span>correct points per 10 min</span><small>${s.accuracy ?? '–'}% of what you wrote was right · ${s.minutes} min studied${p.complete > 1 ? ` · average ${avg.rate}` : ''}</small></div>`;
  const how = p.winner === 'video' ? 'Default for new topics: video first at your speed, then read only the part you missed.'
    : p.winner === 'reading' ? 'Default for new topics: read first (headings, bold lines, then the rest); open a video only for a part that does not click.'
    : 'Pick whichever format you feel like that day; the recall afterwards matters more than the format.';
  const trend = p.trend ? `<p class="muted small">Since ${day(p.trend.from)}: video ${p.trend.video[0]} → ${p.trend.video[1]}, reading ${p.trend.reading[0]} → ${p.trend.reading[1]} points per 10 min.</p>` : '';
  return `<section class="ck-panel me-profile"><div class="ck-head"><h2>Your learning profile</h2><span class="muted small">${p.complete} test${p.complete > 1 ? 's' : ''} · latest ${day(L.at)} · video at ${L.speed}×</span></div>
    <p class="me-call">${call}${p.winner !== 'tie' && L.margin != null ? ` (by ${L.margin}% in your latest test)` : ''}.</p>
    <div class="me-tiles">${tile('Video', L.video, p.average.video)}${tile('Reading', L.reading, p.average.reading)}</div>
    <p>${how}</p>${trend}</section>`;
}

function intro() {
  const speed = read('lfz-self-speed', 1.5);
  return `<ol class="me-steps">
      <li><b>Open the course</b> in another tab: <a href="${esc(STANDARD.url)}" target="_blank" rel="noopener">${esc(STANDARD.course)} ↗</a> (${esc(STANDARD.where)}). You need a quiet 25 minutes and the course open on the same device.</li>
      <li><b>For each of the four lessons below</b>, this page tells you exactly what to do: study it (watch or read, timed here), then close it and type every point you remember for 2 minutes, then tick the lines the transcript supports.</li>
      <li><b>At the end</b> the page works out your points per 10 minutes for each format and saves the result to your profile.</li>
    </ol>
    <div class="table-scroll eg-table"><table><thead><tr><th scope="col">#</th><th scope="col">Lesson</th><th scope="col">How</th></tr></thead><tbody>
      ${STANDARD.lessons.map((l, i) => `<tr><td>${i + 1}</td><td><input type="text" class="me-in" data-lesson="${i}" value="${esc(l.title)}" aria-label="Lesson ${i + 1} title"><br><small class="muted">${esc(l.chapter)}</small></td><td><span class="ck-chip ${l.format === 'video' ? 'ck-learn' : 'ck-use'}">${NAME[l.format]}</span></td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Using other material? Change the course and the lesson titles first. Keep the watch / read / watch / read order and pick lessons of similar length.</p>
    <p class="me-row"><label>Course <input type="text" class="me-in wide" id="me-course" value="${esc(STANDARD.course)}"></label>
      <label>Video speed <select id="me-speed">${SPEEDS.map(s => `<option value="${s}"${s === speed ? ' selected' : ''}>${s}×</option>`).join('')}</select></label>
      <button type="button" class="primary" data-me="begin">Begin the test →</button></p>`;
}

function runner(d) {
  const l = d.plan[d.idx], n = `Lesson ${d.idx + 1} of ${d.plan.length}`;
  const head = `<p class="ck-kicker">${n} · <span class="ck-chip ${l.format === 'video' ? 'ck-learn' : 'ck-use'}">${NAME[l.format]}</span></p><h3 class="me-lesson">${esc(l.title)} <small class="muted">${esc(d.course)} · ${esc(l.chapter)}</small></h3>`;
  const cancel = `<button type="button" class="linkish" data-me="cancel">Cancel the test</button>`;
  if (d.phase === 'ready') return `<div class="ck-now me-now">${head}<p>${HOW[l.format](d.speed)}</p><p class="ck-now-act"><button type="button" class="primary" data-me="study">▶ Start studying</button> ${cancel}</p></div>`;
  if (d.phase === 'study') return `<div class="ck-now me-now learn">${head}<p class="ck-big" id="me-clock">${mmss((Date.now() - d.t0) / 1000)}</p><p>${l.format === 'video' ? 'Watching: no pausing, no notes.' : 'Reading the transcript: video paused, no notes.'}</p><p class="ck-now-act"><button type="button" class="primary" data-me="studied">■ Done studying</button> ${cancel}</p></div>`;
  if (d.phase === 'recall') return `<div class="ck-now me-now recall">${head}<p><b>Close the lesson.</b> Type every point you remember, one per line. When the 2 minutes are up, the box closes.</p><p class="ck-big" id="me-clock">${mmss((d.recallEnds - Date.now()) / 1000)}</p>
      <textarea id="me-recall" rows="8" placeholder="One point per line">${esc(d.text || '')}</textarea><p class="ck-now-act"><button type="button" data-me="recalled">I'm done early</button> ${cancel}</p></div>`;
  const lines = d.lines || [];
  return `<div class="ck-now me-now use">${head}<p><b>Open the lesson's transcript now</b> and tick each line it clearly supports. Leave vague or wrong lines unticked.</p>
    ${lines.length ? `<ul class="me-marks">${lines.map((t, i) => `<li><label><input type="checkbox" data-mark="${i}"${d.marks?.[i] ? ' checked' : ''}> <span>${esc(t)}</span></label></li>`).join('')}</ul>` : '<p class="muted">You wrote nothing down, so this lesson scores 0 points.</p>'}
    <p class="ck-now-act"><button type="button" class="primary" data-me="marked">${d.idx + 1 < d.plan.length ? 'Save and go to the next lesson →' : 'Save and see my result →'}</button> ${cancel}</p></div>`;
}

function history(st) {
  if (!st.runs.length) return '';
  const rows = st.runs.slice().sort((a, b) => b.at - a.at).map(r => {
    const s = scoreRun(r), f = x => x ? `${x.rate} <small class="muted">(${x.accuracy ?? '–'}%)</small>` : '–';
    return `<tr><td>${day(r.at)}</td><td>${esc(r.course)}</td><td>${r.speed}×</td><td>${f(s.video)}</td><td>${f(s.reading)}</td><td>${s.winner || '–'}</td><td><button type="button" class="linkish" data-del="${esc(r.id)}">Delete</button></td></tr>`;
  }).join('');
  return `<section class="ck-panel"><div class="ck-head"><h2>Your tests</h2><span class="muted small">points per 10 minutes (share of written lines that were right)</span></div>
    <div class="table-scroll eg-table"><table><thead><tr><th scope="col">Date</th><th scope="col">Material</th><th scope="col">Speed</th><th scope="col">Video</th><th scope="col">Reading</th><th scope="col">Faster</th><th scope="col" aria-label="Delete"></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function tick(el, d) {
  if (d.phase !== 'study' && d.phase !== 'recall') return;
  ticker = setInterval(() => {
    const clock = el.querySelector('#me-clock');
    if (!clock || !document.body.contains(clock)) { clearInterval(ticker); return; }
    if (d.phase === 'study') { clock.textContent = mmss((Date.now() - d.t0) / 1000); return; }
    const left = (d.recallEnds - Date.now()) / 1000;
    clock.textContent = mmss(left);
    if (left <= 0) { clearInterval(ticker); toMark(el); }
  }, 250);
}

function toMark(el) {
  const d = read(DRAFT_KEY, null); if (!d || d.phase !== 'recall') return;
  const box = el.querySelector('#me-recall');
  if (box) d.text = box.value;
  d.lines = recallLines(d.text); d.marks = d.lines.map(() => false); d.phase = 'mark';
  save(DRAFT_KEY, d); renderSelf(el);
}

function wire(el) {
  el.oninput = e => {
    if (e.target.id === 'me-recall') { const d = read(DRAFT_KEY, null); if (d) { d.text = e.target.value; save(DRAFT_KEY, d); } }
  };
  el.onchange = e => {
    const m = e.target.closest('[data-mark]');
    if (m) { const d = read(DRAFT_KEY, null); if (d) { d.marks[+m.dataset.mark] = m.checked; save(DRAFT_KEY, d); } }
    if (e.target.id === 'me-speed') save('lfz-self-speed', parseFloat(e.target.value));
  };
  el.onclick = e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      if (del.dataset.sure) { save(SELF_KEY, deleteRun(selfState(), del.dataset.del)); window.dispatchEvent(new Event('lfz-progress')); renderSelf(el); }
      else { del.dataset.sure = '1'; del.textContent = 'Delete for good?'; }
      return;
    }
    const b = e.target.closest('[data-me]'); if (!b) return;
    const act = b.dataset.me, d = read(DRAFT_KEY, null);
    if (act === 'begin') {
      const plan = STANDARD.lessons.map((l, i) => ({ ...l, title: (el.querySelector(`[data-lesson="${i}"]`)?.value || l.title).trim().slice(0, 160) || l.title }));
      const speed = parseFloat(el.querySelector('#me-speed')?.value) || 1.5;
      save(DRAFT_KEY, { id: 'run-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), course: (el.querySelector('#me-course')?.value || STANDARD.course).trim().slice(0, 160), speed, plan, idx: 0, phase: 'ready', done: [] });
      renderSelf(el); el.querySelector('#me-test')?.scrollIntoView({ block: 'start' }); return;
    }
    if (!d) { renderSelf(el); return; }
    if (act === 'cancel') {
      if (b.dataset.sure) { save(DRAFT_KEY, null); renderSelf(el); }
      else { b.dataset.sure = '1'; b.textContent = 'Cancel and lose this test?'; }
      return;
    }
    if (act === 'study') { d.phase = 'study'; d.t0 = Date.now(); }
    else if (act === 'studied') { d.seconds = Math.max(1, Math.round((Date.now() - d.t0) / 1000)); d.phase = 'recall'; d.recallEnds = Date.now() + RECALL_SECONDS * 1000; d.text = ''; }
    else if (act === 'recalled') { save(DRAFT_KEY, { ...d, text: el.querySelector('#me-recall')?.value ?? d.text }); toMark(el); return; }
    else if (act === 'marked') {
      const l = d.plan[d.idx], lines = d.lines || [];
      d.done.push({ title: l.title, chapter: l.chapter, format: l.format, seconds: d.seconds, written: lines.length, points: (d.marks || []).filter(Boolean).length });
      if (d.idx + 1 < d.plan.length) { d.idx++; d.phase = 'ready'; delete d.lines; delete d.marks; delete d.text; }
      else {
        try { save(SELF_KEY, addRun(selfState(), { id: d.id, at: Date.now(), course: d.course, speed: d.speed, lessons: d.done })); }
        catch (err) { alertInline(el, err.message); return; }
        save(DRAFT_KEY, null); window.dispatchEvent(new Event('lfz-progress')); renderSelf(el); window.scrollTo(0, 0); return;
      }
    }
    save(DRAFT_KEY, d); renderSelf(el);
    if (act === 'studied') el.querySelector('#me-recall')?.focus();
  };
}

function alertInline(el, msg) {
  const p = document.createElement('p'); p.className = 'me-error'; p.setAttribute('role', 'alert'); p.textContent = msg;
  el.querySelector('#me-test')?.prepend(p);
}
