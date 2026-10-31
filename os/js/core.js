/* Manoj OS core: helpers, saved state, device, the day's schedule, sleep, roasts, sheets and sync.
   The tabs (now.js, cook.js, learn.js, trade.js, life.js) build on these globals. */
"use strict";

const ME = window.OS_ME, D = window.OS_DATA, WEEK = window.OS_WEEK, KINDS = window.OS_KINDS;

/* ------------------------------------------------------------------ helpers */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const hm = m => pad(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ":" + pad(((m % 60) + 60) % 60);
const minOf = d => d.getHours() * 60 + d.getMinutes();
const clockOf = ts => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dur(m) {
  m = Math.max(0, Math.round(m));
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60), r = m % 60;
  return h + " h" + (r ? " " + r + " min" : "");
}
const hrs = m => (m / 60).toFixed(1).replace(/\.0$/, "") + " h";
const rupee = v => (v < 0 ? "−₹" : "₹") + Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(v) < 1000 ? 2 : 0 });
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/* ------------------------------------------------------------------ saved state
   S is synced (GitHub sync, backups). LOC stays on this device (tokens, ActivityWatch, caches). */
const KEY = "mos.v1", LKEY = "mos.local";
function blank() {
  return {
    v: 1, t: 0, set: {}, ticks: {}, pantry: {}, sleep: { nights: {}, pending: null }, screen: {}, appTime: {}, eaten: {},
    cooked: {}, learn: { done: {}, hints: {}, sol: {} }, quiz: {}, quizLog: {}, tl: { done: {}, quiz: {} }, trades: [], laundry: null,
    trips: [], fixit: [], runs: [], books: {}, shelf: null, labs: {}, rules: null, kit: null, radar: { saved: {}, done: {}, topics: null },
    roast: { last: {}, log: [] }, sched: {}, late: {}, tripTicks: {}, watch: [], missions: {}
  };
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
let S = Object.assign(blank(), lsGet(KEY) || {});
let LOC = Object.assign({ aw: { on: false, url: "http://localhost:5600" }, gh: { repo: "", path: "manoj-os.json", token: "" }, awCache: {}, radar: null, seen: {} }, lsGet(LKEY) || {});
for (const [k, v] of Object.entries(blank())) if (S[k] == null) S[k] = v;
let saveTimer = null;
function save(quiet) {
  S.t = Date.now();
  if (!lsSet(KEY, S) && !quiet) toast("Couldn't save on this device (storage full or blocked).");
  if (LOC.gh.token && LOC.gh.repo) { clearTimeout(saveTimer); saveTimer = setTimeout(() => ghSync(true), 8000); }
}
const saveLoc = () => lsSet(LKEY, LOC);
const cfg = k => (S.set[k] != null && S.set[k] !== "" ? S.set[k] : ME[k]);

/* ------------------------------------------------------------------ device */
const UA = navigator.userAgent || "";
const DEV = /Android/i.test(UA) ? "android" : /iPhone|iPad|iPod/i.test(UA) ? "ios" : /Windows/i.test(UA) ? "windows" : /Mac/i.test(UA) ? "mac" : /Linux|CrOS/i.test(UA) ? "linux" : "other";
const PHONE = DEV === "android" || DEV === "ios";
const DEV_LABEL = { android: "📱 Android", ios: "📱 iPhone", windows: "🪟 Windows", mac: "💻 Mac", linux: "🐧 Linux", other: "💻 Laptop" }[DEV];

/* ------------------------------------------------------------------ the day */
const today = () => ymd(new Date());
function tripOn(ds) { return S.trips.find(t => t.from <= ds && ds <= t.to) || null; }
function dayKind(date) {
  const ds = ymd(date), dow = date.getDay();
  if (tripOn(ds)) return "travel";
  if (dow === 0 || dow === 6) return "weekend";
  return ME.officeDays.includes(dow) ? "office" : "wfh";
}
const DAYKIND_LABEL = { office: "🏢 Office day", wfh: "🏠 WFH day", weekend: "🌴 Weekend", travel: "🧳 Travelling" };
const isFast = date => date.getDay() === ME.fastDay && !tripOn(ymd(date));
function rawWeek(dow) { return S.sched[dow] || WEEK[dow]; }
function blocksFor(date) {
  const ds = ymd(date), trip = tripOn(ds);
  const raw = trip ? WEEK.travel : rawWeek(date.getDay());
  const wake = toMin(cfg("wake")), bed = toMin(cfg("bed"));
  let list = raw.map(b => ({ id: b[2] + "-" + b[0], s: toMin(b[0]), e: b[1] === "24:00" ? 1440 : toMin(b[1]), k: b[2], t: b[3], sub: b[4] || [] }))
    .filter(b => b.e > b.s).sort((a, b) => a.s - b.s);
  const first = list.length ? Math.min(list[0].s, wake) : wake, last = list.length ? Math.max(list[list.length - 1].e, bed) : bed;
  const out = [{ id: "sleep-am", s: 0, e: first, k: "sleep", t: "Sleep", sub: [] }];
  let cur = first;
  for (const b of list) {
    if (b.s > cur) out.push({ id: "gap-" + hm(cur), s: cur, e: b.s, k: trip ? "free" : "free", t: trip ? (trip.place ? "Travel · " + trip.place : "Travel / free") : "Buffer", sub: [], gap: true });
    out.push(Object.assign({}, b, { s: Math.max(b.s, cur) }));
    cur = Math.max(cur, b.e);
  }
  if (last > cur) out.push({ id: "gap-" + hm(cur), s: cur, e: last, k: "free", t: "Buffer", sub: [], gap: true });
  out.push({ id: "sleep-pm", s: last, e: 1440, k: "sleep", t: "Sleep", sub: [] });
  return out.filter(b => b.e > b.s);
}
function nowInfo(d = new Date()) {
  const m = minOf(d), list = blocksFor(d);
  const i = list.findIndex(b => b.s <= m && m < b.e);
  const cur = list[i] || list[list.length - 1];
  let next = list.slice(i + 1).find(b => b.k !== "sleep" && !b.gap) || null;
  if (!next) { const tl = blocksFor(addDays(d, 1)); next = tl.find(b => b.k !== "sleep" && !b.gap); if (next) next = Object.assign({ tomorrow: true }, next); }
  return { m, list, cur, i, next, left: cur.e - m };
}
/* Minutes past bedtime (0 when it isn't past). After midnight counts against last night's bedtime. */
function lateBy(d = new Date()) {
  const m = minOf(d), bed = toMin(cfg("bed")), wake = toMin(cfg("wake"));
  if (m >= bed) return m - bed;
  if (m < wake) return wake - m <= 60 ? 0 : m + 1440 - bed;   // the last hour before the alarm counts as an early start, not a late night
  return 0;
}
/* The "night" a moment belongs to is named by the date you'll wake up on. */
function nightKey(d = new Date()) { return minOf(d) >= 12 * 60 ? ymd(addDays(d, 1)) : ymd(d); }
const ticksOf = ds => (S.ticks[ds] = S.ticks[ds] || {});
const isTicked = (ds, id) => !!(S.ticks[ds] && S.ticks[ds][id]);
function dayProgress(date) {
  const ds = ymd(date), list = blocksFor(date).filter(b => b.k !== "sleep" && !b.gap);
  const done = list.filter(b => isTicked(ds, b.id)).length;
  return { done, total: list.length };
}

/* ------------------------------------------------------------------ sleep */
function nights(n = 7) {
  const out = [], d0 = new Date();
  for (let i = n - 1; i >= 0; i--) { const k = ymd(addDays(d0, -i)); out.push([k, S.sleep.nights[k] || null]); }
  return out;
}
const sleptMin = night => night ? Math.round((night.wake - night.bed) / 60000) : 0;
function lastNight() { return S.sleep.nights[today()] || null; }
function goSleep() {
  S.sleep.pending = Date.now(); save(); closeLayer();
  toast("Logged. Good night, Manoj. Phone away from the bed.");
  render();
}
function wakeUp() {
  const now = Date.now();
  if (S.sleep.pending && now - S.sleep.pending < 16 * 3600000) {
    S.sleep.nights[ymd(new Date())] = { bed: S.sleep.pending, wake: now };
    S.sleep.pending = null; save();
    const ds = today(); ticksOf(ds)["wake-" + cfg("wake")] = now;
    toast("Slept " + dur(sleptMin(S.sleep.nights[ymd(new Date())])) + ".");
    checkRoasts("wake", true);
  } else { S.sleep.pending = null; save(); sleepSheet(); return; }
  render();
}
function sleepStats() {
  const ns = nights(7).filter(x => x[1]), target = cfg("sleepTarget") * 60;
  const mins = ns.map(x => sleptMin(x[1]));
  const avg = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;
  const debt = mins.reduce((a, m) => a + Math.max(0, target - m), 0);
  const beds = ns.map(x => { const d = new Date(x[1].bed); let m = minOf(d); if (m < 12 * 60) m += 1440; return m; });
  const mean = beds.length ? beds.reduce((a, b) => a + b, 0) / beds.length : 0;
  const sd = beds.length > 1 ? Math.sqrt(beds.reduce((a, b) => a + (b - mean) ** 2, 0) / beds.length) : 0;
  return { n: ns.length, avg, debt, sd, mean };
}

/* ------------------------------------------------------------------ protein, screen, streaks */
function eatenToday(ds = today()) { return S.eaten[ds] || []; }
const proteinOn = ds => eatenToday(ds).reduce((a, e) => a + (e.p || 0), 0);
const phoneMin = ds => (S.screen[ds] && S.screen[ds].phone) || 0;
function learnedOn(ds) {
  const ex = Object.values(S.learn.done).filter(t => ymd(new Date(t)) === ds).length;
  return ex > 0 || (S.quizLog[ds] || 0) >= 5;
}
function streak() {
  let n = 0, d = new Date();
  if (!learnedOn(ymd(d))) d = addDays(d, -1);
  while (learnedOn(ymd(d)) && n < 999) { n++; d = addDays(d, -1); }
  return n;
}

/* ------------------------------------------------------------------ toasts, sheets, pop-ups */
let toastTimer = null;
function toast(msg) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
let layerOpen = null;
function openSheet(title, html, opts = {}) {
  const L = $("#layer");
  L.innerHTML = `<div class="scrim" data-act="scrim"><div class="sheet ${opts.cls || ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    ${opts.bare ? "" : `<header><h2>${esc(title)}</h2><button class="x" data-act="close" aria-label="Close">×</button></header>`}${html}</div></div>`;
  layerOpen = opts.kind || "sheet";
  document.body.style.overflow = "hidden";
  const first = $(".sheet button, .sheet input, .sheet a", L); if (first && !opts.noFocus) first.focus({ preventScroll: true });
}
function closeLayer() { $("#layer").innerHTML = ""; layerOpen = null; document.body.style.overflow = ""; }

/* ------------------------------------------------------------------ roasts */
const R = window.OS_ROASTS;
function roastText(key, vars) {
  const r = R[key], lvl = cfg("roast");
  const pool = lvl === "gentle" ? r.mild : lvl === "medium" ? r.mild.concat(r.savage.slice(0, 2)) : r.savage;
  const lastLine = (S.roast.log.find(x => x.k === key) || {}).line;
  let line = pick(pool), guard = 0;
  while (pool.length > 1 && line === lastLine && guard++ < 6) line = pick(pool);
  return line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : "…"));
}
let lastAutoRoast = 0;
/* Shows a roast pop-up unless one with this key was shown within `cool` minutes. Auto roasts also wait 6 min between each other. */
function roast(key, vars = {}, opts = {}) {
  if (!R[key]) return false;
  const now = Date.now(), ck = opts.once ? key + ":" + opts.once : key;
  const last = S.roast.last[ck] || 0;
  if (!opts.force) {
    if (opts.once ? last : now - last < (opts.cool || 30) * 60000) return false;
    if (layerOpen) return false;
    if (!opts.urgent && S.focus && S.focus.until > now) return false;
    if (!opts.urgent && now - lastAutoRoast < 6 * 60000) return false;
  }
  const line = roastText(key, vars);
  S.roast.last[ck] = now; lastAutoRoast = now;
  S.roast.log.unshift({ k: key, t: now, line }); S.roast.log = S.roast.log.slice(0, 60);
  save(true);
  showRoast(key, line, vars, opts);
  notify(R[key].icon + " " + R[key].title, line);
  return true;
}
function showRoast(key, line, vars, opts) {
  const r = R[key];
  const cta = opts.cta ? `<button class="btn pri" data-act="${esc(opts.cta[1])}"${opts.cta[2] ? ` data-arg="${esc(opts.cta[2])}"` : ""}>${esc(opts.cta[0])}</button>` : "";
  openSheet(r.title, `<div class="big" aria-hidden="true">${r.icon}</div><div class="lbl">${esc(r.title)}</div>
    <p class="line">${esc(line)}</p>
    <div class="btns">${cta}<button class="btn" data-act="reroast" data-arg="${esc(key)}">Another one 🔥</button><button class="btn ghost" data-act="close">Fair.</button></div>`,
    { cls: "roast", bare: true, kind: "roast" });
  showRoast.vars = vars; showRoast.opts = opts;
}
function reroast(key) {
  const line = roastText(key, showRoast.vars || {});
  S.roast.log.unshift({ k: key, t: Date.now(), line }); save(true);
  const p = $(".roast .line"); if (p) p.textContent = line;
}

