/* Boot: routing, rendering, every tap, timers, and the offline worker. */
"use strict";

const TABS = { now: renderNow, cook: renderCook, learn: renderLearn, trade: renderTrade, life: renderLife };
let tab = "now";
function route() {
  const t = (location.hash || "#now").slice(1).split("/")[0];
  tab = TABS[t] ? t : "now";
  $$(".tabs a").forEach(a => { if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  render(true);
  if (tab === "trade" && !market().open) setTimeout(() => roast("market_closed", {}, { cool: 240 }), 900);
  if (tab === "cook" && isFast(new Date()) && minOf(new Date()) < 17 * 60) setTimeout(() => roast("fast_cook", {}, { once: today() }), 900);
}
function render(top) {
  const main = $("#main"), y = window.scrollY;
  const locked = nightLocked() && tab !== "life";
  try { main.innerHTML = locked ? nightLockHtml() : TABS[tab](); }
  catch (e) { main.innerHTML = `<div class="stack"><section class="card"><h2>Something broke</h2><pre>${esc(e.stack || e)}</pre></section></div>`; console.error(e); }
  if (top) window.scrollTo(0, 0); else window.scrollTo(0, y);
  status();
}
function status() {
  const d = new Date();
  $("#clock").textContent = hm(minOf(d));
  $("#devChip").textContent = DEV_LABEL;
  const late = lateBy(d), chip = $("#dayChip");
  if (late > 0 && !S.sleep.pending) { chip.textContent = "🌙 " + dur(late) + " late"; chip.className = "chip bad"; }
  else if (S.sleep.pending) { chip.textContent = "😴 asleep"; chip.className = "chip"; }
  else { chip.textContent = DAYKIND_LABEL[dayKind(d)] + (isFast(d) ? " · 🙏" : ""); chip.className = "chip"; }
}

/* ------------------------------------------------------------------ taps */
const ACT = {
  scrim: (el, ev) => { if (ev.target === el) closeLayer(); },
  close: () => closeLayer(),
  sleep: () => goSleep(),
  wake: () => wakeUp(),
  sleepsheet: () => sleepSheet(),
  slsave: () => {
    const ds = $("#slDate").value, b = $("#slBed").value, w = $("#slWake").value; if (!ds || !b || !w) return;
    const wd = parseYmd(ds), [wh, wm] = w.split(":").map(Number), [bh, bm] = b.split(":").map(Number);
    const wake = new Date(wd); wake.setHours(wh, wm, 0, 0);
    const bed = new Date(wd); bed.setHours(bh, bm, 0, 0); if (bh >= 12) bed.setDate(bed.getDate() - 1);
    if (bed >= wake) { toast("Bedtime has to be before the wake time."); return; }
    S.sleep.nights[ds] = { bed: +bed, wake: +wake }; save(); closeLayer(); toast("Night saved: " + dur(sleptMin(S.sleep.nights[ds])) + "."); render();
  },
  backtosleep: () => { toast("Phone face down. Good night."); render(true); },
  nightpass: () => {
    nightPassUntil = Date.now() + 10 * 60000; const nk = nightKey(); S.nightPass = S.nightPass || {}; S.nightPass[nk] = (S.nightPass[nk] || 0) + 1; save(true);
    toast("10 minutes. The clock's running and so is the log."); render(true);
  },
  tick: (el) => toggleTick(today(), el.dataset.arg),
  tickday: (el) => toggleTick(el.dataset.ds, el.dataset.arg),
  nowday: (el) => { nowDay = +el.dataset.arg; render(); },
  focus: () => startFocus(),
  focusend: () => endFocus(),
  laundry: () => laundryStart(),
  hang: () => laundryHang(),
  reroast: (el) => reroast(el.dataset.arg),
  recover: (el) => { const x = window.OS_RECOVER.find(r => r.k === el.dataset.arg); if (x) openSheet(x.t, `<p class="muted">${esc(x.why)}</p><ul class="plain">${x.do.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`); },
  openllm: () => { const e = currentEx(); window.open(e ? llmEx(e.id) : ME.links.llm, "_blank", "noopener"); closeLayer(); },
  recipe: (el) => recipeSheet(el.dataset.arg),
  cookshuffle: () => { cookOpt.seed++; render(); },
  cslot: (el) => { cookOpt.slot = el.dataset.arg; render(); },
  cbudget: (el) => { cookOpt.budget = +el.dataset.arg; render(); },
  cdiet: (el) => { cookOpt.diet = el.dataset.arg; render(); },
  people: (el) => { S.set.people = clamp((+(cfg("people") || 1)) + +el.dataset.arg, 1, 8); save(); const open = $(".sheet h2"); if (layerOpen && open) { const id = ($(".sheet [data-act=eat]") || {}).dataset; if (id) recipeSheet(id.arg); } render(); },
  eat: (el) => eat(el.dataset.arg),
  eatx: (el) => eat(null, el.dataset.arg),
  uneat: (el) => { const ds = today(); S.eaten[ds].splice(+el.dataset.arg, 1); save(); render(); },
  cooked: (el) => { S.cooked[el.dataset.arg] = Date.now(); save(); closeLayer(); toast("Marked cooked. It sits out of the picks for 3 days."); render(); },
  pcycle: (el) => { const k = el.dataset.arg; S.pantry[k] = (pstate(k) + 1) % 3; save(true); render(); },
  shoplist: async () => { const t = shopText(); try { await navigator.clipboard.writeText(t); toast("Shopping list copied."); } catch (e) { openSheet("Shopping list", `<pre>${esc(t)}</pre>`); } },
  ex: () => { location.hash = "#learn"; },
  hint: (el) => { const id = el.dataset.arg; S.learn.hints[id] = (S.learn.hints[id] || 0) + 1; save(true); render(); },
  passed: (el) => passEx(el.dataset.arg),
  recall: (el) => { if (!recallQ) return; recallQ.ans = +el.dataset.arg; answerCard(recallQ.id, recallQ.ans); render(); },
  recallnext: () => { recallQ = null; render(); },
  radar: () => radarRefresh(),
  topics: () => topicsSheet(),
  topicssave: () => { const t = $("#topicsTa").value.split("\n").map(l => l.trim()).filter(Boolean).map(l => { const [q, lab] = l.split("|"); return { q: q.trim(), l: (lab || q).trim() }; }); S.radar.topics = t.length ? t : null; save(); closeLayer(); render(); },
  topicsreset: () => { S.radar.topics = null; save(); closeLayer(); render(); },
  rfilter: (el) => { radarFilter = el.dataset.arg; render(); },
  rsave: (el) => radarSave(el.dataset.arg),
  rdone: (el) => radarDone(el.dataset.arg),
  bookpage: (el) => {
    const b = shelf().find(x => x.id === el.dataset.arg), s = S.books[b.id] || {};
    openSheet("Where are you in it?", `<p>${esc(b.t)}</p><label class="f">Page<input type="number" id="bkPage" value="${s.page || ""}" inputmode="numeric"></label><div class="row"><button class="btn pri" data-act="booksave" data-arg="${esc(b.id)}">Save</button></div>`);
  },
  booksave: (el) => { const id = el.dataset.arg; S.books[id] = Object.assign(S.books[id] || {}, { page: +$("#bkPage").value || 0, u: Date.now() }); save(); closeLayer(); render(); },
  bookdone: (el) => { const id = el.dataset.arg; S.books[id] = Object.assign(S.books[id] || {}, { done: Date.now() }); save(); toast("Finished. Pick the next one."); render(); },
  shelfedit: () => openSheet("Edit the shelf", `<p class="small muted">One book per line: <code>tech or fun | title | pages | note</code>. The first unfinished of each kind is “now”.</p>
    <textarea id="shelfTa" style="min-height:200px">${esc(shelf().map(b => [b.kind, b.t, b.pages || "", b.note || ""].join(" | ")).join("\n"))}</textarea>
    <div class="row"><button class="btn pri" data-act="shelfsave">Save</button><button class="btn ghost" data-act="shelfreset">Reset</button></div>`),
  shelfsave: () => {
    const rows = $("#shelfTa").value.split("\n").map(l => l.split("|").map(x => x.trim())).filter(r => r.length >= 2 && r[1]);
    S.shelf = rows.map(r => { const old = shelf().find(b => b.t === r[1]); return { id: old ? old.id : "b" + hash(r[1]).toString(36), kind: r[0] === "tech" ? "tech" : "fun", t: r[1], pages: +r[2] || 0, note: r[3] || "", url: old && old.url }; });
    save(); closeLayer(); render();
  },
  shelfreset: () => { S.shelf = null; save(); closeLayer(); render(); },
  newtrade: () => newTradeSheet(),
  savetrade: () => saveTrade(),
  closetrade: (el) => closeTradeSheet(el.dataset.arg),
  savetradeclose: (el) => {
    const t = S.trades.find(x => x.id === el.dataset.arg), x = +$("#tExit").value; if (!x) { toast("Enter the exit price."); return; }
    t.exit = x; t.closed = Date.now(); t.plan = $("#tPlan").checked; t.note = $("#tNote").value.trim(); t.u = Date.now();
    const r = tradeResult(t); save(); closeLayer(); toast("Closed: " + rupee(r.net) + " after " + rupee(r.ch) + " charges (" + r.r.toFixed(2) + "R)."); render();
  },
  deltrade: (el) => { if (!confirmTwice(el)) return; S.trades = S.trades.filter(t => t.id !== el.dataset.arg); save(); render(); },
  csv: () => tradeCsv(),
  tquiz: (el) => { const id = el.dataset.arg; lessonQ[id] = lessonQ[id] || {}; lessonQ[id][+el.dataset.q] = +el.dataset.i; render(); },
  tdone: (el) => { S.tl.done[el.dataset.arg] = Date.now(); save(); toast("Lesson done."); render(true); },
  lifesec: (el) => { lifeSec = el.dataset.arg; weekEdit = false; render(); },
  runlog: () => openSheet("Log a run", `<div class="grid2"><label class="f">Distance (km)<input type="number" id="rnKm" step="0.1" inputmode="decimal"></label><label class="f">Time (min)<input type="number" id="rnMin" inputmode="numeric"></label></div>
    <label class="f">Note<input type="text" id="rnNote" placeholder="easy / intervals / long"></label><div class="row"><button class="btn pri" data-act="runsave">Save</button></div>`),
  runsave: () => { const km = +$("#rnKm").value, mn = +$("#rnMin").value; if (!km) return; S.runs.push({ id: uid(), u: Date.now(), at: Date.now(), km, min: mn, note: $("#rnNote").value.trim() }); save(); closeLayer(); toast("Run logged."); render(); },
  testroast: () => {
    const keys = Object.keys(R), k = pick(["late_phone", "late_windows", "windows_hello", "phone_study", "screen_high", "protein_low", "woke_late", "laundry_wet", "dishes", "movie_late"]);
    roast(k, { time: hm(minOf(new Date())), bed: cfg("bed"), wake: cfg("wake"), late: "47 min", left: "32 min", block: "Python block", phone: "4 h 10 min", target: dur(cfg("phoneTarget")), pct: 26, ex: 10, done: 0, p: 54, slept: "5 h 20 min", goal: cfg("sleepTarget") + " h", woke: "07:12", ago: "48 min", mins: 110, day: DAYS_LONG[new Date().getDay()], away: "1 h 20 min", n: 6 }, { force: true });
    void keys;
  },
  phonelog: () => phoneSheet(),
  phtop: (el) => { phoneSheet.top = el.dataset.arg; $$(".sheet [data-act=phtop]").forEach(b => b.setAttribute("aria-pressed", b === el)); },
  phsave: () => { const m = (+$("#phH").value || 0) * 60 + (+$("#phM").value || 0); S.screen[today()] = { phone: m, top: phoneSheet.top, t: Date.now() }; save(); closeLayer(); render(); setTimeout(() => screenRoast(true), 400); },
  awon: () => { LOC.aw.on = true; saveLoc(); awFetch(); },
  awoff: () => { LOC.aw.on = false; saveLoc(); render(); },
  awfetch: () => awFetch(),
  labs: () => labsSheet(),
  labsave: () => {
    const date = $("#labDate").value;
    for (const L of window.OS_LABS) {
      const v = $(`[data-lab="${L.k}"]`).value, lo = $(`[data-lablo="${L.k}"]`).value, hi = $(`[data-labhi="${L.k}"]`).value;
      if (v === "" && lo === "" && hi === "") continue;
      const prev = S.labs[L.k] || {};
      S.labs[L.k] = { v: v === "" ? prev.v : +v, lo: lo === "" ? null : +lo, hi: hi === "" ? null : +hi, date: v === "" ? prev.date : date, hist: (prev.hist || []).concat(v !== "" && prev.v != null && prev.date !== date ? [[prev.date, prev.v]] : []) };
    }
    save(); closeLayer(); render();
  },
  editlist: (el) => editListSheet(el.dataset.arg),
  listsave: (el) => { const o = {}; $$(".sheet [data-list]").forEach(t => { o[t.dataset.list] = t.value.split("\n").map(s => s.trim()).filter(Boolean); }); S[el.dataset.arg] = o; save(); closeLayer(); render(); },
  listreset: (el) => { S[el.dataset.arg] = null; save(); closeLayer(); render(); },
  fixadd: () => { const t = $("#fixNew").value.trim(); if (!t) return; S.fixit.push({ id: uid(), u: Date.now(), t }); save(); render(); },
  fixdone: (el) => { const f = S.fixit.find(x => x.id === el.dataset.arg); f.done = Date.now(); f.u = Date.now(); save(); toast("Fixed. Landlord-level competence."); render(); },
  watchadd: () => { const t = $("#watchNew").value.trim(); if (!t) return; S.watch.push({ id: uid(), u: Date.now(), t }); save(); render(); },
  watchdone: (el) => { const w = S.watch.find(x => x.id === el.dataset.arg); w.done = Date.now(); w.u = Date.now(); save(); render(); },
  tripadd: () => {
    const from = $("#trFrom").value, to = $("#trTo").value; if (!from || !to || to < from) { toast("Check the dates."); return; }
    S.trips.push({ id: uid(), u: Date.now(), from, to, place: $("#trPlace").value.trim() }); save(); toast("Trip added. The schedule switches on " + from + "."); render();
  },
  tripdel: (el) => { S.trips = S.trips.filter(t => t.id !== el.dataset.arg); save(); render(); },
  wdow: (el) => { weekDow = +el.dataset.arg; weekEdit = false; render(); },
  weekedit: () => { weekEdit = true; render(); },
  weekcancel: () => { weekEdit = false; render(); },
  weeksave: () => { const w = parseWeek($("#weekTa").value); if (!w.length) { toast("Couldn't read any lines."); return; } S.sched[weekDow] = w; weekEdit = false; save(); toast(DAYS_LONG[weekDow] + " saved. Re-import the calendar file if you use it."); render(); },
  weekreset: () => { delete S.sched[weekDow]; weekEdit = false; save(); render(); },
  ics: () => download("manoj-os-routine.ics", buildIcs(), "text/calendar"),
  icsfocus: () => download("manoj-os-focus.ics", buildFocusIcs(), "text/calendar"),
  notif: async () => { try { const p = await Notification.requestPermission(); toast(p === "granted" ? "Notifications on." : "Notifications not allowed."); } catch (e) {} render(); },
  ghsave: () => { LOC.gh.repo = $("#ghRepo").value.trim().replace(/^https:\/\/github.com\//, ""); LOC.gh.path = $("#ghPath").value.trim() || "manoj-os.json"; LOC.gh.token = $("#ghToken").value.trim(); LOC.gh.err = null; saveLoc(); ghSync(false); },
  ghsync: () => ghSync(false),
  ghoff: () => { LOC.gh.token = ""; saveLoc(); render(); },
  export: () => download("manoj-os-backup-" + today() + ".json", JSON.stringify(S, null, 1), "application/json")
};
function toggleTick(ds, id) {
  const t = ticksOf(ds);
  if (t[id]) delete t[id]; else {
    t[id] = Date.now();
    if (ds === today() && /^laundry-/.test(id)) { const b = blocksFor(new Date()).find(x => x.id === id); if (b && /load/i.test(b.t) && !S.laundry) { S.laundry = { start: Date.now(), min: +cfg("washMin"), hung: false }; toast("Ticked, and the " + cfg("washMin") + "-min cycle timer is running."); } if (b && /hang/i.test(b.t)) S.laundry = null; }
  }
  save(true); render();
}
function confirmTwice(el) { if (el.dataset.sure) return true; el.dataset.sure = "1"; el.textContent = "Sure?"; setTimeout(() => { delete el.dataset.sure; el.textContent = "×"; }, 2500); return false; }

document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]");
  if (!el || el.tagName === "INPUT") return;
  const f = ACT[el.dataset.act]; if (!f) return;
  if (el.tagName === "A") return;
  ev.preventDefault(); f(el, ev);
});
document.addEventListener("change", ev => {
  const el = ev.target;
  if (el.dataset.act === "subtick") { const t = ticksOf(el.dataset.ds); if (el.checked) t[el.dataset.arg] = Date.now(); else delete t[el.dataset.arg]; save(true); return; }
  if (el.dataset.act === "triptick") { const k = el.dataset.arg; S.tripTicks[k] = S.tripTicks[k] || {}; S.tripTicks[k][el.dataset.i] = el.checked ? Date.now() : 0; save(true); return; }
  if (el.dataset.set) {
    let v = el.value; if (el.type === "number") v = v === "" ? null : +v;
    S.set[el.dataset.set] = v; save(); toast("Saved."); status(); return;
  }
  if (el.dataset.input === "restore" && el.files[0]) {
    el.files[0].text().then(t => { const j = JSON.parse(t); if (!j || j.v !== 1) throw new Error("not a Manoj OS backup"); S = Object.assign(blank(), j); save(); toast("Restored."); render(); }).catch(e => toast("Restore failed: " + e.message));
  }
});
document.addEventListener("input", ev => {
  const el = ev.target;
  if (el.dataset.input === "pantryq") { cookOpt.q = el.value; const box = el.parentElement; const old = el.nextElementSibling; if (old) { const tmp = document.createElement("div"); tmp.innerHTML = pantryHtml(); while (el.nextElementSibling && el.nextElementSibling.tagName === "DETAILS" || (el.nextElementSibling && el.nextElementSibling.classList.contains("empty"))) el.nextElementSibling.remove(); el.after(...tmp.childNodes); } void box; }
  if (el.id === "tEntry" || el.id === "tStop") tradeHint();
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && layerOpen) closeLayer(); });
window.addEventListener("hashchange", route);

