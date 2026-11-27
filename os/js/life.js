/* Life: sleep, screen time, balance, fitness, health (labs, recovery, rules, use/ignore), home, trips, schedule and settings. */
"use strict";

let lifeSec = "overview";
const LIFE_SECS = [["overview", "Overview"], ["sleep", "Sleep"], ["screen", "Screen"], ["health", "Health"], ["home", "Home"], ["trips", "Trips"], ["week", "Schedule"], ["settings", "Settings"]];

function renderLife() {
  let h = `<div class="stack"><div class="chips" role="tablist" aria-label="Life sections">${LIFE_SECS.map(([k, l]) => `<button role="tab" aria-pressed="${lifeSec === k}" data-act="lifesec" data-arg="${k}">${l}</button>`).join("")}</div>`;
  h += ({ overview: lifeOverview, sleep: lifeSleep, screen: lifeScreen, health: lifeHealth, home: lifeHome, trips: lifeTrips, week: lifeWeek, settings: lifeSettings }[lifeSec] || lifeOverview)();
  return h + `</div>`;
}

/* ---- overview: balance of the week */
function balance() {
  const cats = window.OS_BALANCE, of = {}; for (const [c, ks] of Object.entries(cats)) for (const k of ks) of[k] = c;
  const plan = {}, done = {}, d0 = new Date(); const mon = addDays(d0, -((d0.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i), ds = ymd(d);
    for (const b of blocksFor(d)) {
      const c = of[b.k]; if (!c) continue; const mins = b.e - b.s;
      plan[c] = (plan[c] || 0) + mins;
      if (isTicked(ds, b.id) || (b.k === "sleep" && S.sleep.nights[ds])) done[c] = (done[c] || 0) + mins;
    }
  }
  return { plan, done, cats: Object.keys(cats) };
}
function lifeOverview() {
  const B = balance(), ss = sleepStats(), wk = nights(7).map(([k, n]) => n ? sleptMin(n) : 0);
  const fitDays = (() => { let n = 0; for (let i = 0; i < 7; i++) { const d = addDays(new Date(), -i), ds = ymd(d); if (blocksFor(d).some(b => ["workout", "run", "walk"].includes(b.k) && isTicked(ds, b.id))) n++; } return n; })();
  const peopleH = (B.done.People || 0) / 60, readTicks = (() => { let n = 0; for (let i = 0; i < 7; i++) { const d = addDays(new Date(), -i), ds = ymd(d); if (blocksFor(d).some(b => ["read", "book"].includes(b.k) && isTicked(ds, b.id))) n++; } return n; })();
  const max = Math.max(...Object.values(B.plan).filter((v, i) => Object.keys(B.plan)[i] !== "Sleep"), 1);
  return `<section class="card"><header><h2>This week, balanced?</h2><span class="r small muted">planned vs ticked, Mon–Sun</span></header>
    ${B.cats.filter(c => c !== "Sleep" && B.plan[c]).map(c => `<div class="hbar"><span>${esc(c)}</span>${barHtml(B.done[c] || 0, B.plan[c], (B.done[c] || 0) >= B.plan[c] * .7 ? "good" : "")}<span class="mono small">${((B.done[c] || 0) / 60).toFixed(1).replace(/\.0$/, "")}/${hrs(B.plan[c])}</span></div>`).join("")}
    <p class="small muted">The plan gives sleep ${hrs(B.plan.Sleep || 0)} a week. Rough targets: health on 6 days, people every day, reading every night, cooking under 8 h.</p></section>
    <section class="card"><header><h2>Last 7 days</h2></header><div class="grid3">
      <div class="stat"><div class="v">${ss.n ? hrs(ss.avg) : "—"}</div><div class="k">sleep a night</div></div>
      <div class="stat"><div class="v">${fitDays}/7</div><div class="k">days you moved</div></div>
      <div class="stat"><div class="v">${hrs(peopleH * 60)}</div><div class="k">with people</div></div>
      <div class="stat"><div class="v">${readTicks}/7</div><div class="k">reading days</div></div>
      <div class="stat"><div class="v">${streak()}</div><div class="k">Python streak</div></div>
      <div class="stat"><div class="v">${S.runs.filter(r => Date.now() - r.at < 7 * 86400000).reduce((a, r) => a + (+r.km || 0), 0).toFixed(1)} km</div><div class="k">run this week</div></div></div>
      ${barsHtml(nights(7).map(([k, n]) => ({ l: DAYS[parseYmd(k).getDay()], v: n ? sleptMin(n) : 0, short: n ? (sleptMin(n) / 60).toFixed(1) : "", cls: n && sleptMin(n) < 360 ? "bad" : n && sleptMin(n) >= cfg("sleepTarget") * 60 - 15 ? "good" : "warn" })), cfg("sleepTarget") * 60, v => dur(v))}
      <p class="small muted">Sleep by night (hours).</p></section>
    <section class="card"><header><h2>Fitness</h2><button class="r linkish small" data-act="runlog">Log a run</button></header>
      ${S.runs.length ? `<div class="list">${S.runs.slice(-5).reverse().map(r => `<div class="li"><div class="grow"><div class="t1">${esc(r.km)} km in ${esc(r.min)} min</div><div class="t2">${new Date(r.at).toLocaleDateString("en-IN")} · ${r.km && r.min ? (r.min / r.km).toFixed(1) + " min/km" : ""}${r.note ? " · " + esc(r.note) : ""}</div></div></div>`).join("")}</div>` : `<p class="empty">Runs are Wed (easy), Fri (intervals) and Sat (long). Log the first one.</p>`}
    </section>
    <section class="card"><header><h2>Roast log</h2><span class="r small muted">level: ${esc(cfg("roast"))}</span></header>
      ${S.roast.log.length ? `<div class="list">${S.roast.log.slice(0, 8).map(x => `<div class="li"><span>${(R[x.k] || {}).icon || "🔥"}</span><div class="grow"><div class="t2">${new Date(x.t).toLocaleString("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div><div>${esc(x.line)}</div></div></div>`).join("")}</div>` : `<p class="empty">Clean record so far. Suspicious.</p>`}
      <div class="row"><button class="btn sm" data-act="testroast">Roast me now</button></div></section>`;
}

/* ---- sleep */
function lifeSleep() {
  const ss = sleepStats(), ns = nights(14);
  return `<section class="card"><header><h2>Sleep</h2><span class="r small muted">${esc(cfg("bed"))} → ${esc(cfg("wake"))} · ${cfg("sleepTarget")} h</span></header>
    <div class="grid3"><div class="stat"><div class="v">${ss.n ? hrs(ss.avg) : "—"}</div><div class="k">average (7)</div></div>
    <div class="stat"><div class="v">${ss.n ? hrs(ss.debt) : "—"}</div><div class="k">debt (7)</div></div>
    <div class="stat"><div class="v">${ss.n > 1 ? "±" + Math.round(ss.sd) + "m" : "—"}</div><div class="k">bedtime drift</div></div></div>
    ${barsHtml(ns.map(([k, n]) => ({ l: parseYmd(k).getDate() + "", v: n ? sleptMin(n) : 0, short: n ? (sleptMin(n) / 60).toFixed(1) : "", cls: n && sleptMin(n) < 360 ? "bad" : n && sleptMin(n) >= cfg("sleepTarget") * 60 - 15 ? "good" : "warn" })), cfg("sleepTarget") * 60, v => dur(v))}
    <div class="row">${S.sleep.pending ? `<button class="btn pri" data-act="wake">I'm up ☀️</button>` : `<button class="btn" data-act="sleep">Going to sleep 😴</button>`}<button class="btn" data-act="sleepsheet">Add or fix a night</button></div>
    <p class="small muted">Late-night opens this week: ${Object.entries(S.late).filter(([k]) => parseYmd(k) > addDays(new Date(), -7)).reduce((a, [, v]) => a + v.length, 0)}. Drift under ±30 min matters more than the odd long lie-in.</p></section>
    ${recoverCard("sleep")}`;
}
function sleepSheet() {
  const d = new Date(), y = addDays(d, -1);
  openSheet("Add or fix a night", `<div class="grid2"><label class="f">Woke up on<input type="date" id="slDate" value="${ymd(d)}"></label><span></span>
    <label class="f">Went to sleep at<input type="time" id="slBed" value="${esc(cfg("bed"))}"></label><label class="f">Woke at<input type="time" id="slWake" value="${esc(cfg("wake"))}"></label></div>
    <p class="small muted">A bedtime after noon counts as the evening before.</p>
    <div class="row"><button class="btn pri" data-act="slsave">Save night</button></div>`);
}

/* ---- screen time */
function lifeScreen() {
  const ds = today(), days = []; for (let i = 6; i >= 0; i--) days.push(ymd(addDays(new Date(), -i)));
  const aw = LOC.awCache[ds];
  return `<section class="card"><header><h2>Phone (Android)</h2><button class="r linkish small" data-act="phonelog">Log today</button></header>
    ${barsHtml(days.map(k => ({ l: DAYS[parseYmd(k).getDay()], v: phoneMin(k), short: phoneMin(k) ? (phoneMin(k) / 60).toFixed(1) : "", cls: phoneMin(k) > cfg("phoneTarget") ? "bad" : "good" })), cfg("phoneTarget"), v => dur(v))}
    <p class="small muted">Limit ${dur(cfg("phoneTarget"))}. Android doesn't let a web page read screen time, so copy today's total from Settings → Digital Wellbeing at night (5 seconds). ${S.screen[ds] && S.screen[ds].top ? "Today's top app: " + esc(S.screen[ds].top) + "." : ""}</p></section>
    <section class="card"><header><h2>Laptop (Windows)</h2><span class="r chip ${LOC.aw.on ? "ok" : ""}">${LOC.aw.on ? "ActivityWatch on" : "off"}</span></header>
      ${aw ? `<p><b>${dur(aw.total / 60)}</b> active today${aw.distract ? `, <b style="color:var(--bad)">${dur(aw.distract / 60)}</b> on distracting sites` : ""}. Updated ${clockOf(aw.at)}.</p>
        <div class="list">${aw.apps.slice(0, 6).map(([a, s]) => `<div class="li"><div class="grow">${esc(a)}</div><span class="mono small">${dur(s / 60)}</span></div>`).join("")}</div>` : ""}
      ${LOC.aw.err ? `<div class="note">Last try: ${esc(LOC.aw.err)}</div>` : ""}
      <div class="row">${LOC.aw.on ? `<button class="btn sm" data-act="awfetch">Refresh</button><button class="btn sm ghost" data-act="awoff">Turn off</button>` : `<button class="btn sm pri" data-act="awon">Connect ActivityWatch</button>`}</div>
      <details><summary>Set up ActivityWatch on the laptop (once, 5 min)</summary><ol class="plain" style="padding-left:20px">
        <li>Install ActivityWatch (free, open source) from <a href="https://activitywatch.net/downloads/" target="_blank" rel="noopener">activitywatch.net</a>. It runs in the tray and records which app and window is active, on your machine only.</li>
        <li>Let this page read it. Close ActivityWatch from the tray, then open the server config in Notepad:<br>
          <code>%LOCALAPPDATA%\\activitywatch\\activitywatch\\aw-server\\aw-server.toml</code><br>and under <code>[server]</code> add<br><code>cors_origins = "https://manojhunasimarad.github.io"</code><br>
          (if your install uses the Rust server instead, the file is <code>%LOCALAPPDATA%\\activitywatch\\aw-server-rust\\config.toml</code> and the line is <code>cors = ["https://manojhunasimarad.github.io"]</code>). Start ActivityWatch again.</li>
        <li>Open this app in Chrome or Edge on the laptop, tap Connect, and allow the “access other apps and services on this device” prompt.</li></ol></details></section>
    <section class="card"><header><h2>This app</h2></header><p class="small muted">Time with this app open, by device:</p>
      ${days.slice(-3).map(k => `<div class="li"><div class="grow">${esc(DAYS[parseYmd(k).getDay()])}</div><span class="small mono">${Object.entries(S.appTime[k] || {}).map(([dv, s]) => dv + " " + dur(s / 60)).join(" · ") || "—"}</span></div>`).join("")}</section>
    ${recoverCard("eyes")}${recoverCard("scroll")}`;
}
function phoneSheet() {
  const cur = S.screen[today()] || {};
  openSheet("Today's phone time", `<p class="small muted">Settings → Digital Wellbeing → today's total.</p>
    <div class="grid2"><label class="f">Hours<input type="number" id="phH" min="0" max="20" value="${cur.phone ? Math.floor(cur.phone / 60) : ""}" inputmode="numeric"></label>
    <label class="f">Minutes<input type="number" id="phM" min="0" max="59" value="${cur.phone ? cur.phone % 60 : ""}" inputmode="numeric"></label></div>
    <div class="chips" role="group" aria-label="Top app">${["Instagram", "YouTube", "WhatsApp", "Chrome", "LinkedIn", "X", "Other"].map(a => `<button data-act="phtop" data-arg="${a}" aria-pressed="${cur.top === a}">${a}</button>`).join("")}</div>
    <div class="row"><button class="btn pri" data-act="phsave">Save</button></div>`);
  phoneSheet.top = cur.top || null;
}
async function awFetch() {
  const base = (LOC.aw.url || "http://localhost:5600").replace(/\/$/, "");
  const req = (p, o) => fetch(base + p, Object.assign({ targetAddressSpace: "loopback", cache: "no-store" }, o || {})).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  try {
    const buckets = await req("/api/0/buckets/"), ids = Object.keys(buckets);
    const win = ids.find(i => i.startsWith("aw-watcher-window_")), afk = ids.find(i => i.startsWith("aw-watcher-afk_"));
    if (!win) throw new Error("no window-watcher data yet");
    const s0 = new Date(); s0.setHours(0, 0, 0, 0);
    const iso = d => { const o = -d.getTimezoneOffset(), sg = o >= 0 ? "+" : "-"; return ymd(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00" + sg + pad(Math.floor(Math.abs(o) / 60)) + ":" + pad(Math.abs(o) % 60); };
    const q = ['events = flood(query_bucket("' + win + '"));'];
    if (afk) q.push('afk = flood(query_bucket("' + afk + '"));', 'notafk = filter_keyvals(afk, "status", ["not-afk"]);', "events = filter_period_intersect(events, notafk);");
    q.push('apps = sort_by_duration(merge_events_by_keys(events, ["app"]));', 'titles = sort_by_duration(merge_events_by_keys(events, ["app", "title"]));', 'RETURN = {"apps": apps, "titles": limit_events(titles, 300)};');
    const res = await req("/api/0/query/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeperiods: [iso(s0) + "/" + iso(addDays(s0, 1))], query: q }) });
    const r0 = res[0], apps = (r0.apps || []).map(e => [e.data.app, e.duration]);
    const bad = /youtube|instagram|netflix|hotstar|prime video|reddit|twitter|\bx\b|facebook|reels|shorts|cricbuzz/i;
    const distract = (r0.titles || []).filter(e => bad.test(e.data.title || "")).reduce((a, e) => a + e.duration, 0);
    LOC.awCache[today()] = { total: apps.reduce((a, x) => a + x[1], 0), apps, distract, at: Date.now() };
    LOC.aw.err = null; saveLoc(); render();
  } catch (e) {
    LOC.aw.err = (e.message || String(e)) + ". Is ActivityWatch running, with the CORS line added and the browser permission allowed?"; saveLoc(); render();
  }
}

/* ---- health */
function labStatus(L) {
  const e = S.labs[L.k]; if (!e || e.v == null || e.v === "") return null;
  const v = +e.v, r = [e.lo != null && e.lo !== "" ? +e.lo : L.r[0], e.hi != null && e.hi !== "" ? +e.hi : L.r[1]];
  let s = v < r[0] ? "low" : v > r[1] ? "high" : "ok", label = s === "ok" ? "In range" : s === "low" ? "Below range" : "Above range", urgent = false;
  const k = L.k;
  if (k === "vitd" && v < 30) label = v < 20 ? "Deficient" : "Insufficient";
  if (k === "b12" && v >= 200 && v < 300) { s = "low"; label = "Borderline low"; }
  if (k === "fbs" && v >= 100) { label = v >= 126 ? "Diabetes range" : "Prediabetes range"; urgent = v >= 126; }
  if (k === "hba1c" && v >= 5.7) { label = v >= 6.5 ? "Diabetes range" : "Prediabetes range"; urgent = v >= 6.5; }
  if (k === "ldl" && v >= 100) { label = v >= 190 ? "Very high" : v >= 160 ? "High" : v >= 130 ? "Borderline high" : "Near optimal"; s = v >= 130 ? "high" : "ok"; urgent = v >= 190; }
  if (k === "tg" && v >= 150) { label = v >= 500 ? "Very high" : v >= 200 ? "High" : "Borderline high"; urgent = v >= 500; }
  if (k === "hb" && v < 10) urgent = true;
  if (k === "tsh" && s !== "ok") urgent = true;
  if (k === "creat" && s === "high") urgent = true;
  return { s, label, urgent, v, r };
}
function advKey(k, st) {
  if ((k === "hb" || k === "ferritin") && st.s === "low") return "iron";
  if (k === "vitd" && st.s === "low") return "vitd";
  if (k === "b12" && st.s === "low") return "b12";
  if ((k === "fbs" || k === "hba1c") && st.s === "high") return "sugar";
  if ((k === "ldl" || k === "tc") && st.s === "high") return "lipids";
  if (k === "hdl" && st.s === "low") return "hdl";
  if (k === "tg" && st.s === "high") return "tg";
  if (k === "tsh" && st.s !== "ok") return "tsh";
  if (k === "ua" && st.s === "high") return "ua";
  if (k === "creat" && st.s === "high") return "creat";
  if (k === "zinc" && st.s === "low") return "zinc";
  return st.s !== "ok" ? "other" : null;
}
function recoverCard(k) {
  const x = window.OS_RECOVER.find(r => r.k === k); if (!x) return "";
  return `<section class="card"><header><h3>↺ ${esc(x.t)}</h3></header><p class="small muted">${esc(x.why)}</p><ul class="plain">${x.do.map(s => `<li>${esc(s)}</li>`).join("")}</ul></section>`;
}
function lifeHealth() {
  const LABS = window.OS_LABS, ADV = window.OS_LAB_ADV, P = window.OS_LAB_PREP, RU = S.rules || window.OS_RULES;
  const adv = {};
  LABS.forEach(L => { const st = labStatus(L); if (!st) return; const a = advKey(L.k, st); if (a) { adv[a] = adv[a] || { names: [], urgent: false }; adv[a].names.push(L.n + " " + st.v + " " + L.u + " (" + st.label.toLowerCase() + ")"); adv[a].urgent = adv[a].urgent || st.urgent; } });
  const due = LABS.filter(L => { const e = S.labs[L.k]; return !e || !e.date || (Date.now() - parseYmd(e.date)) / 86400000 > L.every * 30.4; });
  return `<section class="card"><header><h2>Lab tests</h2><button class="r linkish small" data-act="labs">Enter results</button></header>
    <p class="small muted">${due.length ? "Due (never entered, or older than a year): " + esc(due.map(L => L.n).join(", ")) + "." : "Everything tested in the last year."} A yearly basic panel is plenty unless your doctor says otherwise.</p>
    <div class="list">${LABS.filter(L => S.labs[L.k] && S.labs[L.k].v !== "" && S.labs[L.k].v != null).map(L => { const st = labStatus(L); return `<div class="li"><div class="grow"><div class="t1">${esc(L.n)}: <span class="mono">${esc(st.v)} ${esc(L.u)}</span></div><div class="t2">range ${st.r[0] <= 0 ? "under " + st.r[1] : st.r[1] >= 999 ? st.r[0] + "+" : st.r[0] + "–" + st.r[1]} · ${esc(S.labs[L.k].date || "no date")}</div></div><span class="pill ${st.urgent ? "b" : st.s === "ok" ? "p" : "w"}">${esc(st.label)}</span></div>`; }).join("") || `<p class="empty">No results yet.</p>`}</div>
    ${Object.entries(adv).map(([k, a]) => `<div class="note"><b>${esc(ADV[k].t)}</b>${a.urgent ? " · <b style='color:var(--bad)'>see a doctor soon</b>" : ""}<br><span class="small">${esc(a.names.join("; "))}</span><ul class="plain">${ADV[k].tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
    <p class="small muted">General information, not a diagnosis. Your report's reference range and your doctor come first.</p></section>
    <section class="card"><header><h2>Before a blood test</h2></header><div class="grid2"><div><div class="lbl">Do</div><ul class="plain">${P.do.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>
      <div><div class="lbl">Don't</div><ul class="plain">${P.dont.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div></div></section>
    <section class="card"><header><h2>Undo the damage</h2><span class="r small muted">recovery plans</span></header>
      ${window.OS_RECOVER.map(x => `<details><summary>${esc(x.t)}</summary><p class="small muted" style="margin:6px 0">${esc(x.why)}</p><ul class="plain">${x.do.map(s => `<li>${esc(s)}</li>`).join("")}</ul></details>`).join("")}</section>
    <section class="card"><header><h2>Your rules</h2><button class="r linkish small" data-act="editlist" data-arg="rules">Edit</button></header><div class="grid2">
      <div><div class="lbl">Do</div><ul class="plain">${RU.do.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>
      <div><div class="lbl">Don't</div><ul class="plain">${RU.dont.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div></div></section>`;
}
function labsSheet() {
  openSheet("Lab results", `<p class="small muted">Leave blank what you didn't test. Your lab's own range (low / high) overrides the typical one.</p>
    <label class="f">Test date<input type="date" id="labDate" value="${today()}"></label>
    ${window.OS_LABS.map(L => { const e = S.labs[L.k] || {}; return `<div class="grid3" style="align-items:end"><label class="f">${esc(L.n)} (${esc(L.u)})<input type="number" step="any" data-lab="${L.k}" value="${esc(e.v != null ? e.v : "")}"></label>
      <label class="f">Lab low<input type="number" step="any" data-lablo="${L.k}" value="${esc(e.lo != null ? e.lo : "")}" placeholder="${L.r[0]}"></label><label class="f">Lab high<input type="number" step="any" data-labhi="${L.k}" value="${esc(e.hi != null ? e.hi : "")}" placeholder="${L.r[1] >= 999 ? "" : L.r[1]}"></label></div>`; }).join("")}
    <div class="row"><button class="btn pri" data-act="labsave">Save</button></div>`);
}

/* ---- home */
function lifeHome() {
  const K = S.kit || window.OS_KIT, d0 = new Date(), mon = addDays(d0, -((d0.getDay() + 6) % 7));
  const chores = ["dishes", "laundry", "clean", "errand", "fix"].map(k => { let plan = 0, done = 0; for (let i = 0; i < 7; i++) { const d = addDays(mon, i), ds = ymd(d); for (const b of blocksFor(d)) if (b.k === k) { if (d <= d0) plan++; if (isTicked(ds, b.id)) done++; } } return [k, done, plan]; });
  return `<section class="card"><header><h2>Chores this week</h2><span class="r small muted">so far</span></header>
    ${chores.map(([k, dn, pl]) => `<div class="hbar"><span>${icon(k)} ${esc(KINDS[k][1])}</span>${barHtml(dn, pl, dn >= pl ? "good" : "")}<span class="mono small">${dn}/${pl}</span></div>`).join("")}
    <p class="small muted">Laundry Wed + Sat, mop Wed + Sun, bathroom Sun, utensils after every cook, groceries Fri + Sat.</p></section>
    <section class="card"><header><h2>🔧 Fix-it list</h2><span class="r small muted">Saturday 11:50</span></header>
      <div class="list">${S.fixit.filter(f => !f.done).map(f => `<div class="li"><div class="grow">${esc(f.t)}</div><button class="btn sm" data-act="fixdone" data-arg="${esc(f.id)}">Fixed ✓</button></div>`).join("") || `<p class="empty">Nothing broken. Add the dripping tap / loose switch / blown bulb when you notice it.</p>`}</div>
      <div class="row"><input type="text" id="fixNew" placeholder="e.g. Kitchen tap drips" aria-label="New fix-it item"><button class="btn sm" data-act="fixadd">Add</button></div>
      ${S.fixit.some(f => f.done) ? `<details><summary>Done (${S.fixit.filter(f => f.done).length})</summary><ul class="plain">${S.fixit.filter(f => f.done).map(f => `<li>${esc(f.t)} <span class="muted small">${ymd(new Date(f.done))}</span></li>`).join("")}</ul></details>` : ""}</section>
    <section class="card"><header><h2>Use · use weekly · ignore</h2><button class="r linkish small" data-act="editlist" data-arg="kit">Edit</button></header>
      <div class="lbl">Every day</div><ul class="plain">${K.daily.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
      <div class="lbl">Every week</div><ul class="plain">${K.weekly.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
      <div class="lbl">Ignore</div><ul class="plain">${K.ignore.map(s => `<li>${esc(s)}</li>`).join("")}</ul></section>
    <section class="card"><header><h2>🎬 Watchlist</h2><span class="r small muted">for Friday movie night</span></header>
      <div class="list">${S.watch.filter(w => !w.done).map(w => `<div class="li"><div class="grow">${esc(w.t)}</div><button class="btn sm" data-act="watchdone" data-arg="${esc(w.id)}">Watched</button></div>`).join("") || `<p class="empty">Add what you want to watch so Friday isn't 40 minutes of scrolling Netflix.</p>`}</div>
      <div class="row"><input type="text" id="watchNew" placeholder="Movie or series" aria-label="New watchlist item"><button class="btn sm" data-act="watchadd">Add</button></div></section>`;
}

/* ---- trips */
function lifeTrips() {
  const up = S.trips.filter(t => t.to >= today()).sort((a, b) => a.from.localeCompare(b.from)), past = S.trips.filter(t => t.to < today());
  return `<section class="card"><header><h2>🧳 Trips and out-of-station days</h2></header>
    <p class="small muted">While you're away the schedule switches to travel mode: wake time, a walk, recall and reading stay; cooking, chores and Philips blocks go. The day before, you get the leaving checklist; the day after, the coming-back one.</p>
    <div class="grid2"><label class="f">From<input type="date" id="trFrom" value="${today()}"></label><label class="f">To<input type="date" id="trTo" value="${today()}"></label></div>
    <label class="f">Where<input type="text" id="trPlace" placeholder="Home, conference, NITK…"></label>
    <div class="row"><button class="btn pri" data-act="tripadd">Add trip</button></div>
    <div class="list">${up.map(t => `<div class="li"><div class="grow"><div class="t1">${esc(t.place || "Trip")}</div><div class="t2">${esc(t.from)} → ${esc(t.to)}</div></div><button class="btn sm ghost" data-act="tripdel" data-arg="${esc(t.id)}" aria-label="Delete">×</button></div>`).join("") || `<p class="empty">No trips planned.</p>`}</div>
    ${past.length ? `<details><summary>Past trips (${past.length})</summary><ul class="plain">${past.map(t => `<li>${esc(t.place || "Trip")} · ${esc(t.from)} → ${esc(t.to)}</li>`).join("")}</ul></details>` : ""}</section>
    ${recoverCard("trip")}`;
}

/* ---- the week (view and edit) */
let weekDow = new Date().getDay(), weekEdit = false;
function lifeWeek() {
  const raw = rawWeek(weekDow), custom = !!S.sched[weekDow];
  return `<section class="card"><header><h2>Weekly schedule</h2></header>
    <div class="seg" role="group" aria-label="Day">${DAYS.map((x, i) => `<button aria-pressed="${i === weekDow}" data-act="wdow" data-arg="${i}">${x}</button>`).join("")}</div>
    <p class="small muted">${DAYS_LONG[weekDow]}: ${ME.officeDays.includes(weekDow) ? "office" : weekDow === 0 || weekDow === 6 ? "weekend" : "WFH"}${weekDow === ME.fastDay ? " · fast day" : ""}${custom ? " · edited by you" : ""}. Sleep is ${esc(cfg("bed"))}–${esc(cfg("wake"))}.</p>
    ${weekEdit ? `<p class="small muted">One block per line: <code>start-end kind What | small thing; small thing</code>. Kinds: ${Object.keys(KINDS).filter(k => k !== "sleep").join(", ")}.</p>
      <textarea id="weekTa" style="min-height:360px">${esc(raw.map(b => b[0] + "-" + b[1] + " " + b[2] + " " + b[3] + (b[4] && b[4].length ? " | " + b[4].join("; ") : "")).join("\n"))}</textarea>
      <div class="row"><button class="btn pri" data-act="weeksave">Save ${DAYS_LONG[weekDow]}</button><button class="btn" data-act="weekcancel">Cancel</button>${custom ? `<button class="btn ghost" data-act="weekreset">Back to default</button>` : ""}</div>`
    : `<div class="tl">${blocksFor(nextDow(weekDow)).filter(b => b.k !== "sleep").map(b => `<div class="blk"><span class="t">${hm(b.s)}</span><span class="ic">${icon(b.k)}</span><div class="w"><div class="n">${esc(b.t)}</div>${b.sub.length ? `<div class="t2 small muted">${esc(b.sub.join(" · "))}</div>` : ""}</div><span class="small mono muted">${dur(b.e - b.s)}</span></div>`).join("")}</div>
      <div class="row"><button class="btn" data-act="weekedit">Edit ${DAYS_LONG[weekDow]}</button></div>`}</section>
    <section class="card"><header><h2>📅 Real reminders</h2></header>
      <p>The app can only remind you while it's open. For reminders that always fire, put the routine in your calendar:</p>
      <div class="row"><button class="btn pri" data-act="ics">Download routine (.ics)</button><button class="btn" data-act="icsfocus">Download focus calendar (.ics)</button></div>
      <ol class="plain" style="padding-left:20px"><li>On the laptop, open <a href="https://calendar.google.com/calendar/r/settings/createcalendar" target="_blank" rel="noopener">Google Calendar → Create new calendar</a> and make one called <b>Manoj OS</b> (and a second one, <b>Manoj OS Focus</b>).</li>
        <li>Settings → Import &amp; export → Import: the routine file into <b>Manoj OS</b>, the focus file into <b>Manoj OS Focus</b>.</li>
        <li>They sync to the phone with alerts at the start of each block. If you change the schedule here, delete the calendar's events and import again.</li></ol></section>`;
}
function nextDow(dow) { const d = new Date(); return addDays(d, (dow - d.getDay() + 7) % 7); }
function parseWeek(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(\w+)\s+(.+)$/);
    if (!m) continue;
    const [what, subs] = m[4].split("|");
    const fix = t => t.padStart(5, "0");
    out.push([fix(m[1]), fix(m[2]), KINDS[m[3]] ? m[3] : "free", what.trim()].concat(subs ? [subs.split(";").map(s => s.trim()).filter(Boolean)] : []));
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
const FOCUS_KINDS = ["work", "learn", "research", "book", "ride", "read"];
function buildFocusIcs() {
  const keep = ICS_KINDS.slice(); ICS_KINDS.length = 0; FOCUS_KINDS.forEach(k => ICS_KINDS.push(k));
  try { return buildIcs().replace("X-WR-CALNAME:Manoj OS", "X-WR-CALNAME:Manoj OS Focus"); } finally { ICS_KINDS.length = 0; keep.forEach(k => ICS_KINDS.push(k)); }
}

/* ---- settings */
function lifeSettings() {
  const g = LOC.gh, notif = "Notification" in window ? Notification.permission : "unsupported";
  const f = (k, label, type, extra) => `<label class="f">${label}<input type="${type}" data-set="${k}" value="${esc(cfg(k))}" ${extra || ""}></label>`;
  return `<section class="card"><header><h2>You</h2></header><div class="grid2">
      ${f("wake", "Wake up", "time")}${f("bed", "Bedtime", "time")}${f("sleepTarget", "Sleep target (h)", "number", 'step="0.25"')}${f("proteinTarget", "Protein a day (g)", "number")}
      ${f("phoneTarget", "Phone limit (min)", "number")}${f("washMin", "Washing cycle (min)", "number")}${f("capital", "Paper capital (₹)", "number")}${f("riskPct", "Risk per trade (%)", "number", 'step="0.25"')}</div>
      <label class="f">Roast level<select data-set="roast">${["savage", "medium", "gentle"].map(x => `<option ${cfg("roast") === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></section>
    <section class="card"><header><h2>🔒 Block apps at night</h2></header>
      <p class="small">A web page can't block other apps, but your phone and Chrome can, on a schedule. Set it once:</p>
      <details open><summary>Android (2 min)</summary><ol class="plain" style="padding-left:20px">
        <li>Settings → Digital Wellbeing &amp; parental controls → <b>Focus mode</b>. Pick Chrome, YouTube, Instagram and anything else that eats your nights.</li>
        <li>Tap <b>Set a schedule</b>: ${esc(cfg("bed"))} to ${esc(cfg("wake"))}, every day. Those apps are paused and silent overnight.</li>
        <li>Same screen → <b>Bedtime mode</b>, same times: grayscale and Do Not Disturb.</li>
        <li>Optional: Digital Wellbeing → Chrome → set site timers for YouTube or Instagram on the web.</li></ol></details>
      <details><summary>Windows laptop (Chrome or Edge, 3 min)</summary><ol class="plain" style="padding-left:20px">
        <li>Install <a href="https://chromewebstore.google.com/detail/leechblock-ng/blaaajhemilngeeffpbfkdjjoefldkok" target="_blank" rel="noopener">LeechBlock NG</a> (free).</li>
        <li>Block set 1, sites: <code>*</code> on the first line (everything), then <code>+manojhunasimarad.github.io</code> so this app still opens to log sleep.</li>
        <li>Times: <code>${esc(cfg("bed").replace(":", ""))}-2400, 0000-${esc(cfg("wake").replace(":", ""))}</code>, every day. Turn on the option that stops you editing the block set while it's active, and set an access password.</li></ol></details></section>
    <section class="card"><header><h2>🔕 Silent phone during focus</h2></header>
      <p class="small">Import the focus calendar (Schedule → Real reminders), then on the phone: Settings → <b>Modes</b> (or Sound → Do Not Disturb) → <b>Schedules</b> → add a <b>Calendar event</b> schedule → calendar <b>Manoj OS Focus</b>. Your phone goes silent during Philips, Python, research, book and riding blocks, and back on after. For anything else you start, tap “I'm on it · focus” on Now and swipe down → Do Not Disturb.</p></section>
    <section class="card"><header><h2>Notifications</h2></header>
      <p class="small muted">While the app is open (or in a background tab on the laptop) it can pop a notification when each block starts and when the washing machine is done. Status: ${esc(notif)}.</p>
      <div class="row"><button class="btn sm" data-act="notif" ${notif === "granted" || notif === "unsupported" ? "disabled" : ""}>Allow notifications</button></div></section>
    <section class="card"><header><h2>Sync phone ↔ laptop through GitHub</h2><span class="r chip ${g.token ? "ok" : ""}">${g.token ? "on" : "off"}</span></header>
      <p class="small muted">Your data as one JSON file in a private repo of yours, so it works without any subscription. 1) On GitHub, create a <b>private</b> repo, e.g. <code>manoj-os-data</code>. 2) Settings → Developer settings → Fine-grained tokens → access to that repo only, permission <b>Contents: read and write</b>. 3) Paste below on each device. The token is stored on this device only and never synced.</p>
      <div class="grid2"><label class="f">Repo (owner/name)<input type="text" id="ghRepo" value="${esc(g.repo)}" placeholder="manojhunasimarad/manoj-os-data"></label><label class="f">File<input type="text" id="ghPath" value="${esc(g.path)}"></label></div>
      <label class="f">Token<input type="password" id="ghToken" value="${esc(g.token)}" autocomplete="off"></label>
      <div class="row"><button class="btn pri sm" data-act="ghsave">Save and sync</button>${g.token ? `<button class="btn sm" data-act="ghsync">Sync now</button><button class="btn sm ghost" data-act="ghoff">Forget token</button>` : ""}</div>
      <p class="small muted">${g.last ? "Last sync " + new Date(g.last).toLocaleString("en-IN") + "." : ""} ${g.err ? "Last error: " + esc(g.err) : ""}</p></section>
    <section class="card"><header><h2>Backup</h2></header><div class="row"><button class="btn sm" data-act="export">Download backup</button><label class="btn sm">Restore backup<input type="file" accept="application/json" data-input="restore" hidden></label></div></section>
    <section class="card flat"><p class="small muted">Manoj OS · built ${esc(D.built)} · content from Kitchen From Zero, LLM From Zero and Dalal Dojo · ${DEV_LABEL}. Everything stays on your device unless you turn on GitHub sync. The defaults live in <code>content.js</code> on GitHub; edit them there.</p></section>`;
}
function editListSheet(which) {
  const cur = which === "rules" ? (S.rules || window.OS_RULES) : (S.kit || window.OS_KIT);
  const parts = which === "rules" ? [["do", "Do"], ["dont", "Don't"]] : [["daily", "Every day"], ["weekly", "Every week"], ["ignore", "Ignore"]];
  openSheet(which === "rules" ? "Your rules" : "Use · weekly · ignore", `<p class="small muted">One per line.</p>${parts.map(([k, l]) => `<label class="f">${l}<textarea data-list="${k}" style="min-height:120px;font-family:var(--sans);font-size:14px">${esc(cur[k].join("\n"))}</textarea></label>`).join("")}
    <div class="row"><button class="btn pri" data-act="listsave" data-arg="${which}">Save</button><button class="btn ghost" data-act="listreset" data-arg="${which}">Reset</button></div>`);
}