/* What the moment calls for. Runs on open, when you come back to the app, every minute, and after some actions. */
function checkRoasts(reason, force) {
  const d = new Date(), ds = ymd(d), info = nowInfo(d), b = info.cur, m = info.m;
  const wake = toMin(cfg("wake")), late = lateBy(d), V = { time: hm(m), bed: cfg("bed"), wake: cfg("wake"), left: dur(info.left), block: b.t, day: DAYS_LONG[d.getDay()] };
  // 1. Riding with the phone out: safety first, always.
  if (PHONE && b.k === "ride") return roast("phone_ride", V, { cool: 10, urgent: true });
  // 2. Up past bedtime.
  if (late > 0 && !S.sleep.pending) {
    const nk = nightKey(d);
    S.late[nk] = S.late[nk] || [];
    if (!S.late[nk].length || Date.now() - S.late[nk][S.late[nk].length - 1] > 10 * 60000) { S.late[nk].push(Date.now()); save(true); }
    return roast(PHONE ? "late_phone" : "late_windows", Object.assign(V, { late: dur(late) }), { cool: late > 90 ? 15 : 25, urgent: true, force, cta: ["Going to sleep 😴", "sleep"] });
  }
  if (late > 0 && S.sleep.pending && Date.now() - S.sleep.pending > 15 * 60000)
    return roast(PHONE ? "late_phone" : "late_windows", Object.assign(V, { late: dur(late) }), { cool: 30, urgent: true, force });
  if (late > 0) return false;
  // 3. Mornings: how the night went.
  const ln = lastNight();
  if (ln && m < wake + 240) {
    const sm = sleptMin(ln), woke = minOf(new Date(ln.wake));
    if (sm < 6 * 60 && roast("sleep_short", Object.assign(V, { slept: dur(sm), goal: cfg("sleepTarget") + " h" }), { once: ds, force, cta: ["Recovery plan", "recover", "sleep"] })) return true;
    if (woke > wake + 30 && roast("woke_late", Object.assign(V, { woke: hm(woke) }), { once: ds, force })) return true;
    if (woke <= wake + 15 && roast("woke_good", Object.assign(V, { woke: hm(woke) }), { once: ds, force })) return true;
  }
  // 4. Laundry left wet.
  if (S.laundry && !S.laundry.hung) {
    const doneAt = S.laundry.start + S.laundry.min * 60000, ago = (Date.now() - doneAt) / 60000;
    if (ago > 20 && roast("laundry_wet", Object.assign(V, { ago: dur(ago) }), { cool: 30, cta: ["Hung them ✓", "hang"] })) return true;
  }
  // 5. Wrong device for the block.
  if (PHONE && ["learn", "research", "book"].includes(b.k) && roast("phone_study", V, { cool: 30, cta: ["Open on laptop ↗", "openllm"] })) return true;
  if (PHONE && ["read", "wind"].includes(b.k) && roast("phone_wind", V, { cool: 15, cta: ["Going to sleep 😴", "sleep"] })) return true;
  if (PHONE && b.k === "work" && roast("phone_work", V, { cool: 120 })) return true;
  if (DEV === "windows" && roast("windows_hello", V, { once: ds })) return true;
  // 6. Yesterday's last utensils.
  if (m < 11 * 60) {
    const y = addDays(d, -1), yl = blocksFor(y).filter(x => x.k === "dishes"), lastD = yl[yl.length - 1];
    if (lastD && !isTicked(ymd(y), lastD.id) && Object.keys(S.ticks[ymd(y)] || {}).length > 2 && roast("dishes", V, { once: ds })) return true;
  }
  // 7. Protein in the evening (on Tuesday only after the fast is broken).
  const target = cfg("proteinTarget"), p = Math.round(proteinOn(ds));
  if (m >= 20 * 60 + (isFast(d) ? 45 : 0) && eatenToday(ds).length && p < target * 0.6 &&
      roast("protein_low", Object.assign(V, { p, target }), { once: ds })) return true;
  // 8. Phone time over the limit.
  if (screenRoast(false)) return true;
  // 9. A broken streak.
  const st = streak();
  if (st === 0) {
    let prev = 0, x = addDays(d, -2);
    while (learnedOn(ymd(x)) && prev < 400) { prev++; x = addDays(x, -1); }
    if (prev >= 2 && roast("streak", Object.assign(V, { n: prev }), { once: ds })) return true;
  }
  return false;
}

