// Dinachari: the page. The rules are in core.mjs, the other apps' data in sources.mjs, sync in
// sync.mjs, the screens in views.mjs. This file keeps the state, handles taps and forms, and runs the
// system services: timers that ring, reminders, notifications, the screen wake lock, the app badge,
// install, sharing, backups, sync and reading Kitchen's plan in the background.

import * as C from './core.mjs';
import * as Src from './sources.mjs';
import * as Sync from './sync.mjs';
import * as V from './views.mjs';

export const VERSION = '1.0.0';
const KEY = 'day.v1', TIMERS = 'day.timers', FIRED = 'day.fired', UI = 'day.ui', SEEN = 'day.routine.seen';
const store = window.localStorage;
const $ = (s, el = document) => el.querySelector(s);
const read = (k, d) => { try { const v = store.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { store.setItem(k, JSON.stringify(v)); return true; } catch { toast('Could not save on this device: its storage is full or blocked.'); return false; } };
const android = typeof window.KitchenAndroid === 'object' && window.KitchenAndroid;
const device = /Android/i.test(navigator.userAgent) ? 'your Android phone' : /Windows/i.test(navigator.userAgent) ? 'your Windows laptop' : 'another device';

let S = C.normState(read(KEY, null));
let timers = (read(TIMERS, []) || []).filter(t => t && t.id && Number.isFinite(t.start));
let ui = { tab: 'today', fullDay: false, theme: 'auto', introDone: false, ...read(UI, {}) };
let x = null, routineFrom = false, installEvt = null, kitchenBusy = false, kitchenTried = 0, syncTimer = null;
let syncState = { busy: false, error: '', report: '' }, undoSnap = null, extras = { offline: [], persisted: false, storageUse: '' };
const tabs = ['today', 'cook', 'learn', 'trade', 'prep', 'me', 'settings'];
if (!tabs.includes(ui.tab)) ui.tab = 'today';

function save({ sync = true } = {}) { write(KEY, S); if (sync) scheduleSync(); }
const saveTimers = () => write(TIMERS, timers);
const saveUi = () => write(UI, ui);
const snapshot = () => { undoSnap = JSON.stringify(S); };

/* ================================================================== the context for the screens */
function autosFor(date, { k, d, l, llm, st }) {
  const a = {}, rounds = Src.roundsOn(store, date);
  if (rounds.length) a.study = `${rounds.length} study round${rounds.length > 1 ? 's' : ''}, ${rounds.reduce((n, r) => n + (+r.mins || 0), 0)} min`;
  else if (llm && llm.steps && llm.steps.done >= 3) a.study = `${llm.steps.done} of 5 study steps`;
  const cooked = C.all(S, 'cook').filter(c => c.at && C.dayOf(c.at) === date), eaten = Src.eatenOn(k.state, date);
  if (cooked.length) a.cook = 'Cooked ' + cooked[0].dish;
  else if (eaten.length) a.cook = eaten.map(sl => ({ b: 'Breakfast', l: 'Lunch', d: 'Dinner' })[sl]).join(', ') + ' eaten, from Kitchen';
  const t = Src.tradedOn(d, l, date); if (t) a.trade = t;
  const open = C.get(S, C.OPEN_SLEEP);
  const night = open && C.dayOf(open.bed) === date ? { bed: open.bed } : C.nights(S).find(n => n.bed && C.dayOf(n.bed) === date);
  if (night && C.bedOnTime(night, st.routine)) a.bed = 'In bed at ' + C.clock(night.bed);
  const book = C.all(S, 'book').find(b => b.kind !== 'study' && b.log && b.log[date] != null);
  if (book) a.read = 'Read ' + book.title;
  const acts = C.all(S, 'act').filter(v => v.at && C.dayOf(v.at) === date), mins = acts.reduce((n, v) => n + (+v.mins || 0), 0);
  if (mins >= 30) a.move = `${mins} min: ${[...new Set(acts.map(v => v.type.toLowerCase()))].join(', ')}`;
  return a;
}
function adoptRoutineFromLlm() {
  const lr = Src.llmRoutine(store);
  if (!lr) return;
  const hsh = C.hash(JSON.stringify(lr)), seen = store.getItem(SEEN);
  if (seen === hsh) return;
  store.setItem(SEEN, hsh);
  const cur = C.get(S, 'settings');
  if (!cur || seen) { C.patch(S, 'settings', { ...(cur || {}), routine: C.normRoutine(lr) }); routineFrom = !cur; save(); }
}
function pushRoutineToLlm(routine) {
  const merged = { ...(Src.llmRoutine(store) || {}), ...C.normRoutine(routine) };
  if (Src.writeLlmRoutine(store, merged)) store.setItem(SEEN, C.hash(JSON.stringify(merged)));
}
async function systemExtras() {
  const out = { offline: [], persisted: false, storageUse: '' };
  try {
    const regs = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    const scopes = regs.map(r => new URL(r.scope).pathname), has = p => scopes.includes(p);
    const cached = async u => { try { return !!(window.caches && await caches.match(u)); } catch { return false; } };
    out.offline = [
      { name: 'Dinachari', ok: has('/'), how: 'Reload this page once while online.' },
      { name: 'Kitchen From Zero', ok: has('/Kitchen/'), how: 'Open it once while online.' },
      { name: 'LLM From Zero', ok: has('/llm-from-zero/'), how: 'Open it once while online; its Settings can save everything for offline, Python included.' },
      { name: 'Dalal Dojo desk', ok: has('/') && await cached('/dalal-dojo/'), how: 'Open it once from here while online.' },
      { name: 'Dojo lessons and lab', ok: has('/') && await cached('/dalal-dojo-lessons/'), how: 'Open it once from here while online.' }
    ];
  } catch {}
  try { out.persisted = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch {}
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); out.storageUse = `Using ${(e.usage / 1048576).toFixed(1)} MB here.`; } } catch {}
  return out;
}

