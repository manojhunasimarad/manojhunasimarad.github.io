// Dinachari: what each screen shows, as markup built from the context app.mjs gathers (x).
// No storage, no events here; buttons carry data-act and app.mjs handles them.

import * as C from './core.mjs';
import { href, LINKS } from './sources.mjs';
import { dial, sleepChart, dayBars, spark, meter } from './dial.mjs';

const h = C.esc;
const { fromMin, fmtDur, fromNow, fmtDate, relDay, rupees } = C;
const attrs = o => Object.entries(o || {}).map(([k, v]) => v === true ? ` ${k}` : v === false || v == null ? '' : ` ${k}="${h(v)}"`).join('');
export const btn = (label, act, data = {}, cls = 'btn') => `<button type="button" class="${cls}" data-act="${act}"${attrs(Object.fromEntries(Object.entries(data).map(([k, v]) => [k.startsWith('aria') || k === 'title' || k === 'disabled' ? k : 'data-' + k, v])))}>${label}</button>`;
export const go = (label, to, cls = 'btn') => `<a class="${cls}" href="${h(href(to))}" data-app="${h(to)}">${label}</a>`;
const block = (kind, title, body, extra = '', id = '') => `<section class="block${kind ? ' b-' + kind : ''}"${id ? ` id="${id}"` : ''}><header class="block-h"><h2>${title}</h2>${extra}</header>${body}</section>`;
const empty = (text, action = '') => `<div class="empty"><p>${text}</p>${action ? `<div class="row-actions">${action}</div>` : ''}</div>`;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const stars = n => n ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '';
const when = (ms, x) => {
  const d = C.dayOf(ms), t = C.clock(ms);
  if (d === x.today) return (C.dayMinute(ms) >= 21 * 60 ? 'tonight ' : 'today ') + t;
  if (d === C.addDays(x.today, 1)) return 'tomorrow ' + t;
  return fmtDate(d) + ' ' + t;
};
export const fmtDay = d => fmtDate(d);
const shortDay = d => C.DAY_NAMES[C.parseYmd(d).getDay()] + ' ' + C.parseYmd(d).getDate();