function screenRoast(now) {
  const ds = today(), pm = phoneMin(ds), pt = cfg("phoneTarget");
  if (pm <= pt) return false;
  const awake = (24 - cfg("sleepTarget")) * 60, done = Object.values(S.learn.done).filter(t => ymd(new Date(t)) === ds).length;
  return roast("screen_high", { phone: dur(pm), target: dur(pt), pct: Math.round(100 * pm / awake), ex: Math.floor(pm / 25), done }, { once: ds + ":" + pm, urgent: now });
}

/* ------------------------------------------------------------------ notifications */
async function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: title });
    else new Notification(title, { body });
  } catch (e) {}
}
let lastBlockNotified = null;
function blockStartCheck() {
  const info = nowInfo(), b = info.cur, key = today() + b.id;
  if (b.k === "sleep" || b.gap || lastBlockNotified === key) return;
  if (info.m - b.s <= 1) { lastBlockNotified = key; notify((KINDS[b.k] || ["•"])[0] + " " + b.t, hm(b.s) + "–" + hm(b.e)); }
}

/* ------------------------------------------------------------------ laundry timer */
function laundryStart() { S.laundry = { start: Date.now(), min: +cfg("washMin"), hung: false }; save(); toast("Cycle timer started: " + cfg("washMin") + " min."); render(); }
function laundryHang() {
  if (S.laundry) S.laundry.hung = true;
  const ds = today(), b = blocksFor(new Date()).find(x => x.k === "laundry" && /hang/i.test(x.t)); if (b) ticksOf(ds)[b.id] = Date.now();
  S.laundry = null; save(); closeLayer(); toast("Clothes hung. Wardrobe crisis averted."); render();
}
function laundryLeft() { if (!S.laundry) return null; return S.laundry.start + S.laundry.min * 60000 - Date.now(); }