async function gather() {
  adoptRoutineFromLlm();
  const now = Date.now(), today = C.dayOf(now), yesterday = C.addDays(today, -1), tomorrow = C.addDays(today, 1);
  const st = C.settingsOf(S), minute = C.dayMinute(now);
  const k = Src.kitchen(store), d = Src.dojo(store), l = Src.dojoLessons(store);
  const [llm, llmT] = await Promise.all([Src.llm(store, today, st.routine), Src.llm(store, tomorrow, st.routine)]);
  const habitDefs = C.habitsOf(st), ctx = { k, d, l, st };
  const autoToday = autosFor(today, { ...ctx, llm }), autoYest = autosFor(yesterday, ctx);
  if (C.keepAutoTicks(S, today, habitDefs, autoToday) + C.keepAutoTicks(S, yesterday, habitDefs, autoYest)) save();
  const day = Src.mealsOn(k, today), prep = Src.prepList(k);
  const items = C.buildDay({ date: today, settings: st, study: llm.blocks, meals: day ? day.meals : [], prep, now: minute });
  const list = C.nights(S), open = C.get(S, C.OPEN_SLEEP);
  const log = read('lfz-clock-log', []), studyMins = {}, studyRounds = {};
  for (const r of Array.isArray(log) ? log : []) if (r && r.at) { const dd = C.dayOf(r.at); studyMins[dd] = (studyMins[dd] || 0) + (+r.mins || 0); studyRounds[dd] = (studyRounds[dd] || 0) + 1; }
  // what the other apps saw, for every day the history and the week show (only today and yesterday are saved)
  const autoMap = { [today]: autoToday, [yesterday]: autoYest }, autoOf = dd => autoMap[dd] || (autoMap[dd] = dd > today ? {} : autosFor(dd, ctx));
  const tradeDays = new Set(C.all(S, 'hab').filter(r => r.h === 'trade' && r.on).map(r => r.d));
  const traded = autoToday.trade || '';
  if (traded) tradeDays.add(today);
  const habitHistory = {};
  for (const dd of C.lastDays(today, 14)) habitHistory[dd] = Object.fromEntries(C.habitDay(S, dd, habitDefs, autoOf(dd)).map(hb => [hb.id, hb.on]));
  const dates = C.weekDates(today);
  const facts = C.weekFacts(S, dates, st, dd => ({ auto: autoOf(dd), study: { rounds: studyRounds[dd] || 0, mins: studyMins[dd] || 0 },
    meals: Src.eatenOn(k.state, dd).length, trade: tradeDays.has(dd) }));
  const sync = { ...Sync.signIn(store), meta: Sync.readMeta(store), ...syncState };
  x = {
    version: VERSION, now, today, minute, st, tab: ui.tab, ui, android: !!android, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    dayKind: C.dayKind(st.routine, today), fast: st.fastDays.includes(C.weekday(today)),
    hasSettings: !!C.get(S, 'settings'), routineFrom,
    items, nn: C.nowNext(items, minute), habits: C.habitDay(S, today, habitDefs, autoToday), habitDefs, habitHistory,
    sleep: { open, list, wokeToday: list.find(n => n.date === today) || null, stats: C.sleepStats(list, st.routine, today) },
    kitchen: { ...k, day, tomorrow: Src.mealsOn(k, tomorrow), refreshing: kitchenBusy },
    prep, llm, llmTomorrow: llmT.blocks, streak: Src.studyStreak(store, today), studyMins,
    dojo: d, lessons: l, traded, tradeDays,
    top3: (C.get(S, 'top3:' + today) || {}).items || [], top3Of: date => (C.get(S, 'top3:' + date) || {}).items || [],
    review: C.get(S, 'rev:' + today), weekReview: C.get(S, 'wrev:' + C.isoWeek(today)),
    reviews: C.all(S, 'rev').filter(r => r.d).sort((a, b) => (a.d < b.d ? 1 : -1)),
    week: { dates, facts }, cookBook: C.cookBook(S),
    acts: C.all(S, 'act').sort((a, b) => b.at - a.at), books: C.all(S, 'book').sort((a, b) => b.u - a.u), tnotes: C.all(S, 'tnote').sort((a, b) => b.at - a.at),
    weights: Src.weights(k.state), timers, sync,
    notif: 'Notification' in window ? Notification.permission : 'unsupported',
    installed: matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true,
    canInstall: !!installEvt, ...extras
  };
  return x;
}
let gathering = null;
function refresh() {
  if (!gathering) gathering = gather().then(() => { gathering = null; render(); maybeRefreshKitchen(); badge(); }).catch(e => { gathering = null; console.error(e); });
  return gathering;
}