/* ================================================================== navigation */
export const TABS = [
  { id: 'today', name: 'Today', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>' },
  { id: 'cook', name: 'Cook', icon: '<path d="M4.5 10.5h15v4.8a4.7 4.7 0 0 1-4.7 4.7H9.2a4.7 4.7 0 0 1-4.7-4.7z"/><path d="M2.5 10.5h19M9 7.2c0-1.5 1.3-2.7 3-2.7s3 1.2 3 2.7"/>' },
  { id: 'learn', name: 'Learn', icon: '<path d="M4 5.5c2.6-1 5.2-1 8 1 2.8-2 5.4-2 8-1v13.5c-2.6-1-5.2-1-8 1-2.8-2-5.4-2-8-1z"/><path d="M12 6.5v13.5"/>' },
  { id: 'trade', name: 'Trade', icon: '<path d="M7 4v16M17 4v16"/><rect x="4.5" y="7.5" width="5" height="8" rx="1"/><rect x="14.5" y="9.5" width="5" height="6" rx="1"/>' },
  { id: 'me', name: 'Me', icon: '<path d="M18.5 14.6A7.5 7.5 0 0 1 9.4 5.5a7.5 7.5 0 1 0 9.1 9.1z"/>' }
];
const icon = (paths, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.5z"/>';
export const brand = () => `<span class="brand"><span class="brand-kn" lang="kn">ದಿನಚರಿ</span><span class="brand-en">Dinachari</span></span>`;
export function nav(x) {
  return TABS.map(t => `<button type="button" class="tab" data-act="tab" data-tab="${t.id}"${x.tab === t.id ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${t.name}</span></button>`).join('');
}
export function topbar(x) {
  return `${brand()}<div class="top-tools">${syncChip(x)}<button type="button" class="icon-btn" data-act="tab" data-tab="settings" aria-label="Settings"${x.tab === 'settings' ? ' aria-current="page"' : ''}>${icon(GEAR)}</button></div>`;
}
export function side(x) {
  return `<div class="side-brand">${brand()}</div><nav class="side-nav" aria-label="Sections">${nav(x)}<button type="button" class="tab" data-act="tab" data-tab="settings"${x.tab === 'settings' ? ' aria-current="page"' : ''}>${icon(GEAR)}<span>Settings</span></button></nav>
    <div class="side-foot">${syncChip(x)}<p class="side-keys">Keys: 1–5 sections, T timer, S sleep, R review</p></div>`;
}
function syncChip(x) {
  const s = x.sync;
  if (!s.token) return `<button type="button" class="sync-chip off" data-act="tab" data-tab="settings" data-focus="sync" title="Sync is off: data stays on this device">Not synced</button>`;
  const cls = s.busy ? 'busy' : s.error ? 'bad' : Object.keys(s.meta.conflicts || {}).length ? 'warn' : 'ok';
  const text = s.busy ? 'Syncing' : s.error ? 'Sync failed' : cls === 'warn' ? 'Choose a copy' : s.meta.last ? 'Synced ' + ago(x.now - s.meta.last) : 'Sync on';
  return `<button type="button" class="sync-chip ${cls}" data-act="sync" title="${h(s.error || 'Sync now')}">${text}</button>`;
}
const ago = ms => ms < 60e3 ? 'now' : ms < 36e5 ? Math.round(ms / 6e4) + ' min ago' : ms < 864e5 ? Math.round(ms / 36e5) + ' h ago' : Math.round(ms / 864e5) + ' d ago';

/* ================================================================== timers bar */
export function timersBar(x) {
  if (!x.timers.length) return '';
  return `<ul class="timer-list">${x.timers.map(t => {
    const done = C.timerDone(t, x.now), left = t.up ? C.elapsed(t, x.now) : C.timerLeft(t, x.now);
    const controls = t.up
      ? btn('Stop and save', 'timer-save', { id: t.id }, 'tbtn strong') + btn(t.paused ? 'Resume' : 'Pause', 'timer-pause', { id: t.id }, 'tbtn')
      : done ? btn('Done', 'timer-stop', { id: t.id }, 'tbtn strong') + btn('+5 min', 'timer-add', { id: t.id, mins: 5 }, 'tbtn')
        : btn(t.paused ? 'Resume' : 'Pause', 'timer-pause', { id: t.id }, 'tbtn') + btn('Stop', 'timer-stop', { id: t.id, 'aria-label': 'Stop ' + t.label }, 'tbtn');
    return `<li class="timer k-${h(t.kind)}${done ? ' ringing' : ''}${t.paused ? ' paused' : ''}"><span class="t-label">${h(t.label)}</span><span class="t-left" data-left="${h(t.id)}">${done ? 'Done' : C.fmtLeft(left)}</span><span class="t-ctl">${controls}</span></li>`;
  }).join('')}</ul>`;
}

/* ================================================================== Today */
export function today(x) {
  const alerts = conflictAlert(x) + firstRun(x);
  return `<h1 class="sr-only">Today</h1><div class="today">
    <div class="today-main">${hero(x)}${timeline(x)}</div>
    <div class="today-side">${alerts}${top3Block(x)}${kitchenBlock(x)}${habitsBlock(x)}${studyBlock(x)}${tradeBlock(x)}${reviewBlock(x)}</div>
  </div>`;
}

function dateLine(x) {
  const late = x.minute >= 1440;
  return `<p class="hero-date"><span>${C.LONG_DAY[C.weekday(x.today)]} ${C.parseYmd(x.today).getDate()} ${C.parseYmd(x.today).toLocaleString('en-IN', { month: 'long' })}</span>${late ? '<span class="late">late night</span>' : ''}</p>`;
}
function dayChips(x) {
  const k = x.dayKind, chips = [];
  chips.push(k === 'office' ? 'Office day' : k === 'home' ? 'Work from home' : 'Day off');
  if (x.fast) chips.push('Fasting until evening');
  return `<p class="day-chips">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</p>`;
}
export function heroState(x) {
  const r = x.st.routine, bed = C.bedMinute(r), wake = C.onDay(r.wake), m = x.minute, open = x.sleep.open, woke = x.sleep.wokeToday;
  if (open) {
    const since = `In bed since ${C.clock(open.bed)}`;
    const recent = x.now - open.bed < 30 * 60000;
    return { status: m < wake + 120 || m >= 1440 || m >= bed - 120 ? since + '.' : `${since}: did you forget to tap “I’m awake”?`,
      sub: 'Asleep', actions: btn('I’m awake', 'wake', {}, 'btn primary big') + (recent ? btn('Not yet: undo', 'bed-undo', {}, 'btn ghost') : btn('I woke earlier…', 'wake-at', {}, 'btn ghost')) };
  }
  const evening = m >= bed - x.st.windDown - 45;
  if (evening) {
    const left = bed - m;
    return { status: left > 0 ? `Lights out at ${r.sleep}, ${fromNow(left)}.` : `Past your ${r.sleep} bedtime by ${fmtDur(-left)}.`,
      sub: left > 0 ? 'Evening' : 'Bedtime', actions: btn('Going to sleep', 'bed', {}, 'btn primary big') + btn('Start a timer', 'timer-new', {}, 'btn ghost') };
  }
  if (!woke && m < 12 * 60) return { status: `Good morning. Your wake-up time is ${r.wake}.`, sub: 'Morning',
    actions: btn('I’m awake', 'wake', {}, 'btn primary big') + btn('I woke earlier…', 'wake-at', {}, 'btn ghost') };
  const cur = x.nn.current, next = x.nn.next;
  let status = cur ? `${cur.title} until ${fromMin(cur.end)}.` : next ? `Next: ${next.title} at ${fromMin(next.start)}, ${fromNow(next.start - m)}.` : '';
  if (woke && m < wake + 180 && woke.mins) status = `Up at ${C.clock(woke.wake)} after ${fmtDur(woke.mins)} of sleep. ` + status;
  else if (woke && m < wake + 180) status = `Up at ${C.clock(woke.wake)}. ` + status;
  const rate = woke && !woke.q && m < wake + 240 ? `<div class="rate" role="group" aria-label="How did you sleep?"><span>How did you sleep?</span>${[1, 2, 3, 4, 5].map(n => btn(C.ratingWords[n], 'sleep-rate', { q: n, id: woke.id }, 'chip-btn')).join('')}</div>` : '';
  const short = s => s.length > 24 ? s.slice(0, 23) + '…' : s;
  return { status, sub: cur ? short(cur.title) : next ? 'Next at ' + fromMin(next.start) : '', actions: btn('Start a timer', 'timer-new', {}, 'btn') + btn('Log activity', 'act-new', {}, 'btn ghost'), rate };
}
function hero(x) {
  const r = x.st.routine, s = heroState(x);
  const night = x.sleep.open ? { bed: x.sleep.open.bed, wake: null } : x.sleep.wokeToday && x.sleep.wokeToday.bed ? x.sleep.wokeToday : null;
  const svg = dial({ items: x.items, minute: x.minute, bed: C.bedMinute(r), wake: C.onDay(r.wake), night, center: C.clock(x.now), sub: s.sub });
  return `<section class="hero" aria-label="Now">
    <div class="hero-dial" data-act="dial-tip">${svg}<p class="dial-tip" id="dial-tip" aria-live="polite"></p></div>
    <div class="hero-copy">${dateLine(x)}${dayChips(x)}<p class="hero-status" data-hero-status>${h(s.status)}</p>
      <div class="hero-actions">${s.actions}</div>${s.rate || ''}</div>
  </section>`;
}

function timeline(x) {
  const m = x.minute, nn = x.nn, all = x.ui.fullDay;
  const list = all ? x.items : x.items.filter(it => it === nn.current || (it.end ?? it.start) >= m - 5).slice(0, 6);
  const rows = list.map(it => {
    const past = (it.end ?? it.start) < m && it !== nn.current, cur = it === nn.current;
    const whenText = cur ? `${fmtDur(it.end - m)} left` : it.start > m ? fromNow(it.start - m) : '';
    const tick = it.kind === 'prep' ? `<label class="tick-box" title="Done"><input type="checkbox" data-act="prep" data-key="${h(it.key)}"${it.done ? ' checked' : ''}><span class="sr-only">Done: ${h(it.title)}</span></label>`
      : it.kind === 'cook' && it.done ? '<span class="tag good">Eaten</span>' : '';
    const title = it.link ? `<a href="${h(href(it.link))}" data-app="${h(it.link)}">${h(it.title)}</a>` : it.id === 'review' ? `<button type="button" class="linkish" data-act="review">${h(it.title)}</button>` : h(it.title);
    return `<li class="tl-row k-${it.kind}${past ? ' past' : ''}${cur ? ' now' : ''}${it.done ? ' done' : ''}">
      <span class="tl-time">${fromMin(it.start)}</span><span class="tl-mark" aria-hidden="true"></span>
      <div class="tl-body"><p class="tl-title">${title}</p>${it.sub ? `<p class="tl-sub">${h(it.sub)}</p>` : ''}${it.note ? `<p class="tl-sub note">${h(it.note)}</p>` : ''}</div>
      <span class="tl-when">${whenText}</span>${tick}</li>`;
  }).join('');
  const toggle = btn(all ? 'Show what’s next' : 'Show the whole day', 'full-day', {}, 'btn ghost small');
  return `<section class="block timeline" aria-label="Today’s plan"><header class="block-h"><h2>${all ? 'The whole day' : 'Now and next'}</h2>${toggle}</header><ol class="tl">${rows || '<li class="tl-empty">Nothing else planned today.</li>'}</ol></section>`;
}

function conflictAlert(x) {
  const c = Object.entries(x.sync.meta.conflicts || {});
  if (!c.length) return '';
  return `<section class="block alert" role="alert"><header class="block-h"><h2>Choose which copy to keep</h2></header>
    ${c.map(([id, cf]) => `<p>${h(cf.name)} changed here and on ${h(cf.device || 'another device')} since the last sync. Nothing has been overwritten.</p><div class="row-actions">${btn('Keep this device’s', 'conflict', { id, choice: 'here' }, 'btn')}${btn('Use the synced copy', 'conflict', { id, choice: 'synced' }, 'btn')}</div>`).join('')}</section>`;
}
function firstRun(x) {
  if (x.hasSettings || x.ui.introDone) return '';
  const steps = [
    [`Your routine: up at ${x.st.routine.wake}, lights out at ${x.st.routine.sleep}${x.routineFrom ? ', taken from LLM From Zero’s study clock' : ''}.`, btn('Check it', 'tab', { tab: 'settings', focus: 'routine' }, 'btn small')],
    ['Allow notifications for bedtime, prep and timers.', x.notif === 'granted' ? '<span class="tag good">On</span>' : btn('Allow', 'notif', {}, 'btn small')],
    [x.installed ? 'Installed as an app.' : 'Install Dinachari so it opens like an app.', x.installed ? '<span class="tag good">Done</span>' : x.canInstall ? btn('Install', 'install', {}, 'btn small') : btn('How', 'tab', { tab: 'settings', focus: 'install' }, 'btn small')],
    [x.sync.token ? 'Signed in to GitHub through LLM From Zero: sync is on.' : 'Sync your phone and laptop with the GitHub sign-in LLM From Zero uses.', x.sync.token ? '<span class="tag good">On</span>' : btn('Set up', 'tab', { tab: 'settings', focus: 'sync' }, 'btn small')]
  ];
  return block('', 'Set up your day', `<ol class="setup">${steps.map(([t, a]) => `<li><span>${t}</span>${a}</li>`).join('')}</ol><div class="row-actions">${btn('Done', 'intro-done', {}, 'btn ghost small')}</div>`);
}

function top3Block(x) {
  const items = x.top3 || [];
  if (!items.length) return '';
  const done = items.filter(i => i.done).length;
  return block('', 'Today’s three', `<ul class="checks">${items.map((it, i) => `<li><label><input type="checkbox" data-act="top3" data-i="${i}"${it.done ? ' checked' : ''}><span>${h(it.t)}</span></label></li>`).join('')}</ul>`,
    `<span class="count">${done} of ${items.length}</span>`);
}

function kitchenBlock(x) {
  const k = x.kitchen;
  if (!k.summary) {
    const msg = k.refreshing ? 'Reading today’s plan from Kitchen…' : k.used ? 'Open Kitchen From Zero once on this device to see today’s meals, soaking and shopping here.' : 'Plan meals in Kitchen From Zero and they show up here, with what to soak and what to buy.';
    return block('cook', 'Kitchen', empty(msg, go('Open Kitchen', 'kitchen:today', 'btn') + (k.used && !k.refreshing ? btn('Read it now', 'kitchen-refresh', {}, 'btn ghost') : '')));
  }
  const meals = (k.day ? k.day.meals : []).filter(m => m.dishes.length);
  const next = meals.find(m => !m.eaten && C.onDay(m.time) + 30 >= x.minute);
  const mealList = meals.map(m => `<li class="meal${m.eaten ? ' eaten' : ''}${m === next ? ' next' : ''}"><span class="m-time">${h(m.time)}</span><span class="m-name">${h(m.name)}</span><span class="m-dish">${h(m.dishes.map(d => d.title).join(', '))}</span>${m.eaten ? '<span class="tag good">Eaten</span>' : ''}</li>`).join('');
  const soon = x.prep.filter(t => !t.done && (t.start || t.by) && (t.start || t.by) < x.now + 36 * 36e5).slice(0, 4);
  const prep = soon.length ? `<h3 class="sub-h">Prep ahead</h3><ul class="prep">${soon.map(t => prepRow(t, x)).join('')}</ul>` : '';
  const buy = buyChips(k);
  const n = k.summary.nutrition;
  const protein = n && n.pTarget ? `<p class="kv"><span>Protein today</span>${meter(n.p, n.pTarget, 'k-cook')}<b>${n.p} of ${n.pTarget} g</b></p>` : '';
  const stale = k.summary.date !== x.today;
  return block('cook', 'Kitchen', `${stale ? '<p class="note">This is from an earlier day. Open Kitchen or read it now for today’s plan.</p>' : ''}
    ${meals.length ? `<ul class="meals">${mealList}</ul>` : '<p class="muted">No meals planned for today in Kitchen.</p>'}
    ${prep}${buy}${protein}
    <p class="foot"><span>From Kitchen, ${ago(x.now - (k.summary.at || 0))}</span>${btn(k.refreshing ? 'Reading…' : 'Read again', 'kitchen-refresh', { disabled: k.refreshing }, 'linkish')}</p>`,
    go('Open Kitchen', 'kitchen:today', 'btn small'));
}
function prepRow(t, x) {
  const late = !t.done && t.by && t.by < x.now, nowish = !t.done && !late && t.start && t.start <= x.now;
  const tag = late ? '<span class="tag bad">Late</span>' : nowish ? '<span class="tag warn">Now</span>' : '';
  const whenText = late ? `needed by ${when(t.by, x)}` : t.start ? `${nowish ? 'start now, before ' + when(t.by, x) : 'start ' + when(t.start, x)}` : t.by ? `before ${when(t.by, x)}` : '';
  const cal = !t.done && t.start && t.start > x.now ? `<a class="icon-link" href="${h(C.gcalUrl({ title: 'Prep: ' + C.shortPrep(t.what), start: t.start, mins: 10, details: t.what + '\n' + location.origin + '/', tz: x.tz }))}" target="_blank" rel="noopener" title="Add a reminder to Google Calendar" aria-label="Add a reminder to Google Calendar">${icon('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4M12 13v4M10 15h4"/>')}</a>` : '';
  return `<li class="prep-row${t.done ? ' done' : ''}"><label><input type="checkbox" data-act="prep" data-key="${h(t.key)}"${t.done ? ' checked' : ''}><span><b>${h(t.what)}</b><span class="small">${tag} ${h(whenText)}${t.dish ? ' for ' + h(t.dish) : ''}</span>${late && t.quick ? `<span class="small">${h(t.quick)}</span>` : ''}</span></label>${cal}</li>`;
}
function buyChips(k) {
  const s = k.summary.shop || {};
  const items = [...new Set([...(s.bring || []), ...(s.need || []).map(n => n.label), ...(s.low || [])])];
  if (!items.length) return '';
  const shown = items.slice(0, 8), more = items.length - shown.length;
  return `<h3 class="sub-h">To buy</h3><p class="buy">${shown.map(i => `<span class="chip">${h(i)}</span>`).join('')}${more > 0 ? `<span class="chip muted">${more} more</span>` : ''}</p>
    <div class="row-actions">${btn('Share the list', 'share-shop', {}, 'btn small')}${go('Shopping', 'kitchen:shop', 'btn ghost small')}</div>`;
}

function habitsBlock(x) {
  const done = x.habits.filter(hb => hb.on).length;
  return block('', 'Habits', `<ul class="habits">${x.habits.map(hb => `<li><button type="button" class="habit${hb.on ? ' on' : ''}" data-act="habit" data-h="${h(hb.id)}" aria-pressed="${hb.on}" title="${h(hb.reason ? 'Ticked automatically: ' + hb.reason : hb.on ? 'Ticked by hand' : 'Tap when done')}"><span class="h-box" aria-hidden="true"></span><span class="h-name">${h(hb.name)}</span>${hb.reason && !hb.manual ? `<span class="h-why">${h(hb.reason)}</span>` : ''}</button></li>`).join('')}</ul>`,
    `<span class="count">${done} of ${x.habits.length}</span>`);
}

function steps5(st) {
  if (!st) return '';
  return `<ol class="steps5" aria-label="Today’s five study steps">${st.steps.map(s => `<li class="${s.done ? 'done' : ''}${st.next && st.next.id === s.id ? ' next' : ''}" title="${h(s.done ? s.why : s.how)}"><span>${h(s.label)}</span></li>`).join('')}</ol>`;
}
function llmTimer(x) {
  const t = x.llm.timer;
  if (!t || !t.start) return '';
  return `<p class="llm-timer"><span class="pulse" aria-hidden="true"></span>${h((t.title || 'Study round'))}, round ${t.round || 1} of ${t.rounds || 1}: <b data-llm-left>${C.fmtLeft(x.llm.timerLeft || 0)}</b> ${t.phase === 'break' ? 'of break' : 'left'}</p>`;
}
function studyBlock(x) {
  const l = x.llm;
  if (l.error && !l.used) return block('study', 'Study', empty('LLM From Zero’s plan shows here once you have opened it on this device.', go('Open LLM From Zero', 'llm:today')));
  const st = l.steps, nextBlocks = l.blocks.filter(b => C.onDay(b.start) + b.mins > x.minute).slice(0, 2);
  const blocksHtml = nextBlocks.length ? `<ul class="mini-list">${nextBlocks.map(b => `<li><span class="m-time">${h(b.start)}</span><span>${h(b.title)} <span class="muted">${b.mins} min</span></span></li>`).join('')}</ul>` : '';
  const facts = [l.rounds.length ? plural(l.rounds.length, 'round') + ', ' + l.mins + ' min today' : 'No timed rounds yet today', x.streak > 1 ? `${x.streak}-day streak` : ''].filter(Boolean);
  return block('study', 'Study', `${steps5(st)}${st && st.next ? `<p class="next-step"><b>Next: ${h(st.next.title)}.</b> ${h(st.next.hint || st.next.how)}</p>` : st ? '<p class="next-step"><b>All five steps done today.</b></p>' : ''}
    ${llmTimer(x)}${blocksHtml}<p class="muted small">${facts.join('. ')}.</p>${l.error ? `<p class="note">${h(l.error)}</p>` : ''}
    <div class="row-actions">${go('Today’s plan', 'llm:today', 'btn small')}${go('Practice', 'llm:practice', 'btn ghost small')}${go('Recall', 'llm:recall', 'btn ghost small')}</div>`,
    `<span class="count">${st ? st.done + ' of 5' : ''}</span>`);
}

function tradeBlock(x) {
  const d = x.dojo, l = x.lessons;
  if (!d && !l) return block('trade', 'Trading practice', empty('Learn to trade with paper money in Dalal Dojo: the lessons first, then the desk with a simulated NSE session.', go('Start the lessons', 'dojo:lessons') + go('Open the desk', 'dojo:desk', 'btn ghost')));
  const desk = d ? `<p class="big-num">${rupees(d.worth)} <span class="delta ${d.pnl > 0 ? 'up' : d.pnl < 0 ? 'down' : ''}">${d.pnl > 0 ? '▲' : d.pnl < 0 ? '▼' : ''} ${rupees(Math.abs(d.pnl))} (${Math.abs(d.pct).toFixed(2)}%)</span></p>
    <p class="muted small">Paper account. ${plural(d.days, 'trading day')} on the desk${d.days ? ', ' + d.greenDays + ' green' : ''}. ${d.rank.name}${d.rank.next ? `, ${d.rank.next.xp - d.xp} XP to ${d.rank.next.name}` : ''}.</p>
    <p class="kv"><span>Missions</span>${meter(d.missions, 20, 'k-trade')}<b>${d.missions} of 20</b></p>` : '';
  const les = l ? `<p class="kv"><span>${h(l.belt.name)} belt</span>${meter(l.lessons, 24, 'k-trade')}<b>${l.lessons} of 24 lessons</b></p>` : '';
  return block('trade', 'Trading practice', `${desk}${les}<p class="small">${x.traded ? '<span class="tag good">Practised today</span> ' + h(x.traded) : 'Not practised yet today.'}</p>
    <div class="row-actions">${go('Open the desk', 'dojo:desk', 'btn small')}${go('Lessons', 'dojo:lessons', 'btn ghost small')}</div>`);
}

function reviewBlock(x) {
  const rv = x.review, wk = C.weekday(x.today) === 0 || (C.weekday(x.today) === 6 && x.minute > 18 * 60);
  const weekBtn = wk ? btn(x.weekReview ? 'Edit the weekly review' : 'Weekly review', 'week-review', {}, 'btn ghost small') : '';
  if (rv) return block('', 'Review', `<p>Reviewed: mood ${h(C.ratingWords[rv.mood] || '–')}, energy ${h(C.ratingWords[rv.energy] || '–')}.${rv.win ? ` Win: ${h(rv.win)}` : ''}</p><div class="row-actions">${btn('Edit', 'review', {}, 'btn small')}${weekBtn}</div>`);
  const evening = x.minute >= C.reviewMinute(x.st) - 60;
  return block('', 'Review', `<p>${evening ? 'Two minutes before bed: one win, one thing to fix, and tomorrow’s three.' : 'Tonight at ' + fromMin(C.reviewMinute(x.st)) + ': one win, one thing to fix, tomorrow’s three.'}</p><div class="row-actions">${btn(evening ? 'Review the day' : 'Review now', 'review', {}, evening ? 'btn primary' : 'btn small')}${weekBtn}</div>`);
}

/* ================================================================== Cook */
export function cook(x) {
  const k = x.kitchen, book = x.cookBook, mine = new Map(book.map(b => [b.dish.toLowerCase(), b]));
  const dayCard = (d, label) => {
    if (!d) return '';
    const meals = d.meals.filter(m => m.dishes.length);
    return `<div class="day-meals"><h3 class="sub-h">${label}</h3>${meals.length ? `<ul class="meals">${meals.map(m => `<li class="meal${m.eaten ? ' eaten' : ''}"><span class="m-time">${h(m.time)}</span><span class="m-name">${h(m.name)}</span><span class="m-dish">${m.dishes.map(dd => {
      const b = mine.get(dd.title.toLowerCase());
      const est = dd.mins ? `${dd.mins} min in the book` : '', you = b && b.avgMins ? `${Math.round(b.avgMins)} min for you` : '';
      return `${h(dd.title)}${est || you ? ` <span class="muted">(${[est, you].filter(Boolean).join(', ')})</span>` : ''}`;
    }).join('<br>')}</span>${m.eaten ? '<span class="tag good">Eaten</span>' : ''}</li>`).join('')}</ul>` : '<p class="muted">Nothing planned.</p>'}</div>`;
  };
  const meals = k.summary ? `<div class="two">${dayCard(k.day, 'Today')}${dayCard(k.tomorrow, 'Tomorrow')}</div>${k.summary.tonight ? `<p class="note">${h(k.summary.tonight)}</p>` : ''}` : empty('Open Kitchen From Zero once and its plan shows here.', go('Open Kitchen', 'kitchen:today'));
  const prep = x.prep.length ? `<ul class="prep">${x.prep.map(t => prepRow(t, x)).join('')}</ul>` : '<p class="muted">Nothing to soak, sprout or marinate in the next four days.</p>';
  const s = k.summary && k.summary.shop;
  const list = (title, items, note) => items && items.length ? `<div><h3 class="sub-h">${title}</h3><p class="buy">${items.map(i => `<span class="chip">${h(i)}</span>`).join('')}</p>${note ? `<p class="muted small">${note}</p>` : ''}</div>` : '';
  const shop = s ? `${list('Needed for your plan', (s.need || []).map(n => n.label), (s.need || []).length ? 'For meals today and tomorrow.' : '')}${list('To bring home', s.bring)}${list('Ordered', s.ordered, s.app ? 'In ' + h(s.app) + '. Tick them in Kitchen when they arrive.' : '')}${list('Running low', s.low)}` +
    `<div class="row-actions">${btn('Share the list', 'share-shop', {}, 'btn small')}${go('Shopping in Kitchen', 'kitchen:shop', 'btn ghost small')}</div>` : '<p class="muted">The shopping list comes from Kitchen.</p>';
  const presets = C.PRESETS.map(p => btn(`${h(p.label)} <span class="muted">${p.mins >= 60 ? p.mins / 60 + ' h' : p.mins + ' min'}</span>`, 'timer-start', { label: p.label, mins: p.mins, kind: p.kind }, 'btn preset')).join('');
  const dishes = k.day ? [...new Set(k.day.meals.flatMap(m => m.dishes.map(d => d.title)))] : [];
  const timers = `<div class="presets">${presets}</div>
    <form class="inline-form" data-form="timer-custom"><label>Minutes <input name="mins" type="number" min="1" max="720" value="10" inputmode="numeric"></label><label>Name <input name="label" maxlength="40" placeholder="Timer"></label><button class="btn" type="submit">Start</button></form>
    <form class="inline-form" data-form="stopwatch"><label class="grow">Time a dish <input name="dish" list="dish-list" maxlength="60" placeholder="Chicken pulao"></label><datalist id="dish-list">${[...dishes, ...book.map(b => b.dish)].map(d => `<option value="${h(d)}">`).join('')}</datalist><button class="btn" type="submit">Start the stopwatch</button></form>
    <p class="muted small">The stopwatch measures how long a dish really takes you; stop it when you serve, rate it, and Dinachari keeps your own times next to the book’s.${x.android ? '' : ' Timers ring while Dinachari is open on this device, even in the background.'}</p>`;
  const rows = book.slice(0, 30).map(b => `<tr><th scope="row">${h(b.dish)}</th><td>${b.count}</td><td>${b.avgMins ? Math.round(b.avgMins) + ' min' : '–'}${b.est ? ` <span class="muted">(book ${b.est})</span>` : ''}</td><td><span aria-label="${b.avgRating ? b.avgRating.toFixed(1) + ' of 5' : 'not rated'}">${stars(b.avgRating)}</span></td><td>${b.again === true ? 'Yes' : b.again === false ? 'No' : '–'}</td></tr>`).join('');
  const reviews = book.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">Dish</th><th scope="col">Cooked</th><th scope="col">Your time</th><th scope="col">Rating</th><th scope="col">Again?</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Time a dish with the stopwatch, or log one you cooked, and your times and ratings collect here.</p>';
  const links = ['kitchen:today|Today in Kitchen', 'kitchen:cook|Cook from pantry', 'kitchen:recipes|Recipes', 'kitchen:check|Pantry check', 'kitchen:surprise|Surprise me', 'kitchen:me|Me and health'].map(s => { const [to, label] = s.split('|'); return go(label, to, 'btn ghost small'); }).join('');
  return `<div class="page"><h1 class="page-h">Cook</h1>
    ${block('cook', 'Meals', meals, k.summary ? `<span class="count">${ago(x.now - k.summary.at)}</span>` : '')}
    ${block('cook', 'Prep ahead', prep, `<span class="count">next 4 days</span>`)}
    ${block('', 'Timers', timers)}
    ${block('cook', 'Shopping', shop)}
    ${block('', 'Your cooking times and reviews', reviews, btn('Log a dish', 'cook-new', {}, 'btn small'))}
    ${block('', 'Kitchen From Zero', `<div class="row-actions wrap">${links}</div>`)}</div>`;
}

/* ================================================================== Learn */
export function learn(x) {
  const l = x.llm, st = l.steps;
  const blocks = list => list.length ? `<ul class="mini-list">${list.map(b => `<li><span class="m-time">${h(b.start)}</span><span><a href="${h(href(b.link))}" data-app="${h(b.link)}">${h(b.title)}</a> <span class="muted">${b.mins} min</span><br><span class="small muted">${h(b.what || '')}</span></span></li>`).join('')}</ul>` : '<p class="muted">No study blocks.</p>';
  const stepsList = st ? `<ul class="checks plain">${st.steps.map(s => `<li class="${s.done ? 'done' : ''}"><span class="h-box" aria-hidden="true"></span><span><b>${h(s.label)}: ${h(s.title)}</b><br><span class="small muted">${h(s.done ? s.why : s.how)}</span></span></li>`).join('')}</ul>` : '';
  const days = C.lastDays(x.today, 7);
  const chart = dayBars(days.map(d => x.studyMins[d] || 0), { days, fmtDay, unit: ' min', title: 'Study minutes, last 7 days', cls: 'k-study' });
  const links = [['llm:today', 'Today’s plan'], ['llm:clock', 'Study clock'], ['llm:practice', 'Exercises'], ['llm:recall', 'Recall cards'], ['llm:quiz', 'Quiz'], ['llm:etl', 'ETL step guide'], ['llm:library', 'Learn and listen'], ['llm:progress', 'Progress']].map(([to, n]) => go(n, to, 'btn ghost small')).join('');
  const books = x.books.length ? `<ul class="books">${x.books.map(b => `<li><div><b>${h(b.title)}</b> <span class="muted small">${b.kind === 'study' ? 'for study' : 'not for study'}</span></div>${b.pages ? `<p class="kv">${meter(b.page || 0, b.pages, 'k-study')}<b>${b.page || 0} of ${b.pages}</b></p>` : ''}<div class="row-actions">${btn('+10 pages', 'book-pages', { id: b.id, n: 10 }, 'btn small')}${btn('Update', 'book-edit', { id: b.id }, 'btn ghost small')}</div></li>`).join('')}</ul>` : '<p class="muted">Add what you are reading. Moving the page on counts as today’s reading habit.</p>';
  return `<div class="page"><h1 class="page-h">Learn</h1>
    ${block('study', 'LLM From Zero today', `${steps5(st)}${llmTimer(x)}${stepsList}${l.error ? `<p class="note">${h(l.error)}</p>` : ''}<div class="row-actions wrap">${go('Open today’s plan', 'llm:today', 'btn')}${go('Start practice', 'llm:practice', 'btn ghost')}</div>`, `<span class="count">${st ? st.done + ' of 5' : ''}</span>`)}
    <div class="two">${block('study', 'Study blocks today', blocks(l.blocks))}${block('study', 'Tomorrow', blocks(x.llmTomorrow || []))}</div>
    ${block('study', 'This week', `${chart}<p class="muted small">${x.streak ? x.streak + '-day streak of timed rounds.' : 'Finish a timed round in LLM From Zero to start a streak.'} Blocks come from the study clock, which uses the same routine as Dinachari.</p>`)}
    ${block('', 'Reading', books, btn('Add a book', 'book-new', {}, 'btn small'))}
    ${block('', 'Everything in LLM From Zero', `<div class="row-actions wrap">${links}</div>`)}</div>`;
}

/* ================================================================== Trade */
export function trade(x) {
  const d = x.dojo, l = x.lessons;
  const desk = d ? `<p class="big-num">${rupees(d.worth)} <span class="delta ${d.pnl > 0 ? 'up' : d.pnl < 0 ? 'down' : ''}">${d.pnl > 0 ? '▲' : d.pnl < 0 ? '▼' : ''} ${rupees(Math.abs(d.pnl))} (${Math.abs(d.pct).toFixed(2)}%)</span></p>
    <dl class="facts"><div><dt>Started with</dt><dd>${rupees(d.capital)}</dd></div><div><dt>Trading days</dt><dd>${d.days} <span class="muted">(${d.greenDays} green)</span></dd></div>
    <div><dt>Closed trades</dt><dd>${d.trades} <span class="muted">(${d.trades ? Math.round(100 * d.wins / d.trades) : 0}% won)</span></dd></div><div><dt>Rank</dt><dd>${h(d.rank.name)} <span class="muted">${d.xp} XP</span></dd></div></dl>
    ${d.rank.next ? `<p class="kv"><span>To ${h(d.rank.next.name)}</span>${meter(d.xp, d.rank.next.xp, 'k-trade')}<b>${d.rank.next.xp - d.xp} XP</b></p>` : ''}
    <p class="kv"><span>Missions</span>${meter(d.missions, 20, 'k-trade')}<b>${d.missions} of 20</b></p>
    ${d.last ? `<p class="small">Last day on the desk (${d.last.mode === 'sim' ? 'simulated session, ' : ''}${/^\d{4}-\d\d-\d\d$/.test(d.last.date || '') ? h(fmtDate(d.last.date)) : h(d.last.date || '')}): ${d.last.net >= 0 ? 'up' : 'down'} ${rupees(Math.abs(d.last.net || 0))} after ${rupees(d.last.charges || 0, 2)} charges, ${plural(d.last.trips || 0, 'trade')}.</p>` : ''}`
    : empty('No paper account yet. The desk gives you ₹1,00,000 of paper money and a simulated NSE session.', go('Open the desk', 'dojo:desk'));
  const les = l ? `<p class="kv"><span>${h(l.belt.name)} belt</span>${meter(l.xp, l.belt.next ? l.belt.next.xp : l.xp || 1, 'k-trade')}<b>${l.xp} XP${l.belt.next ? ' of ' + l.belt.next.xp : ''}</b></p><p class="kv"><span>Lessons</span>${meter(l.lessons, 24, 'k-trade')}<b>${l.lessons} of 24</b></p><p class="small">${l.streak ? l.streak + '-day learning streak.' : 'No streak running.'}</p>`
    : empty('Twenty-four lessons with quizzes, then a lab that backtests a SIP against timing the market.', go('Start the lessons', 'dojo:lessons'));
  const days = C.lastDays(x.today, 14);
  const dots = `<ol class="dots" aria-label="Practice days, last 14">${days.map(dd => `<li class="${x.tradeDays.has(dd) ? 'on' : ''}" title="${h(fmtDay(dd))}: ${x.tradeDays.has(dd) ? 'practised' : 'no practice'}"><span class="sr-only">${h(fmtDay(dd))}: ${x.tradeDays.has(dd) ? 'practised' : 'no practice'}</span></li>`).join('')}</ol><p class="muted small">Last 14 days, oldest first. ${x.tradeDays.size ? '' : 'A day counts when you use the desk or keep the lessons streak.'}</p>`;
  const notes = x.tnotes.length ? `<ul class="notes">${x.tnotes.slice(0, 20).map(n => `<li><p>${h(n.text)}</p><p class="muted small">${h(relDay(C.dayOf(n.at), x.today))} ${btn('Delete', 'del', { id: n.id }, 'linkish')}</p></li>`).join('')}</ul>` : '<p class="muted">After each session, write one line on what you learned: a rule you broke, a setup that worked. These come back in the weekly review.</p>';
  return `<div class="page"><h1 class="page-h">Trade</h1>
    ${block('trade', 'Paper desk', `${desk}<div class="row-actions">${go('Open the desk', 'dojo:desk', 'btn')}</div>`)}
    ${block('trade', 'Lessons and lab', `${les}<div class="row-actions">${go('Open the lessons', 'dojo:lessons', 'btn ghost')}</div>`)}
    ${block('trade', 'Practice days', dots)}
    ${block('', 'What I learned', notes, btn('Add a note', 'tnote-new', {}, 'btn small'))}
    <p class="disclaimer">Paper money only, for learning. Nothing here is investment advice.</p></div>`;
}

/* ================================================================== Me */
export function me(x) {
  const r = x.st.routine, s = x.sleep.stats, days = C.lastDays(x.today, 14).reverse();
  const stat = (label, value, note = '') => `<div><dt>${label}</dt><dd>${value}${note ? ` <span class="muted">${note}</span>` : ''}</dd></div>`;
  const sleepFacts = `<dl class="facts">${stat('Average sleep', s.avgMins ? fmtDur(s.avgMins) : '–', `goal ${fmtDur(s.goal)}`)}${stat('Average bedtime', s.avgBed || '–', `target ${r.sleep}`)}${stat('Average wake-up', s.avgWake || '–', `target ${r.wake}`)}${stat('In bed on time', `${s.bedOnTime} of ${s.timed}`, 'nights')}${stat('Bedtime varies by', s.spread != null ? '±' + fmtDur(s.spread) : '–')}${stat('Short of the goal', s.debt ? fmtDur(s.debt) : 'None', 'this week')}</dl>`;
  const chart = sleepChart(x.sleep.list, { bed: C.bedMinute(r), wake: C.onDay(r.wake), goal: s.goal, days, fmtDay: shortDay });
  const w = x.weights, wLast = w[w.length - 1], w30 = w.filter(p => p.date >= C.addDays(x.today, -30));
  const weight = wLast ? `<p class="big-num">${wLast.kg.toFixed(1)} kg <span class="muted small">on ${h(fmtDay(wLast.date))}</span></p>${w30.length > 1 ? `<p class="kv"><span>30 days</span>${spark(w30.map(p => ({ t: C.parseYmd(p.date).getTime(), v: p.kg })))}<b>${(w30[w30.length - 1].kg - w30[0].kg >= 0 ? '+' : '−') + Math.abs(w30[w30.length - 1].kg - w30[0].kg).toFixed(1)} kg</b></p>` : ''}` : '<p class="muted">Weigh-ins logged in Kitchen From Zero (Me and health) show here.</p>';
  const wk = x.week, actWeek = x.acts.filter(a => C.dayOf(a.at) >= wk.dates[0]);
  const acts = x.acts.length ? `<ul class="mini-list">${x.acts.slice(0, 8).map(a => `<li><span class="m-time">${h(relDay(C.dayOf(a.at), x.today))}</span><span>${h(a.type)}, ${a.mins} min${a.note ? ` <span class="muted">${h(a.note)}</span>` : ''} ${btn('Delete', 'del', { id: a.id }, 'linkish')}</span></li>`).join('')}</ul>` : '<p class="muted">Log a walk, a swim or a class and it counts toward your “Move” habit.</p>';
  const grid = habitGrid(x);
  const revs = x.reviews.slice(0, 10).map(rv => `<li><button type="button" class="linkish" data-act="review" data-date="${h(rv.d)}">${h(relDay(rv.d, x.today))}</button> <span class="muted">mood ${h(C.ratingWords[rv.mood] || '–')}, energy ${h(C.ratingWords[rv.energy] || '–')}</span>${rv.win ? `<br><span class="small">${h(rv.win)}</span>` : ''}</li>`).join('');
  return `<div class="page"><h1 class="page-h">Me</h1>
    ${block('sleep', 'Sleep, last 7 nights', sleepFacts + chart, btn('Add a night', 'sleep-new', {}, 'btn small'))}
    <div class="two">${block('', 'Weight', `${weight}<div class="row-actions">${go('Log weight in Kitchen', 'kitchen:me', 'btn ghost small')}</div>`)}
    ${block('', 'Movement this week', `<p class="big-num">${fmtDur(actWeek.reduce((a, b) => a + (b.mins || 0), 0))}</p>${acts}`, btn('Log activity', 'act-new', {}, 'btn small'))}</div>
    ${block('', 'Habits, last 14 days', grid, btn('Edit habits', 'tab', { tab: 'settings', focus: 'habits' }, 'btn ghost small'))}
    ${block('', 'This week', weekSummary(x), btn(x.weekReview ? 'Edit the weekly review' : 'Weekly review', 'week-review', {}, 'btn small'))}
    ${block('', 'Daily reviews', revs ? `<ul class="notes">${revs}</ul>` : '<p class="muted">Your evening reviews collect here.</p>', btn('Review today', 'review', {}, 'btn ghost small'))}</div>`;
}
function habitGrid(x) {
  const days = C.lastDays(x.today, 14);
  return `<div class="table-wrap"><table class="grid"><thead><tr><th scope="col"><span class="sr-only">Habit</span></th>${days.map(d => `<th scope="col" title="${h(fmtDay(d))}">${h(C.DAY_NAMES[C.weekday(d)][0])}<br>${C.parseYmd(d).getDate()}</th>`).join('')}</tr></thead>
    <tbody>${x.habitDefs.map(hb => `<tr><th scope="row">${h(hb.name)}</th>${days.map(d => { const on = x.habitHistory[d] && x.habitHistory[d][hb.id]; return `<td class="${on ? 'on' : ''}" title="${h(fmtDay(d))}: ${on ? 'done' : 'not done'}"><span class="sr-only">${on ? 'done' : 'not done'}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function weekSummary(x) {
  const w = x.week.facts, st = x.st;
  const days = x.week.dates;
  const sleepBars = dayBars(w.days.map(d => d.sleepMins != null ? Math.round(d.sleepMins / 6) / 10 : null), { days, fmtDay, unit: ' h', title: 'Hours of sleep', cls: 'k-sleep', goal: Math.round(C.goalMins(st.routine) / 6) / 10 });
  const studyBars = dayBars(days.map(d => x.studyMins[d] || 0), { days, fmtDay, unit: ' min', title: 'Study minutes', cls: 'k-study' });
  return `<dl class="facts">
    <div><dt>Sleep</dt><dd>${w.sleepAvg ? fmtDur(w.sleepAvg) : '–'} <span class="muted">a night</span></dd></div>
    <div><dt>Habits</dt><dd>${w.habitsPct}% <span class="muted">done</span></dd></div>
    <div><dt>Study</dt><dd>${fmtDur(w.studyMins)} <span class="muted">${plural(w.studyRounds, 'round')}</span></dd></div>
    <div><dt>Cooked and timed</dt><dd>${plural(w.cooked, 'dish', 'dishes')} <span class="muted">${w.cookMins ? fmtDur(w.cookMins) : ''}</span></dd></div>
    <div><dt>Moved</dt><dd>${fmtDur(w.moveMins)}</dd></div>
    <div><dt>Trading practice</dt><dd>${plural(w.tradeDays, 'day')}</dd></div>
    <div><dt>Mood</dt><dd>${w.mood ? h(C.ratingWords[Math.round(w.mood)]) : '–'} <span class="muted">${plural(w.reviews, 'review')}</span></dd></div>
  </dl><div class="two charts">${sleepBars}${studyBars}</div>`;
}

/* ================================================================== Settings */
export function settings(x) {
  const r = x.st.routine, st = x.st;
  const dayBoxes = (name, chosen) => `<span class="day-boxes">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" name="${name}" value="${d}"${chosen.includes(d) ? ' checked' : ''}><span>${C.DAY_NAMES[d]}</span></label>`).join('')}</span>`;
  const routine = `<form class="form" data-form="routine" id="routine">
    <div class="fgrid"><label>Wake up<input type="time" name="wake" value="${h(r.wake)}" required></label><label>Lights out<input type="time" name="sleep" value="${h(r.sleep)}" required></label>
    <label>Work starts<input type="time" name="workStart" value="${h(r.workStart)}"></label><label>Work ends<input type="time" name="workEnd" value="${h(r.workEnd)}"></label>
    <label>Commute (min)<input type="number" name="commute" min="0" max="180" value="${r.commute}"></label><label>Wind down (min before)<input type="number" name="windDown" min="0" max="120" value="${st.windDown}"></label>
    <label>Review at<input type="time" name="reviewAt" value="${h(st.reviewAt)}" placeholder="auto"><span class="hint">Empty: 45 minutes before lights out</span></label><label>Trading practice at<input type="time" name="tradeAt" value="${h(st.tradeAt)}"><span class="hint">Empty: no fixed time</span></label></div>
    <fieldset><legend>Work days</legend>${dayBoxes('workdays', r.workdays)}</fieldset>
    <fieldset><legend>Office days</legend>${dayBoxes('office', r.office)}</fieldset>
    <fieldset><legend>Fast days (eat in the evening)</legend>${dayBoxes('fastDays', st.fastDays)}</fieldset>
    <p class="hint">The routine is shared with LLM From Zero’s study clock, so its study blocks move when you change it here.</p>
    <div class="row-actions"><button class="btn primary" type="submit">Save the routine</button></div></form>`;
  const habits = `<form class="form" data-form="habits" id="habits"><ul class="habit-edit">${x.habitDefs.map((hb, i) => `<li><input name="name" value="${h(hb.name)}" maxlength="60" aria-label="Habit ${i + 1}"><input type="hidden" name="id" value="${h(hb.id)}"><input type="hidden" name="auto" value="${h(hb.auto || '')}">${btn('Remove', 'habit-del', { i, 'aria-label': 'Remove ' + hb.name }, 'linkish')}${hb.auto ? `<span class="hint">Ticks itself from ${h({ study: 'study rounds', cook: 'meals eaten', trade: 'Dojo use', bed: 'the sleep log', read: 'book pages', move: '30 minutes of logged activity' }[hb.auto] || hb.auto)}.</span>` : ''}</li>`).join('')}</ul>
    <div class="row-actions">${btn('Add a habit', 'habit-add', {}, 'btn ghost small')}${btn('Back to the defaults', 'habit-reset', {}, 'btn ghost small')}<button class="btn primary" type="submit">Save habits</button></div></form>`;
  const rm = st.remind, tog = (name, label, on) => `<label class="toggle"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${label}</label>`;
  const reminders = `<form class="form" data-form="remind">${tog('bedtime', `Wind down and bedtime (${fromMin(C.bedMinute(r) - st.windDown)}, ${r.sleep})`, rm.bedtime)}${tog('review', `Evening review (${fromMin(C.reviewMinute(st))})`, rm.review)}${tog('prep', 'Kitchen prep: soaking, sprouting, marinating', rm.prep)}${tog('morning', 'Morning: log your wake-up', rm.morning)}${tog('keepAwake', 'Keep the screen on while a cooking timer runs', st.keepAwake)}
    <p class="status-line">Notifications: <b>${h({ granted: 'allowed', denied: 'blocked in the browser’s site settings', default: 'not asked yet', unsupported: 'not supported here' }[x.notif] || x.notif)}</b> ${x.notif === 'default' ? btn('Allow notifications', 'notif', {}, 'btn small') : ''}${x.notif === 'granted' ? btn('Send a test', 'notif-test', {}, 'btn ghost small') : ''}</p>
    <p class="hint">Reminders and timers ring while Dinachari is open, in front or in the background. A phone closes background apps to save battery, so for alarms that must ring with the app closed, add the routine to your calendar: it has a reminder at each time.</p>
    <div class="row-actions"><button class="btn primary" type="submit">Save reminders</button>${btn('Add the routine to my calendar (.ics)', 'ics', {}, 'btn ghost small')}</div></form>`;
  const install = `<div id="install">${x.installed ? '<p><span class="tag good">Installed</span> Dinachari opens as its own app.</p>' : x.canInstall ? `<p>Put Dinachari on your home screen or Start menu, with its own window.</p><div class="row-actions">${btn('Install Dinachari', 'install', {}, 'btn primary')}</div>` :
    '<p><b>Android, in Chrome:</b> menu (⋮), then <i>Add to home screen</i> or <i>Install app</i>.</p><p><b>Windows, in Edge or Chrome:</b> the install icon at the right end of the address bar, or menu, then <i>Apps</i>, then <i>Install this site as an app</i>.</p>'}
    <p class="hint">Long-press the icon (Android) or right-click it on the taskbar (Windows) for shortcuts: I’m awake, Going to sleep, New timer, Review today.</p></div>`;
  const sy = x.sync, conflicts = Object.keys(sy.meta.conflicts || {}).length;
  const sync = `<div id="sync">${sy.token ? `<p>Signed in to GitHub ${sy.via === 'github' ? 'through LLM From Zero' : 'with a token'}${sy.work ? ', in work mode (this browser forgets it when closed)' : ''}. ${sy.meta.last ? 'Last sync ' + ago(x.now - sy.meta.last) + '.' : 'Not synced yet.'}</p>
      ${sy.error ? `<p class="note bad">${h(sy.error)}</p>` : ''}${sy.report ? `<p class="muted small">${h(sy.report)}</p>` : ''}${conflicts ? '<p class="note">A copy needs your choice: see Today.</p>' : ''}
      <div class="row-actions">${btn(sy.busy ? 'Syncing…' : 'Sync now', 'sync', { disabled: sy.busy }, 'btn primary')}${btn('Sign out of GitHub', 'signout', {}, 'btn ghost small')}</div>`
    : sy.needsToken ? `<p>Work mode: paste your token again for this browser session.</p>${tokenForm()}`
      : `<p>Keep your phone and laptop the same: Dinachari, Kitchen and Dalal Dojo sync through a secret gist in your own GitHub account. It is the same sign-in LLM From Zero uses, so signing in once covers both.</p><div class="row-actions">${btn('Sign in with GitHub', 'signin', {}, 'btn primary')}</div><details><summary>Use a token instead</summary>${tokenForm()}</details>`}
    <p class="hint">Dinachari records merge item by item. Kitchen and Dojo are synced as whole copies: if both devices changed one since the last sync, nothing is overwritten and you choose. Sign-in tokens and API keys never go into the gist. LLM From Zero syncs its own progress from its own page.</p></div>`;
  const data = `<p>Everything stays in this browser on this device${sy.token ? ', plus your sync gist' : ''}. A backup file holds Dinachari, Kitchen, LLM From Zero (its studio data) and Dalal Dojo, without sign-in tokens or API keys.</p>
    <div class="row-actions">${btn('Download a backup', 'backup', {}, 'btn')}<label class="btn ghost file-btn">Restore from a backup<input type="file" accept="application/json,.json" data-act="restore" hidden></label></div>
    <p class="status-line">${x.persisted ? '<span class="tag good">Kept</span> The browser keeps this site’s data even when space runs low.' : `Storage may be cleared if the device runs out of space. ${btn('Ask to keep it', 'persist', {}, 'btn ghost small')}`}${x.storageUse ? ` <span class="muted">${x.storageUse}</span>` : ''}</p>`;
  const offline = `<ul class="offline">${x.offline.map(o => `<li><span class="tag ${o.ok ? 'good' : ''}">${o.ok ? 'Works offline' : 'Online only'}</span> ${h(o.name)}${o.ok ? '' : ` <span class="muted small">${h(o.how)}</span>`}</li>`).join('')}</ul>`;
  const look = `<form class="form" data-form="look"><fieldset><legend>Appearance</legend><span class="seg">${['auto', 'light', 'dark'].map(t => `<label><input type="radio" name="theme" value="${t}"${(x.ui.theme || 'auto') === t ? ' checked' : ''}><span>${{ auto: 'Follow the device', light: 'Light', dark: 'Dark' }[t]}</span></label>`).join('')}</span></fieldset>
    <fieldset><legend>Open Kitchen, LLM From Zero and Dalal Dojo</legend><span class="seg">${[['auto', 'Automatic'], ['same', 'In this window'], ['new', 'In a new window']].map(([v, n]) => `<label><input type="radio" name="openApps" value="${v}"${st.openApps === v ? ' checked' : ''}><span>${n}</span></label>`).join('')}</span><span class="hint">Automatic: a new window on a laptop, so Dinachari’s timers keep running; the same window on a phone, where Back returns here.</span></fieldset>
    <div class="row-actions"><button class="btn primary" type="submit">Save</button></div></form>`;
  return `<div class="page settings"><h1 class="page-h">Settings</h1>
    ${block('sleep', 'Routine', routine)}${block('', 'Habits', habits)}${block('', 'Reminders and alarms', reminders)}${block('', 'Install', install)}${block('', 'Sync', sync)}
    ${block('', 'Your data', data)}${block('', 'Offline', offline)}${block('', 'Look and apps', look)}
    ${block('', 'About', `<p>Dinachari ${h(x.version)}: one app for the day, on top of Kitchen From Zero, LLM From Zero and Dalal Dojo. Each app keeps working on its own.</p><p class="hint">The day starts at 04:00, so after midnight still counts as the evening before.</p>`)}</div>`;
}
const tokenForm = () => `<form class="inline-form" data-form="token"><label class="grow">GitHub token <input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label><label class="toggle"><input type="checkbox" name="work"> Work or shared computer</label><button class="btn" type="submit">Connect</button></form><p class="hint">A fine-grained token with only “Gists: read and write”.</p>`;

/* ================================================================== sheets */
const sheet = (title, body, actions) => `<header class="sheet-h"><h2>${title}</h2><button class="icon-btn" value="cancel" formnovalidate aria-label="Close">${icon('<path d="M6 6l12 12M18 6 6 18"/>')}</button></header><div class="sheet-body">${body}</div><footer class="sheet-f">${actions}</footer>`;
const seg5 = (name, value, label) => `<fieldset class="seg5"><legend>${label}</legend>${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${name}" value="${n}"${+value === n ? ' checked' : ''}><span>${C.ratingWords[n]}</span></label>`).join('')}</fieldset>`;
const dt = ms => { const d = new Date(ms); return `${C.ymd(d)}T${C.clock(ms)}`; };

export function sheetReview(x, date, facts, rev, top) {
  const f = facts, night = f.night;
  const lines = [
    night ? `Slept ${night.mins ? fmtDur(night.mins) : '(bedtime not logged)'}${night.bed ? `, ${C.clock(night.bed)} to ${C.clock(night.wake)}` : ''}` : 'No sleep logged for last night',
    f.study ? `Study: ${f.study.steps != null ? f.study.steps + ' of 5 steps, ' : ''}${plural(f.study.rounds || 0, 'round')}` : '',
    f.meals != null ? `Meals eaten from Kitchen: ${f.meals}` : '',
    `Habits: ${f.habitsDone} of ${f.habitsTotal}`,
    f.moveMins ? `Moved ${fmtDur(f.moveMins)}` : '',
    f.cooks.length ? `Cooked ${f.cooks.map(c => c.dish).join(', ')}` : '',
    f.trade ? 'Trading practice done' : ''
  ].filter(Boolean);
  const t = (top && top.items) || [];
  return sheet(`Review: ${h(relDay(date, x.today))}`, `<input type="hidden" name="date" value="${h(date)}">
    <ul class="facts-strip">${lines.map(l => `<li>${h(l)}</li>`).join('')}</ul>
    ${seg5('mood', rev && rev.mood, 'Mood')}${seg5('energy', rev && rev.energy, 'Energy')}
    <label>One win today<input name="win" maxlength="200" value="${h(rev && rev.win)}" placeholder="Cooked lunch in 40 minutes"></label>
    <label>One thing to do better<input name="better" maxlength="200" value="${h(rev && rev.better)}" placeholder="Screens off by 22:00"></label>
    <label>Learned today<input name="learned" maxlength="200" value="${h(rev && rev.learned)}" placeholder="Study or trading: one line"></label>
    <fieldset><legend>Tomorrow’s three</legend>${[0, 1, 2].map(i => `<input name="top" maxlength="100" value="${h(t[i] && t[i].t)}" aria-label="Tomorrow, ${i + 1}" placeholder="${['The one thing that matters most', 'Second', 'Third'][i]}">`).join('')}</fieldset>`,
    `<button class="btn primary" value="save" data-form="review">Save the review</button>`);
}
export function sheetWeek(x) {
  const w = x.week, rv = x.weekReview || {};
  const notes = x.tnotes.filter(n => C.dayOf(n.at) >= w.dates[0]).map(n => n.text);
  const learned = x.reviews.filter(r => r.d >= w.dates[0] && r.learned).map(r => r.learned);
  return sheet(`Week ${h(C.isoWeek(x.today).split('-W')[1])}: ${h(fmtDay(w.dates[0]))} to ${h(fmtDay(w.dates[6]))}`, `<input type="hidden" name="week" value="${h(C.isoWeek(x.today))}">
    ${weekSummary(x)}${[...learned, ...notes].length ? `<h3 class="sub-h">What you noted this week</h3><ul class="facts-strip">${[...learned, ...notes].slice(0, 8).map(l => `<li>${h(l)}</li>`).join('')}</ul>` : ''}
    <label>What went well<textarea name="well" rows="2" maxlength="400">${h(rv.well)}</textarea></label>
    <label>What got in the way<textarea name="hard" rows="2" maxlength="400">${h(rv.hard)}</textarea></label>
    <label>One focus for next week<input name="focus" maxlength="160" value="${h(rv.focus)}"></label>`,
    `<button class="btn primary" value="save" data-form="week">Save the week</button>`);
}
export function sheetTimer(x) {
  const presets = C.PRESETS.map(p => `<button type="button" class="btn preset" data-act="timer-start" data-label="${h(p.label)}" data-mins="${p.mins}" data-kind="${p.kind}">${h(p.label)} <span class="muted">${p.mins >= 60 ? p.mins / 60 + ' h' : p.mins + ' min'}</span></button>`).join('');
  return sheet('Start a timer', `<div class="presets">${presets}</div><div class="fgrid"><label>Minutes<input name="mins" type="number" min="1" max="720" value="10" inputmode="numeric"></label><label>Name<input name="label" maxlength="40" placeholder="Timer"></label></div>
    <p class="hint">To measure how long a dish takes you, use “Time a dish” on Cook.</p>`, `<button class="btn primary" value="save" data-form="timer">Start</button>`);
}
export function sheetCook(x, c) {
  return sheet(c && c.id ? 'Your dish' : 'Log a dish', `<input type="hidden" name="id" value="${h(c && c.id)}">
    <label>Dish<input name="dish" required maxlength="60" value="${h(c && c.dish)}" list="dish-list2"></label><datalist id="dish-list2">${x.cookBook.map(b => `<option value="${h(b.dish)}">`).join('')}</datalist>
    <div class="fgrid"><label>Minutes it took<input name="mins" type="number" min="1" max="600" value="${h(c && c.mins)}"></label><label>Book estimate (min)<input name="est" type="number" min="1" max="600" value="${h(c && c.est)}"></label></div>
    <fieldset class="seg5"><legend>How was it?</legend>${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}"${c && +c.rating === n ? ' checked' : ''}><span>${'★'.repeat(n)}</span></label>`).join('')}</fieldset>
    <fieldset><legend>Cook it again?</legend><span class="seg"><label><input type="radio" name="again" value="yes"${c && c.again === true ? ' checked' : ''}><span>Yes</span></label><label><input type="radio" name="again" value="no"${c && c.again === false ? ' checked' : ''}><span>No</span></label></span></fieldset>
    <label>Notes<input name="note" maxlength="200" value="${h(c && c.note)}" placeholder="Less water next time"></label>`,
    `${c && c.id ? btn('Delete', 'del', { id: c.id, close: 1 }, 'btn ghost danger') : ''}<button class="btn primary" value="save" data-form="cook">Save</button>`);
}
export function sheetAct(x) {
  const types = ['Walk', 'Run', 'Cycle', 'Swim', 'Yoga', 'Martial arts', 'Gym', 'Sport', 'Stretching', 'Other'];
  return sheet('Log activity', `<fieldset><legend>What</legend><span class="seg wrap">${types.map((t, i) => `<label><input type="radio" name="type" value="${t}"${i === 0 ? ' checked' : ''}><span>${t}</span></label>`).join('')}</span></fieldset>
    <fieldset><legend>Minutes</legend><span class="seg">${[10, 20, 30, 45, 60, 90].map(n => `<label><input type="radio" name="mins" value="${n}"${n === 30 ? ' checked' : ''}><span>${n}</span></label>`).join('')}</span></fieldset>
    <label>Note<input name="note" maxlength="120" placeholder="Evening walk around the lake"></label>`, `<button class="btn primary" value="save" data-form="act">Save</button>`);
}
export function sheetSleep(x, n) {
  const base = n || { date: x.today, bed: C.atMinute(C.addDays(x.today, -1), C.bedMinute(x.st.routine)), wake: C.atMinute(x.today, C.onDay(x.st.routine.wake)) };
  return sheet(n ? 'Edit the night' : 'Add a night', `<input type="hidden" name="id" value="${h(n && n.id)}">
    <div class="fgrid"><label>Went to bed<input type="datetime-local" name="bed" value="${base.bed ? dt(base.bed) : ''}"></label><label>Woke up<input type="datetime-local" name="wake" value="${dt(base.wake)}" required></label></div>
    ${seg5('q', n && n.q, 'How did you sleep?')}<label>Note<input name="note" maxlength="120" value="${h(n && n.note)}" placeholder="Late dinner, woke at 3"></label>`,
    `${n ? btn('Delete this night', 'del', { id: n.id, close: 1 }, 'btn ghost danger') : ''}<button class="btn primary" value="save" data-form="sleep">Save</button>`);
}
export function sheetWakeAt(x) {
  const open = x.sleep.open, guess = C.atMinute(x.today, C.onDay(x.st.routine.wake));
  const v = guess < x.now ? guess : x.now - 30 * 60000;
  return sheet('When did you wake up?', `<label>Woke up at<input type="datetime-local" name="wake" value="${dt(v)}" required></label>${open ? `<p class="muted small">In bed since ${C.clock(open.bed)}.</p>` : '<p class="muted small">Bedtime wasn’t logged; you can add it after, from Me.</p>'}`, `<button class="btn primary" value="save" data-form="wake-at">Save</button>`);
}
export function sheetBook(x, b) {
  return sheet(b ? 'Update the book' : 'Add a book', `<input type="hidden" name="id" value="${h(b && b.id)}"><label>Title<input name="title" required maxlength="100" value="${h(b && b.title)}"></label>
    <fieldset><legend>Kind</legend><span class="seg"><label><input type="radio" name="kind" value="other"${!b || b.kind !== 'study' ? ' checked' : ''}><span>Not for study</span></label><label><input type="radio" name="kind" value="study"${b && b.kind === 'study' ? ' checked' : ''}><span>For study</span></label></span></fieldset>
    <div class="fgrid"><label>Pages in all<input name="pages" type="number" min="0" max="5000" value="${h(b && b.pages)}"></label><label>On page<input name="page" type="number" min="0" max="5000" value="${h(b && b.page)}"></label></div>`,
    `${b ? btn('Remove the book', 'del', { id: b.id, close: 1 }, 'btn ghost danger') : ''}<button class="btn primary" value="save" data-form="book">Save</button>`);
}
export function sheetNote() {
  return sheet('What I learned', '<label>One line<textarea name="text" rows="3" maxlength="400" required placeholder="Moved my stop-loss and turned a small loss into a big one"></textarea></label>', '<button class="btn primary" value="save" data-form="tnote">Save</button>');
}
export function sheetRestore(b, counts) {
  return sheet('Restore from a backup', `<p>Backup from ${h(new Date(b.at).toLocaleString('en-IN'))}.</p>
    <ul class="checks plain">${[['dinachari', 'Dinachari', 'merged with what is here: the newer copy of each item wins'], ['kitchen', 'Kitchen From Zero', 'replaces Kitchen’s data here'], ['llm', 'LLM From Zero (studio data)', 'replaces it here; practice progress has its own backup'], ['dojo', 'Dalal Dojo', 'replaces the desk and lessons here']]
      .filter(([k]) => counts[k]).map(([k, n, note]) => `<li><label><input type="checkbox" name="app" value="${k}" checked><span><b>${n}</b><br><span class="small muted">${note}</span></span></label></li>`).join('')}</ul>`,
    '<button class="btn primary" value="save" data-form="restore">Restore</button>');
}
export function sheetTop3(x, date) {
  const t = (x.top3Of(date) || []);
  return sheet(`Three things for ${h(relDay(date, x.today).toLowerCase())}`, `<input type="hidden" name="date" value="${h(date)}">${[0, 1, 2].map(i => `<input name="top" maxlength="100" value="${h(t[i] && t[i].t)}" aria-label="Thing ${i + 1}">`).join('')}`, '<button class="btn primary" value="save" data-form="top3">Save</button>');
}

export { LINKS };