/* ------------------------------------------------------------------ GitHub sync
   Your state as one JSON file in a private repo of yours. The token stays on this device only. */
function b64enc(str) { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function b64dec(b64) { const bin = atob(b64.replace(/\s/g, "")); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
function mergeState(a, b, preferB) {
  if (b == null) return a; if (a == null) return b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.every(x => x && typeof x === "object" && x.id) && b.every(x => x && typeof x === "object" && x.id)) {
      const map = new Map(a.map(x => [x.id, x]));
      for (const x of b) { const y = map.get(x.id); map.set(x.id, !y ? x : ((x.u || 0) > (y.u || 0) || ((x.u || 0) === (y.u || 0) && preferB)) ? x : y); }
      return Array.from(map.values());
    }
    return preferB ? b : a;
  }
  if (typeof a === "object" && typeof b === "object") {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = k in a && k in b ? mergeState(a[k], b[k], preferB) : (k in a ? a[k] : b[k]);
    return out;
  }
  return preferB ? b : a;
}
let syncing = false;
async function ghSync(quiet) {
  const g = LOC.gh; if (!g.token || !g.repo || syncing) return;
  syncing = true;
  const url = "https://api.github.com/repos/" + g.repo + "/contents/" + encodeURIComponent(g.path || "manoj-os.json").replace(/%2F/g, "/");
  const H = { Authorization: "Bearer " + g.token, Accept: "application/vnd.github+json" };
  try {
    let sha = null, remote = null;
    const r = await fetch(url + "?t=" + Date.now(), { headers: H, cache: "no-store" });
    if (r.ok) { const j = await r.json(); sha = j.sha; remote = JSON.parse(b64dec(j.content)); }
    else if (r.status !== 404) throw new Error("GitHub said " + r.status + (r.status === 401 ? " (token wrong or expired)" : r.status === 404 ? "" : ""));
    if (remote) { const keepT = Math.max(S.t, remote.t || 0); S = mergeState(S, remote, (remote.t || 0) > S.t); S.t = keepT; lsSet(KEY, S); }
    const body = { message: "Manoj OS sync " + new Date().toISOString().slice(0, 16), content: b64enc(JSON.stringify(S)) };
    if (sha) body.sha = sha;
    const w = await fetch(url, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify(body) });
    if (!w.ok) throw new Error("GitHub said " + w.status + " on save");
    g.last = Date.now(); saveLoc();
    if (!quiet) { toast("Synced with GitHub."); render(); }
  } catch (e) { g.err = String(e.message || e); saveLoc(); if (!quiet) toast("Sync failed: " + g.err); }
  finally { syncing = false; }
}