/* ================================================================== drawing */
let lastRender = 0;
function render() {
  if (!x) return;
  x.dprep = new Set(C.all(S, 'dprep').filter(r => r.done).map(r => r.id.slice(6))); x.tab = ui.tab; x.timers = timers; x.ui = ui; x.canInstall = !!installEvt; x.now = Date.now(); Object.assign(x, extras);
  x.sync = { ...Sync.signIn(store), meta: Sync.readMeta(store), ...syncState };
  document.documentElement.dataset.tab = ui.tab;
  $('#top').innerHTML = V.topbar(x);
  $('#side').innerHTML = V.side(x);
  $('#tabs').innerHTML = V.nav(x);
  $('#timers').innerHTML = V.timersBar(x);
  document.body.classList.toggle('has-timers', timers.length > 0);
  const view = { today: V.today, cook: V.cook, learn: V.learn, trade: V.trade, prep: V.prep, me: V.me, settings: V.settings }[ui.tab] || V.today;
  $('#main').innerHTML = view(x);
  document.title = ui.tab === 'today' ? 'Dinachari' : `${{ cook: 'Cook', learn: 'Learn', trade: 'Trade', prep: 'Disney prep', me: 'Me', settings: 'Settings' }[ui.tab]} · Dinachari`;
  lastRender = Date.now();
}
const typing = () => { const a = document.activeElement; return a && a !== document.body && $('#main').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox'; };
function softRender() { if (!x || typing() || $('#sheet').open) return; x.now = Date.now(); x.minute = C.dayMinute(x.now); x.items.forEach(it => { it.past = (it.end ?? it.start) < x.minute; }); x.nn = C.nowNext(x.items, x.minute); render(); }
function setTab(t, focus) {
  ui.tab = tabs.includes(t) ? t : 'today'; saveUi();
  render(); window.scrollTo(0, 0);
  if (location.hash.slice(1) !== ui.tab) history.replaceState(null, '', ui.tab === 'today' ? location.pathname : '#' + ui.tab);
  if (focus) setTimeout(() => { const el = document.getElementById(focus); if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); (el.querySelector('input, button') || el).focus({ preventScroll: true }); } }, 60);
  else $('#main').focus({ preventScroll: true });
}

/* ================================================================== feedback */
let toastTimer = null;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${C.esc(msg)}</span>${action ? `<button type="button" class="toast-btn" data-act="${C.esc(action.act)}">${C.esc(action.label)}</button>` : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), action ? 8000 : 4500);
}
let audio = null;
function unlockAudio() {
  if (audio) { if (audio.state === 'suspended') audio.resume().catch(() => {}); return; }
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
}
function chime(times = 3) {
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const t0 = audio.currentTime + 0.05;
  for (let i = 0; i < times; i++) {
    const o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.45;
    o.type = 'sine'; o.frequency.value = i % 2 ? 660 : 880;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.4);
  }
}
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
const ACTIONS = { sleep: [{ action: 'sleep', title: 'Going to sleep' }], wake: [{ action: 'wake', title: 'I’m awake' }], review: [{ action: 'review', title: 'Review now' }],
  timer: [{ action: 'timer-stop', title: 'Stop' }], cook: [{ action: 'cook', title: 'Open' }], trade: [{ action: 'trade', title: 'Open' }] };
