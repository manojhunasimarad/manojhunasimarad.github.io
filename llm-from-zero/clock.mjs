// The Study clock page in the learning desk (studio.html#clock): what to do now, the week's
// learn → recall → use timetable built from your routine, the timer with body breaks, and the
// calendar file / phone alarms that put it on your real clock. Pure logic is in clock-core.mjs.
import { DAY, KINDS, BODY, RECALL, DEFAULTS, normalise, buildWeek, weekMinutes, nowAndNext, alarmList, weekIcs, startTimer, remaining, mmss, toMin } from './clock-core.mjs';
import { href, TIMER_KEY, RECENT_KEY } from './site-nav.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const SETTINGS = 'lfz-clock-settings';
const link = to => href(to, 'studio');
const dur = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
const chip = kind => `<span class="ck-chip ck-${KINDS[kind].colour}">${esc(KINDS[kind].name)}</span>`;
let ticker = null, onClock = null;

export function renderClock(el) {
  clearInterval(ticker);
  const s = normalise(read(SETTINGS, DEFAULTS)), week = buildWeek(s), now = new Date();
  const today = now.getDay(), recent = read(RECENT_KEY, []);
  const dayRow = d => week.filter(b => b.day === d).map(b => `<li class="ck-b ck-${KINDS[b.kind].colour}"><span class="ck-t">${b.start}–${b.end}</span><a href="${esc(link(b.link))}">${esc(b.title)}</a></li>`).join('');
  const tick = (name, list, label) => `<fieldset class="ck-days"><legend>${label}</legend>${DAY.map((d, i) => `<label><input type="checkbox" name="${name}" value="${i}"${list.includes(i) ? ' checked' : ''}> ${d}</label>`).join('')}</fieldset>`;
  const bodyCard = x => `<article class="ck-tip"><h3>${esc(x.title)}${x.mins ? ` <span class="muted small">${x.mins} min</span>` : ''}</h3><p>${esc(x.how)}</p></article>`;
  el.innerHTML = `
  <p class="eyebrow">TODAY · STUDY CLOCK</p>
  <h1>Study clock</h1>
  <p class="intro">Every day follows the same loop: <b>learn</b> something new, <b>recall</b> it from memory, then <b>use</b> it. This page tells you which step is due now, runs the timer with short body breaks, and puts the week on your phone's or laptop's calendar so it rings at the right time.</p>
  <section class="ck-now" id="ck-now" aria-live="polite"></section>
  <section class="ck-loop" aria-label="The daily loop">
    <a class="ck-step ck-learn" href="${esc(link('s:#library'))}"><span class="ck-n" aria-hidden="true">1</span><b>Learn</b><span>Read or listen to one lesson. Before you start, retest yesterday for 3 minutes. While reading, write 3 questions.</span><em>Learn &amp; listen →</em></a>
    <a class="ck-step ck-recall" href="${esc(link('p:#/recall'))}"><span class="ck-n" aria-hidden="true">2</span><b>Recall</b><span>Close everything and pull it back out: blurt on paper, explain aloud, or answer due recall cards. Before sleep is a good time.</span><em>Recall cards →</em></a>
    <a class="ck-step ck-use" href="${esc(link('p:#/'))}"><span class="ck-n" aria-hidden="true">3</span><b>Use</b><span>Build with it: one exercise without hints, or one step of the ETL project. Write where you stopped.</span><em>Practice picks →</em></a>
  </section>
  <section class="ck-panel"><div class="ck-head"><h2>Start a session</h2><span class="muted small">The timer keeps running on every page of the site; the bar at the top shows it.</span></div>
    <div class="ck-quick">${Object.entries(KINDS).map(([k, v]) => `<button type="button" data-start="${k}"><span>${chip(k)}</span><b>${v.plan[2] > 1 ? `${v.plan[2]} × ${v.plan[0]} min` : `${v.plan[0]} min`}</b><small>${esc(v.why)}</small></button>`).join('')}</div>
  </section>
  ${recent.length ? `<section class="ck-panel"><div class="ck-head"><h2>Continue where you left off</h2></div><ul class="ck-recent">${recent.map(r => `<li><a href="${esc(link(r.to))}">${esc(r.label)}</a><span class="muted small">${esc(r.section || '')}</span></li>`).join('')}</ul></section>` : ''}
  <section class="ck-panel"><div class="ck-head"><h2>Your week</h2><span class="muted small">${dur(weekMinutes(week))} of study a week · built from your routine below</span></div>
    <div class="ck-week">${[1, 2, 3, 4, 5, 6, 0].map(d => `<div class="ck-day${d === today ? ' today' : ''}"><h3>${DAY[d]}${d === today ? ' <span class="ck-today">today</span>' : ''}${s.office.includes(d) ? ' <span class="muted small">office</span>' : ''}</h3><ul>${dayRow(d)}</ul></div>`).join('')}</div>
    <p class="ck-legend"><span class="ck-chip ck-learn">Learn</span><span class="ck-chip ck-recall">Recall / test</span><span class="ck-chip ck-use">Use</span> Sunday afternoon and evenings after the recall block are left free on purpose.</p>
  </section>
  <section class="ck-panel" id="ck-ring"><div class="ck-head"><h2>Put it on your clock</h2></div>
    <div class="ck-ring">
      <div><h3>Calendar with alarms</h3><p>One file with every block, repeating weekly, with an alert 5 minutes before and at the start.</p>
        <p><button type="button" class="primary" id="ck-ics">Download study-clock.ics</button></p>
        <details><summary>Android phone (Google Calendar)</summary><ol><li>On a computer, open calendar.google.com → ⚙ Settings → <b>Add calendar → Create new calendar</b>, name it "Study".</li><li>Settings for "Study" → <b>Event notifications</b>: add "5 minutes" as a notification. Google ignores alarms inside imported files, so this sets them.</li><li><b>Import &amp; export</b> → choose the file → add to "Study". The phone shows the events and rings within a minute.</li></ol></details>
        <details><summary>Windows laptop (Outlook or Calendar)</summary><ol><li>Double-click the file. Outlook (classic or new) or the Calendar app opens it; choose <b>Import</b> or <b>Save and close</b>.</li><li>The alerts in the file are kept. On the office laptop, use the phone instead: nothing about this needs to touch work accounts.</li></ol></details>
        <p class="muted small">Changed your routine? Download again and import; delete the old "Study" events first, or the calendar shows both.</p></div>
      <div><h3>Phone clock alarms</h3><p>If you prefer the Clock app (Android or Windows Clock), set these alarms once, with their repeat days:</p>
        <ul class="ck-alarms">${alarmList(week).map(a => `<li><b>${a.start}</b><span>${esc(a.label)}</span><span class="muted small">${esc(a.dayText)}</span></li>`).join('')}</ul>
        <p><button type="button" id="ck-copy">Copy the list</button> <span class="muted small" id="ck-copy-msg"></span></p></div>
      <div><h3>While this site is open</h3>
        <label class="ck-toggle"><input type="checkbox" id="ck-notify"${read('lfz-clock-notify', false) ? ' checked' : ''}> Show a notification when a round or break ends</label>
        <label class="ck-toggle"><input type="checkbox" id="ck-awake"${read('lfz-clock-awake', true) ? ' checked' : ''}> Keep the screen on while a timer runs</label>
        <p class="muted small">Phones also vibrate. Browsers pause timers in background tabs, so for alarms that must ring with the phone locked, use the calendar or Clock app above; the timer here catches up the moment you come back.</p></div>
    </div>
  </section>
  <section class="ck-panel"><div class="ck-head"><h2>Your routine</h2><span class="muted small">Kept on this device</span></div>
    <form id="ck-form" class="ck-form">
      <label>Wake up <input type="time" name="wake" value="${s.wake}"></label>
      <label>Sleep <input type="time" name="sleep" value="${s.sleep}"></label>
      <label>Work starts <input type="time" name="workStart" value="${s.workStart}"></label>
      <label>Work ends <input type="time" name="workEnd" value="${s.workEnd}"></label>
      <label>Commute, minutes each way <input type="number" name="commute" min="0" max="180" step="5" value="${s.commute}"></label>
      ${tick('workdays', s.workdays, 'Work days')}${tick('office', s.office, 'Office days (the rest work from home)')}
      <p class="ck-form-go"><button type="submit" class="primary">Save and rebuild the week</button> <button type="button" id="ck-reset">Back to defaults</button></p>
    </form>
  </section>
  <section class="ck-panel"><div class="ck-head"><h2>Body breaks</h2><span class="muted small">The timer picks one for each break</span></div><div class="ck-tips">${BODY.map(bodyCard).join('')}</div></section>
  <section class="ck-panel"><div class="ck-head"><h2>Ways to recall</h2><span class="muted small">Shown at the end of each round</span></div><div class="ck-tips">${RECALL.map(bodyCard).join('')}</div></section>
  <details class="ck-why"><summary>Why this order works</summary><div>
    <p><b>Recall beats rereading.</b> Pulling an idea out of memory (a quiz, a blank page, explaining aloud) keeps it far better than reading it again. That is why every lesson is followed by a recall step, and why the morning starts with a 3-minute retest.</p>
    <p><b>Spacing.</b> Meeting the same idea again after a gap (morning read, commute listen, evening use, night recall, weekend test) works better than one long session.</p>
    <p><b>Use it.</b> Solving a problem with the idea shows what you only thought you knew.</p>
    <p><b>The body.</b> Getting up every 25–30 minutes breaks long sitting, the 20-20-20 rule rests eyes that stare at a screen, and slow breathing helps before a test. Recall just before sleep, then screens off.</p>
    <p class="muted small">No timer schedule is proven best for everyone: the Focus log under Today shows which kind you actually finish.</p></div></details>`;

  const drawNow = () => {
    const box = el.querySelector('#ck-now'); if (!box) return clearInterval(ticker);
    const st = read(TIMER_KEY, null), nn = nowAndNext(week, new Date());
    if (st) {
      const left = remaining(st), rest = st.phase === 'break', total = rest ? st.rest : st.work;
      box.className = 'ck-now running ' + (rest ? 'rest' : KINDS[st.kind].colour);
      box.innerHTML = `<div class="ck-now-main"><p class="ck-kicker">${rest ? 'Break · get up and move' : `${esc(KINDS[st.kind].name)} · round ${st.round} of ${st.rounds}`}</p>
        <p class="ck-big" role="timer">${mmss(left)}</p><progress max="${total}" value="${total - left}"></progress><p>${esc(st.title)}</p></div>
        <div class="ck-now-act">${st.link ? `<a class="button primary" href="${esc(link(st.link))}">Open ${esc(KINDS[st.kind].name.toLowerCase())} page</a>` : ''}<button type="button" id="ck-skip">${rest ? 'Skip break' : 'Finish round'}</button><button type="button" id="ck-stop">Stop</button></div>`;
      el.querySelector('#ck-stop').onclick = () => { write(TIMER_KEY, null); window.dispatchEvent(new Event('lfz-clock')); drawNow(); };
      el.querySelector('#ck-skip').onclick = () => { const x = read(TIMER_KEY, null); if (x) { x.start = Date.now() - (x.phase === 'work' ? x.work : x.rest) * 1000; write(TIMER_KEY, x); } };
      return;
    }
    const b = nn.current || nn.next;
    box.className = 'ck-now ' + (b ? KINDS[b.kind].colour : '');
    box.innerHTML = b ? `<div class="ck-now-main"><p class="ck-kicker">${nn.current ? `Now · ${nn.minsLeft} min left in this block` : `Next · ${nn.minsToNext >= 1440 ? DAY[b.day] + ' ' : nn.minsToNext >= 60 ? 'in ' + dur(nn.minsToNext) + ' · ' : `in ${nn.minsToNext} min · `}${b.start}`}</p>
        <h2>${chip(b.kind)} ${esc(b.title)}</h2><p>${esc(b.what)}</p></div>
        <div class="ck-now-act"><button type="button" class="primary" data-start="${b.kind}" data-title="${esc(b.title)}" data-link="${esc(b.link)}">Start ${esc(KINDS[b.kind].name)} timer</button><a class="button" href="${esc(link(b.link))}">Open the page</a></div>` : '<p>No blocks this week. Add work days or change the routine below.</p>';
    wireStart(box);
  };
  const wireStart = root => root.querySelectorAll('[data-start]').forEach(btn => btn.onclick = async () => {
    write(TIMER_KEY, startTimer(btn.dataset.start, { title: btn.dataset.title, link: btn.dataset.link }));
    window.dispatchEvent(new Event('lfz-clock')); drawNow();
    el.querySelector('#ck-now').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  wireStart(el.querySelector('.ck-quick'));
  drawNow(); ticker = setInterval(drawNow, 1000);
  if (onClock) window.removeEventListener('lfz-clock', onClock);
  onClock = drawNow; window.addEventListener('lfz-clock', onClock);

  el.querySelector('#ck-ics').onclick = () => {
    const text = weekIcs(week, { base: location.href.split('#')[0], resolve: l => href(l, 'elsewhere') });
    const u = URL.createObjectURL(new Blob([text], { type: 'text/calendar' })), a = document.createElement('a');
    a.href = u; a.download = 'study-clock.ics'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  };
  el.querySelector('#ck-copy').onclick = async () => {
    const text = alarmList(week).map(a => `${a.start}  ${a.label}  (${a.dayText})`).join('\n');
    try { await navigator.clipboard.writeText(text); el.querySelector('#ck-copy-msg').textContent = 'Copied.'; } catch { el.querySelector('#ck-copy-msg').textContent = 'Copy did not work here; select the list instead.'; }
  };
  el.querySelector('#ck-notify').onchange = async e => {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission().catch(() => 'denied');
      if (p !== 'granted') { e.target.checked = false; alertText('The browser did not allow notifications. Sound and vibration still work.'); return; }
    }
    write('lfz-clock-notify', e.target.checked);
  };
  el.querySelector('#ck-awake').onchange = e => write('lfz-clock-awake', e.target.checked);
  const form = el.querySelector('#ck-form');
  form.onsubmit = e => {
    e.preventDefault(); const f = new FormData(form);
    const next = normalise({ wake: f.get('wake'), sleep: f.get('sleep'), workStart: f.get('workStart'), workEnd: f.get('workEnd'), commute: f.get('commute'),
      workdays: f.getAll('workdays').map(Number), office: f.getAll('office').map(Number) });
    if (toMin(next.workEnd) <= toMin(next.workStart)) return alertText('Work should end after it starts.');
    write(SETTINGS, next); renderClock(el); alertText('Saved. Download the calendar again to update your alarms.');
  };
  el.querySelector('#ck-reset').onclick = () => { write(SETTINGS, null); renderClock(el); };
  function alertText(t) { const n = document.getElementById('notice'); if (n) n.textContent = t; }
}