/* ------------------------------------------------------------------ timers */
let hiddenAt = 0, appTick = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); lsSet(KEY, S); return; }
  const away = hiddenAt ? (Date.now() - hiddenAt) / 60000 : 0;
  render();
  if (!checkRoasts("back") && away > 45) roast("away", { away: dur(away) }, { cool: 60 });
});
setInterval(() => {
  status();
  if (document.hidden) return;
  const ds = today(); S.appTime[ds] = S.appTime[ds] || {}; S.appTime[ds][DEV] = (S.appTime[ds][DEV] || 0) + 5;
  if (++appTick % 6 === 0) lsSet(KEY, S);
}, 5000);
setInterval(() => {
  blockStartCheck();
  const left = laundryLeft();
  if (S.laundry && left != null && left <= 0 && !S.laundry.notified) { S.laundry.notified = true; save(true); notify("🧺 Washing done", "Hang the clothes now."); toast("🧺 Washing done. Hang them."); }
  if (S.focus && S.focus.until <= Date.now()) { endFocus(); notify("⏱️ Focus block over", "Nice. Take 5."); }
  if (document.hidden) return;
  checkRoasts("tick");
  if (LOC.aw.on && !PHONE && (!LOC.awCache[today()] || Date.now() - LOC.awCache[today()].at > 10 * 60000)) awFetch();
  const busy = layerOpen || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
  if (!busy && (tab === "now" || nightLocked())) render();
}, 60000);