const ACT_LABEL = { sleep: 'Going to sleep', wake: 'I’m awake', review: 'Review now', cook: 'Open Cook', trade: 'Open Trade', 'timer-stop': 'Stop' };
async function notify({ title, body, short = '', act = '', tag = '', force = false }) {
  const visible = document.visibilityState === 'visible';
  if (visible) toast(`${title}: ${short || body}`, ACT_LABEL[act] ? { act: act === 'cook' || act === 'trade' ? 'goto-' + act : act, label: ACT_LABEL[act] } : null);
  if (!('Notification' in window) || Notification.permission !== 'granted' || (visible && !force)) return;
  const opts = { body, tag: tag || act || 'dinachari', icon: '/day/icons/icon-192.png', badge: '/day/icons/badge-96.png', data: { act }, renotify: true, actions: ACTIONS[act] || [], requireInteraction: act === 'timer' };
  try {
    const reg = 'serviceWorker' in navigator ? await Promise.race([navigator.serviceWorker.getRegistration('/'), new Promise(r => setTimeout(r, 1500))]) : null;
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch {}
  try { new Notification(title, { body, tag: opts.tag, icon: opts.icon }); } catch {}
}
async function badge() {
  if (!x || !('setAppBadge' in navigator)) return;
  const n = x.prep.filter(t => !t.done && t.start && t.start <= Date.now() && t.by > Date.now() - 36e5).length + timers.filter(t => C.timerDone(t)).length + x.top3.filter(t => !t.done).length;
  try { n ? await navigator.setAppBadge(n) : await navigator.clearAppBadge(); } catch {}
}

/* ================================================================== timers and reminders */
function startTimer(opt) {
  unlockAudio();
  const t = opt.up ? C.newStopwatch(opt) : C.newTimer(opt);
  timers.push(t); saveTimers(); keepAwake();
  toast(t.up ? `Stopwatch started for ${t.dish || 'your dish'}.` : `${t.label}: ${C.fmtLeft(t.secs)}. It rings here, even in the background.`);
  render();
}
function stopTimer(id) { timers = timers.filter(t => t.id !== id); saveTimers(); keepAwake(); render(); badge(); }
function ringTimer(t) {
  t.rang = Date.now(); t.rings = 1; saveTimers();
  chime(5); buzz([500, 200, 500, 200, 500]);
  notify({ title: `${t.label} is done`, body: `Your ${C.fmtDur(t.secs / 60)} timer has finished.`, act: 'timer', tag: 'timer-' + t.id, force: true });
  render(); badge();
}
let wakeLock = null;
async function keepAwake() {
  const want = C.settingsOf(S).keepAwake && timers.some(t => t.kind === 'cook' && !t.paused && !C.timerDone(t));
  if (android && android.keepAwake) { try { android.keepAwake(want); } catch {} return; }
  if (want && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
  } else if (!want && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
function checkReminders(now = Date.now()) {
  if (!x) return;
  const fired = read(FIRED, {});
  const list = C.remindersFor({ date: x.today, settings: x.st, items: x.items, prep: x.prep, openSleep: x.sleep.open, reviewed: !!x.review });
  for (const r of C.dueNow(list, fired, now)) { fired[r.key] = now; notify(r); if (r.act !== 'cook') chime(2); }
  for (const [k, at] of Object.entries(fired)) if (now - at > 3 * 864e5) delete fired[k];
  write(FIRED, fired);
}
let lastMinute = -1, lastReminder = 0, lastGather = Date.now();
function tick() {
  const now = Date.now();
  if (x && C.dayOf(now) !== x.today) { refresh(); return; }
  const hm = C.clock(now);
  document.querySelectorAll('[data-clock="hm"]').forEach(el => { if (el.textContent !== hm) el.textContent = hm; });
  for (const t of timers) {
    const el = document.querySelector(`[data-left="${CSS.escape(t.id)}"]`), done = C.timerDone(t, now);
    if (el) el.textContent = done ? 'Done' : C.fmtLeft(t.up ? C.elapsed(t, now) : C.timerLeft(t, now));
    if (done && !t.rang) ringTimer(t);
    else if (done && t.rang && t.rings < 6 && now - t.rang > t.rings * 15000) { t.rings++; saveTimers(); chime(3); buzz([300, 150, 300]); }
  }
  const lt = x && x.llm.timer, lel = document.querySelector('[data-llm-left]');
  if (lt && lel) { const left = Math.max(0, (lt.phase === 'work' ? lt.work : lt.rest) - Math.floor((now - lt.start) / 1000)); lel.textContent = C.fmtLeft(left); }
  const m = C.dayMinute(now);
  if (m !== lastMinute) { lastMinute = m; softRender(); }
  if (now - lastReminder > 20000) { lastReminder = now; checkReminders(now); }
  if (now - lastGather > 3 * 60000 && document.visibilityState === 'visible' && !typing()) { lastGather = now; refresh(); }
}

/* ================================================================== Kitchen's plan, read in the background */
// Kitchen writes its summary whenever it is open. When the summary is old, Dinachari opens Kitchen in
// a hidden frame on this same site for a few seconds, which makes Kitchen write a fresh one.
function refreshKitchen(force = false) {
  const k = Src.kitchen(store);
  if (kitchenBusy || (!force && !k.used) || !document.body) return Promise.resolve(false);
  kitchenBusy = true; kitchenTried = Date.now(); if (x) { x.kitchen.refreshing = true; softRender(); }
  return new Promise(resolve => {
    const f = document.createElement('iframe');
    f.src = '/Kitchen/#today'; f.className = 'ghost-frame'; f.title = 'Kitchen From Zero, reading today’s plan'; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
    const done = ok => { window.removeEventListener('storage', on); clearTimeout(tm); f.remove(); kitchenBusy = false; refresh(); resolve(ok); };
    const on = e => { if (e.key === 'kfz.summary') setTimeout(() => done(true), 250); };
    const tm = setTimeout(() => done(false), 20000);
    window.addEventListener('storage', on);
    document.body.appendChild(f);
  });
}
function maybeRefreshKitchen() {
  if (!x || kitchenBusy || Date.now() - kitchenTried < 30 * 60000) return;
  const k = x.kitchen;
  if (!k.used) return;
  if (!k.summary || k.summary.date !== x.today || Src.summaryAge(k) > 3 * 36e5) refreshKitchen();
}

/* ================================================================== sync */
function scheduleSync(delay = 15000) {
  clearTimeout(syncTimer);
  if (!Sync.signIn(store).token || !Sync.readMeta(store).on) return;
  syncTimer = setTimeout(() => runSync(), delay);
}
async function runSync(manual = false) {
  if (syncState.busy) return;
  if (!Sync.signIn(store).token) { if (manual) setTab('settings', 'sync'); return; }
  if (!navigator.onLine && !manual) return;
  clearTimeout(syncTimer);
  syncState = { ...syncState, busy: true, error: '' }; render();
  try {
    const r = await Sync.syncNow({ state: S, store, device });
    const before = JSON.stringify((C.get(S, 'settings') || {}).routine || null);
    S = C.mergeStates(S, r.state).state; write(KEY, S);
    const after = (C.get(S, 'settings') || {}).routine;
    if (after && JSON.stringify(after) !== before) pushRoutineToLlm(after);
    syncState = { busy: false, error: '', report: Sync.describe(r.report) };
    if (r.downloaded.includes('kitchen')) refreshKitchen(true);
    if (manual || r.report.got.length || r.report.conflicts.length) toast(Sync.describe(r.report));
  } catch (e) {
    syncState = { busy: false, error: e.message || 'Sync failed.', report: '' };
    if (manual) toast(syncState.error);
  }
  refresh();
}
async function signInGitHub() {
  try {
    const auth = await import('/llm-from-zero/auth.mjs');
    if (!auth.configured()) throw new Error('not set up');
    location.href = auth.signInUrl({ back: location.origin + '/?synced=1#settings', base: location.origin + '/llm-from-zero/' });
  } catch {
    toast('Opening LLM From Zero’s sync settings: sign in there, then come back.');
    setTimeout(() => { location.href = '/llm-from-zero/studio.html#setup'; }, 1200);
  }
}
async function connectToken(token, work) {
  try {
    const cs = await import('/llm-from-zero/cloud-sync.mjs');
    await cs.connect(token, { work });
    toast('Connected. Syncing now.'); runSync(true);
  } catch (e) { toast(e.message || 'Could not connect that token.'); }
}
async function signOut() {
  if (!confirm('Sign out of GitHub sync on this device? LLM From Zero uses the same sign-in, so it signs out too. Your data stays here.')) return;
  try { const auth = await import('/llm-from-zero/auth.mjs'); await auth.signOut(); }
  catch { store.removeItem('lfz-sync-v1'); try { sessionStorage.removeItem('lfz-sync-token'); } catch {} }
  syncState = { busy: false, error: '', report: '' }; toast('Signed out. Data stays on this device.'); refresh();
}

/* ================================================================== files */
function download(name, text, type = 'application/json') {
  if (android && android.saveFile && type === 'application/json') { const p = android.saveFile(name, text); toast(p ? 'Saved to ' + p : 'Could not save the file.'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
let pendingRestore = null;
async function startRestore(file) {
  try {
    const b = JSON.parse(await file.text());
    if (!b || b.app !== 'dinachari-site-backup' || !b.keys || typeof b.keys !== 'object') throw new Error('This is not a Dinachari backup file.');
    pendingRestore = b; openSheet(V.sheetRestore(b, Src.backupApps(b.keys)));
  } catch (e) { toast(e.message || 'Could not read that file.'); }
}
function applyRestore(apps) {
  const b = pendingRestore; if (!b) return false;
  const pick = { dinachari: k => k === KEY, kitchen: k => k.startsWith('kfz.'), llm: k => k.startsWith('lfz-'), dojo: k => k.startsWith('dojo.') || k.startsWith('dalal-dojo') };
  let n = 0;
  for (const [k, v] of Object.entries(b.keys)) {
    if (typeof v !== 'string' || Src.SECRET_KEYS.test(k)) continue;
    const app = Object.keys(pick).find(a => pick[a](k));
    if (!app || !apps.includes(app)) continue;
    if (k === KEY) { const theirs = C.normState(JSON.parse(v)); S = C.mergeStates(S, theirs).state; save(); n++; continue; }
    try { store.setItem(k, v); n++; } catch {}
  }
  pendingRestore = null;
  toast(`Restored ${n} saved item${n === 1 ? '' : 's'}.`);
  refresh();
  return true;
}

/* ================================================================== sheets */
const dlg = () => $('#sheet');
function openSheet(html) {
  const d = dlg(), f = $('#sheet-form');
  f.innerHTML = html;
  if (!d.open) d.showModal();
  const first = f.querySelector('.sheet-body input:not([type=hidden]):not([type=radio]):not([type=checkbox]), .sheet-body textarea');
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
}
const closeSheet = () => { if (dlg().open) dlg().close(); };
const num = v => (v === '' || v == null ? null : Number.isFinite(+v) ? +v : null);
const parseLocal = v => { if (!v) return null; const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };
const sheetForms = {
  review(fd) {
    const date = fd.get('date');
    C.put(S, { id: 'rev:' + date, k: 'rev', d: date, mood: num(fd.get('mood')), energy: num(fd.get('energy')),
      win: (fd.get('win') || '').trim(), better: (fd.get('better') || '').trim(), learned: (fd.get('learned') || '').trim() });
    const next = C.addDays(date, 1), old = (C.get(S, 'top3:' + next) || {}).items || [];
    const items = fd.getAll('top').map(t => String(t).trim()).filter(Boolean).map(t => ({ t, done: !!(old.find(o => o.t === t) || {}).done }));
    if (items.length || old.length) C.put(S, { id: 'top3:' + next, k: 'top3', d: next, items });
    save(); toast(items.length ? 'Saved. Tomorrow’s three are on Today.' : 'Review saved.'); return true;
  },
  week(fd) {
    C.put(S, { id: 'wrev:' + fd.get('week'), k: 'wrev', w: fd.get('week'), well: (fd.get('well') || '').trim(), hard: (fd.get('hard') || '').trim(), focus: (fd.get('focus') || '').trim() });
    save(); toast('Weekly review saved.'); return true;
  },
  timer(fd) { const mins = num(fd.get('mins')); if (!mins) return false; startTimer({ label: (fd.get('label') || '').trim() || `${mins} min timer`, secs: mins * 60, kind: 'cook' }); return true; },
  cook(fd) {
    const id = fd.get('id') || '', old = id ? C.get(S, id) : null, dish = (fd.get('dish') || '').trim();
    if (!dish) return false;
    const again = fd.get('again');
    C.put(S, { ...(old || {}), id: id || undefined, k: 'cook', at: old ? old.at : (this._at || Date.now()), dish, mins: num(fd.get('mins')), est: num(fd.get('est')),
      rating: num(fd.get('rating')), again: again === 'yes' ? true : again === 'no' ? false : null, note: (fd.get('note') || '').trim() });
    if (this._timer) { stopTimer(this._timer); this._timer = null; }
    this._at = null; save(); toast(`Saved ${dish}.`); return true;
  },
  act(fd) { C.put(S, { k: 'act', at: Date.now(), type: fd.get('type') || 'Other', mins: num(fd.get('mins')) || 0, note: (fd.get('note') || '').trim() }); save(); toast('Activity logged.'); return true; },
  sleep(fd) {
    const bed = parseLocal(fd.get('bed')), wake = parseLocal(fd.get('wake'));
    if (!wake || (bed && bed >= wake) || (bed && wake - bed > 20 * 36e5)) { toast('Check the times: bedtime must be before waking, within 20 hours.'); return false; }
    const date = C.ymd(new Date(wake)), id = 'sleep:' + date, oldId = fd.get('id');
    snapshot();
    if (oldId && oldId !== id) C.remove(S, oldId);
    const old = C.get(S, id) || {};
    C.put(S, { ...old, id, k: 'sleep', d: date, bed, wake, q: num(fd.get('q')), note: (fd.get('note') || '').trim() });
    save(); toast('Night saved.', { act: 'undo', label: 'Undo' }); return true;
  },
  'wake-at'(fd) {
    const t = parseLocal(fd.get('wake'));
    if (!t || t > Date.now() + 60000) { toast('Pick a time that has already passed.'); return false; }
    snapshot(); const n = C.wakeUp(S, t); save();
    toast(n.bed ? `Good morning. You slept ${C.fmtDur((n.wake - n.bed) / 60000)}.` : 'Good morning. Wake-up logged.', { act: 'undo', label: 'Undo' }); return true;
  },
  book(fd) {
    const id = fd.get('id') || '', old = id ? C.get(S, id) : null, title = (fd.get('title') || '').trim();
    if (!title) return false;
    const page = num(fd.get('page')), log = { ...((old && old.log) || {}) };
    if (page != null && (!old || page !== old.page)) log[C.dayOf()] = page;
    C.put(S, { ...(old || {}), id: id || undefined, k: 'book', title, kind: fd.get('kind') === 'study' ? 'study' : 'other', pages: num(fd.get('pages')), page, log });
    save(); return true;
  },
  tnote(fd) { const text = (fd.get('text') || '').trim(); if (!text) return false; C.put(S, { k: 'tnote', at: Date.now(), text }); save(); toast('Noted.'); return true; },
  restore(fd) { return applyRestore(fd.getAll('app')); },
  top3(fd) {
    const date = fd.get('date'), old = (C.get(S, 'top3:' + date) || {}).items || [];
    C.put(S, { id: 'top3:' + date, k: 'top3', d: date, items: fd.getAll('top').map(t => String(t).trim()).filter(Boolean).map(t => ({ t, done: !!(old.find(o => o.t === t) || {}).done })) });
    save(); return true;
  }
};

/* ================================================================== forms on the pages */
const pageForms = {
  routine(fd) {
    const st = C.settingsOf(S), days = n => fd.getAll(n).map(Number);
    const routine = C.normRoutine({ wake: fd.get('wake'), sleep: fd.get('sleep'), workStart: fd.get('workStart'), workEnd: fd.get('workEnd'), commute: num(fd.get('commute')), workdays: days('workdays'), office: days('office') });
    C.patch(S, 'settings', { ...st, routine, windDown: num(fd.get('windDown')) ?? 30, reviewAt: fd.get('reviewAt') || '', tradeAt: fd.get('tradeAt') || '', fastDays: days('fastDays') });
    pushRoutineToLlm(routine); save();
    toast('Routine saved. LLM From Zero’s study clock uses it too.'); refresh();
  },
  habits(fd) {
    const names = fd.getAll('name'), ids = fd.getAll('id'), autos = fd.getAll('auto');
    const habits = names.map((n, i) => ({ id: ids[i] || 'h' + Date.now().toString(36) + i, name: String(n).trim(), ...(autos[i] ? { auto: autos[i] } : {}) })).filter(hb => hb.name);
    C.patch(S, 'settings', { ...C.settingsOf(S), habits }); save(); toast('Habits saved.'); refresh();
  },
  remind(fd) {
    const st = C.settingsOf(S);
    C.patch(S, 'settings', { ...st, remind: { bedtime: !!fd.get('bedtime'), review: !!fd.get('review'), prep: !!fd.get('prep'), morning: !!fd.get('morning') }, keepAwake: !!fd.get('keepAwake') });
    save(); toast('Reminders saved.'); refresh();
  },
  look(fd) {
    ui.theme = fd.get('theme') || 'auto'; saveUi(); applyTheme();
    C.patch(S, 'settings', { ...C.settingsOf(S), openApps: fd.get('openApps') || 'auto' }); save(); toast('Saved.'); refresh();
  },
  token(fd) { connectToken(String(fd.get('token') || ''), !!fd.get('work')); },
  'timer-custom'(fd) { const mins = num(fd.get('mins')); if (mins) startTimer({ label: (fd.get('label') || '').trim() || `${mins} min timer`, secs: mins * 60, kind: 'cook' }); },
  stopwatch(fd) {
    const dish = (fd.get('dish') || '').trim();
    const est = x && x.kitchen.day ? (x.kitchen.day.meals.flatMap(m => m.dishes).find(d => d.title.toLowerCase() === dish.toLowerCase()) || {}).mins || null : null;
    startTimer({ up: true, dish, label: dish || 'Cooking', est });
  }
};
function applyTheme() { const t = ui.theme; if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

/* ================================================================== taps */
function openApp(a, e) {
  const mode = C.settingsOf(S).openApps === 'auto' ? (matchMedia('(pointer: fine) and (min-width: 900px)').matches ? 'new' : 'same') : C.settingsOf(S).openApps;
  if (mode === 'new' && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault(); window.open(a.href, '_blank'); }
}
const handlers = {
  tab: el => setTab(el.dataset.tab, el.dataset.focus),
  'goto-cook': () => setTab('cook'), 'goto-trade': () => setTab('trade'),
  bed() {
    snapshot(); C.goToBed(S); save();
    toast(`Good night. Bedtime logged at ${C.clock(Date.now())}.`, { act: 'undo', label: 'Undo' }); refresh();
  },
  'bed-undo'() { C.remove(S, C.OPEN_SLEEP); save(); toast('Bedtime removed.'); refresh(); },
  wake() {
    snapshot(); const n = C.wakeUp(S); save();
    toast(n.bed ? `Good morning. You slept ${C.fmtDur((n.wake - n.bed) / 60000)}.` : 'Good morning. Wake-up logged.', { act: 'undo', label: 'Undo' }); refresh();
  },
  'wake-at'() { openSheet(V.sheetWakeAt(x)); },
  'sleep-rate'(el) { C.patch(S, el.dataset.id, { q: +el.dataset.q }); save(); toast('Thanks. Noted how you slept.'); refresh(); },
  'sleep-edit'(el) { const n = x.sleep.list.find(v => v.id === el.dataset.id); if (n) openSheet(V.sheetSleep(x, n)); },
  'sleep-new'() { openSheet(V.sheetSleep(x, null)); },
  habit(el) {
    const hb = x.habits.find(v => v.id === el.dataset.h); if (!hb) return;
    C.toggleHabit(S, x.today, hb.id, !hb.on); save(); buzz(15); refresh();
  },
  'full-day'() { ui.fullDay = !ui.fullDay; saveUi(); render(); },
  'timer-new'() { openSheet(V.sheetTimer(x)); },
  'timer-start'(el) { closeSheet(); startTimer({ label: el.dataset.label, secs: +el.dataset.mins * 60, kind: el.dataset.kind || 'cook' }); },
  'timer-stop'(el) { if (el.dataset.id) stopTimer(el.dataset.id); else { timers = timers.filter(t => !C.timerDone(t)); saveTimers(); render(); } },
  'timer-pause'(el) { timers = timers.map(t => t.id === el.dataset.id ? (t.paused ? C.resumeTimer(t) : C.pauseTimer(t)) : t); saveTimers(); keepAwake(); render(); },
  'timer-add'(el) { timers = timers.map(t => t.id === el.dataset.id ? { ...t, secs: Math.ceil(C.elapsed(t)) + (+el.dataset.mins || 5) * 60, rang: null, rings: 0 } : t); saveTimers(); render(); },
  'timer-save'(el) {
    const t = timers.find(v => v.id === el.dataset.id); if (!t) return;
    sheetForms._timer = t.id; sheetForms._at = t.start;
    timers = timers.map(v => v.id === t.id ? C.pauseTimer(v) : v); saveTimers();
    openSheet(V.sheetCook(x, { dish: t.dish, mins: Math.max(1, Math.round(C.elapsed(t) / 60)), est: t.est }));
  },
  'kitchen-refresh'() { refreshKitchen(true).then(ok => toast(ok ? 'Read today’s plan from Kitchen.' : 'Kitchen did not answer. Open it once while online.')); },
  async 'share-shop'() {
    const text = Src.shoppingText(x.kitchen);
    if (!text) { toast('Nothing on the list.'); return; }
    if (android && android.shareText) { android.shareText(text); return; }
    if (navigator.share) { try { await navigator.share({ title: 'Shopping list', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Shopping list copied.'); } catch { toast('Could not share or copy here.'); }
  },
  review(el) { const date = el.dataset.date || x.today; openSheet(V.sheetReview(x, date, C.dayFacts(S, date, x.st, { auto: date === x.today ? Object.fromEntries(x.habits.filter(h => h.reason).map(h => [h.auto, h.reason])) : {}, study: { rounds: Src.roundsOn(store, date).length, steps: date === x.today && x.llm.steps ? x.llm.steps.done : null }, meals: Src.eatenOn(x.kitchen.state, date).length, trade: x.tradeDays.has(date) }), C.get(S, 'rev:' + date), C.get(S, 'top3:' + C.addDays(date, 1)))); },
  'week-review'() { openSheet(V.sheetWeek(x)); },
  'act-new'() { openSheet(V.sheetAct(x)); },
  'cook-new'() { sheetForms._timer = null; sheetForms._at = null; openSheet(V.sheetCook(x, null)); },
  'book-new'() { openSheet(V.sheetBook(x, null)); },
  'book-edit'(el) { openSheet(V.sheetBook(x, C.get(S, el.dataset.id))); },
  'book-pages'(el) {
    const b = C.get(S, el.dataset.id); if (!b) return;
    const page = Math.min(b.pages || Infinity, (b.page || 0) + (+el.dataset.n || 10));
    C.patch(S, b.id, { page, log: { ...(b.log || {}), [x.today]: page } }); save(); toast(`${b.title}: page ${page}.`); refresh();
  },
  'tnote-new'() { openSheet(V.sheetNote()); },
  del(el) {
    const r = C.get(S, el.dataset.id); if (!r) return;
    snapshot(); C.remove(S, r.id); save(); if (el.dataset.close) closeSheet();
    toast('Deleted.', { act: 'undo', label: 'Undo' }); refresh();
  },
  undo() { if (!undoSnap) return; S = C.normState(JSON.parse(undoSnap)); undoSnap = null; save(); toast('Undone.'); refresh(); },
  async notif() {
    if (!('Notification' in window)) { toast('This browser has no notifications.'); return; }
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notifications on. Bedtime, prep and timers will ring.' : 'Notifications are blocked. You can allow them in the browser’s site settings.'); refresh();
  },
  'notif-test'() { notify({ title: 'Dinachari', body: 'This is how reminders look.', act: 'review', force: true }); chime(2); },
  async install() {
    if (!installEvt) { setTab('settings', 'install'); return; }
    installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null;
    if (r && r.outcome === 'accepted') toast('Installing Dinachari.'); refresh();
  },
  ics() { download('dinachari-routine.ics', C.routineIcs(x.st, { url: location.origin + '/' }), 'text/calendar'); toast('Open the file to add the routine to your calendar, with an alarm at each time.'); },
  sync() { runSync(true); },
  signin: signInGitHub, signout: signOut,
  conflict(el) { if (Sync.resolve(el.dataset.id, el.dataset.choice, store)) { toast(el.dataset.choice === 'synced' ? 'Using the synced copy. Your old copy is kept for undo.' : 'Keeping this device’s copy. It is sent on the next sync.'); runSync(true); } },
  backup() { download(`dinachari-backup-${x.today}.json`, JSON.stringify(Src.siteBackup(store), null, 1)); },
  async persist() { const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; toast(ok ? 'The browser will keep this site’s data.' : 'The browser said no; install the app and try again.'); extras = await systemExtras(); refresh(); },
  'habit-add'() { const ul = $('.habit-edit'); if (!ul) return; const li = document.createElement('li'); li.innerHTML = '<input name="name" maxlength="60" placeholder="New habit" aria-label="New habit"><input type="hidden" name="id" value=""><input type="hidden" name="auto" value="">'; ul.append(li); li.querySelector('input').focus(); },
  'habit-del'(el) { el.closest('li').remove(); },
  'habit-reset'() { C.patch(S, 'settings', { ...C.settingsOf(S), habits: null }); save(); toast('Habits back to the defaults.'); refresh(); },
  'intro-done'() { ui.introDone = true; saveUi(); render(); },
  'dial-tip'() {}
};
function showTip(el) { const tip = $('#dial-tip'); if (tip) { tip.textContent = el.dataset.tip; tip.classList.add('show'); clearTimeout(showTip.t); showTip.t = setTimeout(() => tip.classList.remove('show'), 3500); } }

document.addEventListener('click', e => {
  unlockAudio();
  const tip = e.target.closest('[data-tip]');
  if (tip) { showTip(tip); return; }
  const el = e.target.closest('[data-act]');
  if (el && el.tagName !== 'INPUT' && handlers[el.dataset.act]) { e.preventDefault(); handlers[el.dataset.act](el, e); return; }
  const a = e.target.closest('a[data-app]');
  if (a) openApp(a, e);
});
document.addEventListener('pointerover', e => { const tip = e.target.closest && e.target.closest('[data-tip]'); if (tip && e.pointerType === 'mouse') showTip(tip); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('input[data-act="prep"]')) {
    const ok = Src.markPrepDone(store, t.dataset.key, t.checked);
    if (!ok) { t.checked = !t.checked; toast('Open Kitchen once so this can be ticked.'); return; }
    buzz(15); toast(t.checked ? 'Ticked in Kitchen too.' : 'Unticked.'); refresh();
  } else if (t.matches('input[data-act="dprep"]')) {
    C.patch(S, 'dprep:' + t.dataset.id, { done: t.checked }); save(); buzz(15); render();
  } else if (t.matches('input[data-act="top3"]')) {
    const items = x.top3.map((it, i) => i === +t.dataset.i ? { ...it, done: t.checked } : it);
    C.put(S, { id: 'top3:' + x.today, k: 'top3', d: x.today, items }); save(); buzz(15); refresh();
  } else if (t.matches('input[data-act="restore"]') && t.files && t.files[0]) { startRestore(t.files[0]); t.value = ''; }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'sheet-form') {
    const sub = e.submitter;
    if (!sub || sub.value !== 'save') return;
    e.preventDefault();
    const fn = sheetForms[sub.dataset.form];
    if (fn && fn.call(sheetForms, new FormData(f)) !== false) { closeSheet(); refresh(); }
    return;
  }
  const pf = f.dataset && pageForms[f.dataset.form];
  if (pf) { e.preventDefault(); pf(new FormData(f)); }
});
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || dlg().open || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
  const k = e.key.toLowerCase();
  if ('123456'.includes(k) && k.length === 1) setTab(V.TABS[+k - 1].id);
  else if (k === 't') handlers['timer-new']();
  else if (k === 'r') handlers.review({ dataset: {} });
  else if (k === ',') setTab('settings');
  else if (k === 's') { if (x.sleep.open) handlers.wake(); else handlers.bed(); }
  else return;
  e.preventDefault();
});
dlg().addEventListener('close', () => {
  if (sheetForms._timer) { timers = timers.map(t => t.id === sheetForms._timer ? C.resumeTimer(t) : t); saveTimers(); sheetForms._timer = null; render(); }
});

/* ================================================================== the browser around us */
window.addEventListener('storage', e => {
  if (e.key === KEY && e.newValue) { S = C.normState(JSON.parse(e.newValue)); refresh(); }
  else if (e.key === TIMERS) { timers = read(TIMERS, []); render(); }
  else if (e.key && /^(kfz\.(summary|state)|lfz-|dojo\.|dalal-dojo)/.test(e.key)) { clearTimeout(window.__dayStorageT); window.__dayStorageT = setTimeout(refresh, 400); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { keepAwake(); refresh(); checkReminders(); }
  else if (syncTimer) runSync();
});
window.addEventListener('online', () => scheduleSync(2000));
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Dinachari is installed.'); refresh(); });
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (tabs.includes(t) && t !== ui.tab) setTab(t); });
function doAction(act) {
  if (!act) return;
  if (act === 'wake') { if (x.sleep.open || !x.sleep.wokeToday) handlers.wake(); else toast('Your wake-up is already logged.'); }
  else if (act === 'sleep') { if (!x.sleep.open) handlers.bed(); }
  else if (act === 'timer') handlers['timer-new']();
  else if (act === 'timer-stop') { timers = timers.filter(t => !C.timerDone(t)); saveTimers(); render(); }
  else if (act === 'review') handlers.review({ dataset: {} });
  else if (tabs.includes(act)) setTab(act);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'do') doAction(e.data.act); });
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => systemExtras()).then(v => { extras = v; if (ui.tab === 'settings') refresh(); }).catch(() => {}); });
}

/* ================================================================== start */
(async function start() {
  applyTheme();
  const q = new URLSearchParams(location.search), h0 = location.hash.slice(1);
  if (tabs.includes(h0)) ui.tab = h0;
  await gather(); render();
  const act = q.get('do');
  if (q.has('do') || q.has('synced')) history.replaceState(null, '', location.pathname + location.hash);
  if (act) doAction(act);
  setInterval(tick, 1000);
  keepAwake(); checkReminders(); badge();
  extras = await systemExtras();
  if (q.has('synced')) runSync(true); else if (Sync.signIn(store).token && Sync.readMeta(store).on) setTimeout(() => runSync(), 1500);
  maybeRefreshKitchen();
})();