/* ------------------------------------------------------------------ calendar export (.ics)
   Weekly repeating events with an alert at the start, so your phone reminds you even when the app is closed. */
const ICS_KINDS = ["wake", "workout", "run", "walk", "cook", "learn", "laundry", "clean", "fix", "people", "book", "research", "trade", "movie", "prep", "read", "review", "errand"];
function buildIcs() {
  const groups = new Map();
  for (let dow = 0; dow < 7; dow++) for (const b of rawWeek(dow)) {
    if (!ICS_KINDS.includes(b[2])) continue;
    const k = b[0] + "|" + b[1] + "|" + b[3];
    if (!groups.has(k)) groups.set(k, { b, days: [] });
    groups.get(k).days.push(dow);
  }
  const BY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"], stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Manoj OS//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Manoj OS",
    "BEGIN:VTIMEZONE", "TZID:Asia/Kolkata", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0530", "TZOFFSETTO:+0530", "TZNAME:IST", "END:STANDARD", "END:VTIMEZONE"];
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const fold = s => s.replace(/[,;\\]/g, m => "\\" + m);
  for (const { b, days } of groups.values()) {
    let first = t0; for (let i = 0; i < 7; i++) { const x = addDays(t0, i); if (days.includes(x.getDay())) { first = x; break; } }
    const dt = (date, t) => ymd(date).replace(/-/g, "") + "T" + t.replace(":", "") + "00";
    const icon = (KINDS[b[2]] || [""])[0];
    lines.push("BEGIN:VEVENT", "UID:mos-" + hash(b.join("|") + days.join("")) + "@manojhunasimarad.github.io", "DTSTAMP:" + stamp,
      "DTSTART;TZID=Asia/Kolkata:" + dt(first, b[0]), "DTEND;TZID=Asia/Kolkata:" + dt(first, b[1] === "24:00" ? "23:59" : b[1]),
      "RRULE:FREQ=WEEKLY;BYDAY=" + days.map(x => BY[x]).join(","), "SUMMARY:" + fold(icon + " " + b[3]),
      "DESCRIPTION:" + fold((b[4] || []).join(" · ") || "From Manoj OS"),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + fold(b[3]), "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ------------------------------------------------------------------ small renderers shared by tabs */
const icon = k => (KINDS[k] || ["•"])[0];
function barHtml(v, total, cls) { const pct = total ? clamp(Math.round(100 * v / total), 0, 100) : 0; return `<div class="bar ${cls || ""}"><i style="width:${pct}%"></i></div>`; }
function barsHtml(items, max, fmt) {
  const top = Math.max(max || 0, ...items.map(x => x.v), 1);
  return `<div class="bars" role="img" aria-label="${esc(items.map(x => x.l + " " + fmt(x.v)).join(", "))}">${items.map(x =>
    `<div class="b" title="${esc(x.l + ": " + fmt(x.v))}"><span>${x.v ? esc(x.short != null ? x.short : fmt(x.v)) : ""}</span><i class="${x.cls || ""}" style="height:${Math.round(78 * x.v / top)}%"></i><span>${esc(x.l)}</span></div>`).join("")}</div>`;
}
function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