/* ------------------------------------------------------------------ start */
function welcome() {
  if (S.welcomed) return false;
  S.welcomed = Date.now(); save(true);
  openSheet("Hi Manoj 👋", `<p>This is your day in one place: what to do now, one dish, one Python exercise, one trading step, sleep, screen time, chores and the roasts you asked for.</p>
    <ul class="plain"><li><b>Now</b> follows your week: up at ${esc(cfg("wake"))}, Philips on Mon/Tue/Thu, WFH Wed/Fri, Tuesday fast, bed at ${esc(cfg("bed"))}.</li>
    <li>Tap <b>Going to sleep</b> at night and <b>I'm up</b> in the morning; that's all the sleep tracking needs.</li>
    <li>Three setups make it real (Life → Settings): block apps at night, silent phone during focus, calendar reminders.</li></ul>
    <div class="row"><button class="btn pri" data-act="close">Let's go</button><button class="btn" data-act="lifesec" data-arg="settings" onclick="location.hash='#life'">Do the setups</button></div>`);
  return true;
}
if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {});
route();
setTimeout(() => { if (!welcome()) checkRoasts("open"); }, 1200);
if (LOC.gh.token && LOC.gh.repo) setTimeout(() => ghSync(true).then(() => render()), 1500);
if (LOC.aw.on && !PHONE) setTimeout(awFetch, 2000);
