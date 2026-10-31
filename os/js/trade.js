/* Trade: paper trades on the real market, journalled with Zerodha's charges and 1% risk sizing.
   Plus one lesson a day and missions that check your own journal. */
"use strict";

/* NSE equity holidays still ahead in 2026 (exchange circular). Add 2027's when NSE publishes them. */
const NSE_HOLIDAYS = { "2026-11-10": "Diwali Balipratipada", "2026-11-24": "Guru Nanak Jayanti", "2026-12-25": "Christmas" };
const MUHURAT = { "2026-11-08": "Muhurat trading (Diwali); timing per NSE circular" };
function market(d = new Date()) {
  const ds = ymd(d), dow = d.getDay(), m = minOf(d), O = 9 * 60 + 15, C = 15 * 60 + 30;
  if (MUHURAT[ds]) return { open: false, label: "Special session today", why: MUHURAT[ds] };
  if (dow === 0 || dow === 6) return { open: false, label: "Closed · weekend", why: "Opens Monday 9:15" };
  if (NSE_HOLIDAYS[ds]) return { open: false, label: "Closed · " + NSE_HOLIDAYS[ds], why: "NSE holiday" };
  if (m < 9 * 60) return { open: false, label: "Pre-open at 9:00", why: "Opens " + dur(O - m) + " from now" };
  if (m < O) return { open: false, label: "Pre-open session", why: "Opens at 9:15" };
  if (m < C) return { open: true, label: "Open", why: dur(C - m) + " to close" };
  return { open: false, label: "Closed for the day", why: "Opens tomorrow 9:15 (if a trading day)" };
}

/* Zerodha equity charges (from Dalal Dojo, rates as published Oct 2026; approximate). */
const RATE = { brokPct: 0.0003, brokCap: 20, sttIntraSell: 0.00025, sttDel: 0.001, txn: 0.0000307, sebi: 0.000001, stampIntra: 0.00003, stampDel: 0.00015, gst: 0.18, dp: 15.34 };
function charges(side, value, delivery) {
  const brokerage = delivery ? 0 : Math.min(RATE.brokCap, value * RATE.brokPct);
  const stt = delivery ? value * RATE.sttDel : (side === "SELL" ? value * RATE.sttIntraSell : 0);
  const txn = value * RATE.txn, sebi = value * RATE.sebi;
  const stamp = side === "BUY" ? value * (delivery ? RATE.stampDel : RATE.stampIntra) : 0;
  const gst = (brokerage + txn + sebi) * RATE.gst;
  return brokerage + stt + txn + sebi + stamp + gst;
}
function tradeResult(t) {
  if (t.exit == null) return null;
  const dir = t.side === "BUY" ? 1 : -1, del = t.product === "CNC";
  const gross = (t.exit - t.entry) * t.qty * dir;
  const buyVal = (t.side === "BUY" ? t.entry : t.exit) * t.qty, sellVal = (t.side === "BUY" ? t.exit : t.entry) * t.qty;
  const ch = charges("BUY", buyVal, del) + charges("SELL", sellVal, del) + (del && t.side === "BUY" ? RATE.dp : 0);
  const risk = Math.abs(t.entry - t.stop) * t.qty;
  return { gross, ch, net: gross - ch, r: risk ? gross / risk : 0 };
}
const riskBudget = () => cfg("capital") * cfg("riskPct") / 100;
const riskQty = (entry, stop) => { const per = Math.abs(entry - stop); return per > 0 ? Math.floor(riskBudget() / per) : 0; };
/* 1% risk size, capped so the position never needs more than your paper capital (no leverage while learning). */
const suggestQty = (entry, stop) => Math.min(riskQty(entry, stop), entry > 0 ? Math.floor(cfg("capital") / entry) : 0);
function stats() {
  const closed = S.trades.filter(t => t.exit != null), res = closed.map(tradeResult);
  const wins = res.filter(r => r.net > 0).length, net = res.reduce((a, r) => a + r.net, 0);
  const avgR = res.length ? res.reduce((a, r) => a + r.r, 0) / res.length : 0;
  const plan = closed.filter(t => t.plan === true).length;
  return { n: closed.length, open: S.trades.length - closed.length, wins, net, avgR, exp: res.length ? net / res.length : 0, plan, ch: res.reduce((a, r) => a + r.ch, 0) };
}
/* Missions from Dalal Dojo's desk, checked against the real journal instead of the simulator. */
const MISSIONS = [
  { id: "size1", c: "risk1", t: "Size a trade for 1% risk", ok: () => S.trades.some(t => { const q = suggestQty(t.entry, t.stop); return q && Math.abs(t.qty - q) <= Math.max(1, q * 0.1); }) },
  { id: "stop", c: "stop", t: "Every trade has a stop-loss", ok: () => S.trades.length >= 3 && S.trades.every(t => t.stop) },
  { id: "green", c: "green", t: "Green after charges", ok: () => S.trades.some(t => { const r = tradeResult(t); return r && r.net > 0; }) },
  { id: "twoR", c: "two_r", t: "Bank a 2R winner", ok: () => S.trades.some(t => { const r = tradeResult(t); return r && r.r >= 2; }) },
  { id: "five", c: "journal", t: "Journal five trades", ok: () => S.trades.filter(t => t.exit != null && t.why).length >= 5 },
  { id: "exp", c: "pf", t: "Positive expectancy over 20 trades", ok: () => { const s = stats(); return s.n >= 20 && s.exp > 0; } },
  { id: "py", c: "export", t: "Hand it to Python (export the CSV)", ok: () => !!S.missions.csv }
];
const conceptFor = id => (D.trade.concepts.find(c => c.id === id) || {}).c || "";
const tLessonNext = () => D.trade.lessons.find(l => !S.tl.done[l.id]) || null;

function tradePickLi(d) {
  const mk = market(d), l = tLessonNext(), open = S.trades.filter(t => t.exit == null).length;
  if (mk.open) return `<div class="li"><span aria-hidden="true">📈</span><div class="grow"><div class="t1">Market open: ${open ? open + " paper trade" + (open > 1 ? "s" : "") + " to manage" : "one planned paper trade max"}</div><div class="t2">${esc(mk.why)} · prices from Kite, plan in here</div></div><a class="btn sm" href="#trade">Trade</a></div>`;
  return `<div class="li"><span aria-hidden="true">📈</span><div class="grow"><div class="t1">${l ? "Lesson: " + esc(l.t) : "All 24 lessons done"}</div><div class="t2">${esc(mk.label)} · ${l ? l.mins + " min · " + esc(l.mod) : "review your journal"}</div></div><a class="btn sm" href="#trade">Trade</a></div>`;
}

let lessonQ = {};
function renderTrade() {
  const d = new Date(), mk = market(d), s = stats(), sleepShort = lastNight() && sleptMin(lastNight()) < 360;
  let h = `<div class="stack">`;
  h += `<section class="card"><header><h2>Market</h2><span class="r chip ${mk.open ? "ok" : ""}">${esc(mk.label)}</span></header>
    <p class="small muted">${esc(mk.why)}. Paper trades use real prices: read them in Kite, plan and log here. No real money until the journal earns it.</p>
    ${sleepShort ? `<div class="note">You slept under 6 hours. House rule: no trades today, lessons only.</div>` : ""}
    <div class="grid3"><div class="stat"><div class="v">${s.n}</div><div class="k">closed trade${s.n === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="v">${s.n ? Math.round(100 * s.wins / s.n) + "%" : "—"}</div><div class="k">win rate</div></div>
      <div class="stat"><div class="v">${s.n ? s.avgR.toFixed(2) + "R" : "—"}</div><div class="k">average R</div></div>
      <div class="stat"><div class="v">${s.n ? rupee(s.net) : "—"}</div><div class="k">net after charges</div></div>
      <div class="stat"><div class="v">${s.n ? rupee(s.ch) : "—"}</div><div class="k">charges paid</div></div>
      <div class="stat"><div class="v">${s.n ? Math.round(100 * s.plan / s.n) + "%" : "—"}</div><div class="k">followed the plan</div></div></div>
    <div class="row"><button class="btn pri" data-act="newtrade" ${sleepShort ? "disabled" : ""}>New paper trade</button><button class="btn" data-act="csv">Export CSV</button>
      <span class="small muted">Risk per trade: ${rupee(riskBudget())} (${cfg("riskPct")}% of ${rupee(cfg("capital"))})</span></div></section>`;
  const open = S.trades.filter(t => t.exit == null), closed = S.trades.filter(t => t.exit != null).slice(-15).reverse();
  if (open.length) h += `<section class="card"><header><h2>Open</h2></header><div class="list">${open.map(t => `<div class="li"><div class="grow"><div class="t1">${esc(t.side)} ${t.qty} ${esc(t.sym)} @ ${t.entry} <span class="pill">${t.product === "CNC" ? "Delivery" : "Intraday"}</span></div>
    <div class="t2">Stop ${t.stop}${t.target ? " · target " + t.target : ""} · ${esc(t.setup)} · ${esc(t.why || "")}</div></div><button class="btn sm pri" data-act="closetrade" data-arg="${esc(t.id)}">Close</button></div>`).join("")}</div></section>`;
  h += `<section class="card"><header><h2>Journal</h2><span class="r small muted">last 15</span></header>${closed.length ? `<div class="list">${closed.map(t => { const r = tradeResult(t); return `<div class="li"><div class="grow"><div class="t1">${esc(t.side)} ${t.qty} ${esc(t.sym)} · ${t.entry} → ${t.exit}</div>
    <div class="t2">${new Date(t.opened).toLocaleDateString("en-IN")} · ${esc(t.setup)} · net <b style="color:var(${r.net >= 0 ? "--good" : "--bad"})">${rupee(r.net)}</b> (${r.r.toFixed(2)}R, charges ${rupee(r.ch)})${t.plan === false ? " · broke the plan" : ""}</div></div><button class="btn sm ghost" data-act="deltrade" data-arg="${esc(t.id)}" aria-label="Delete">×</button></div>`; }).join("")}</div>` : `<p class="empty">No closed trades yet. The first mission is a trade sized for 1% risk.</p>`}</section>`;

  // Missions
  h += `<section class="card"><header><h2>Missions</h2><span class="r small muted">checked against your journal</span></header><div class="list">${MISSIONS.map(m => { const ok = m.ok(); return `<details class="li" style="display:block"><summary>${ok ? "✅" : "⬜"} ${esc(m.t)}</summary><p class="small muted" style="margin-top:6px">${esc(conceptFor(m.c) || "")}</p></details>`; }).join("")}</div></section>`;

  // Lesson
  const l = tLessonNext();
  if (l) {
    const q = lessonQ[l.id] || {};
    h += `<section class="card"><header><span class="lbl">Lesson ${D.trade.lessons.indexOf(l) + 1} of ${D.trade.lessons.length} · ${esc(l.mod)} · ${l.mins} min</span></header><h2>${esc(l.t)}</h2>
      <div class="prose">${l.body.map(b => typeof b === "string" ? `<p>${md(b)}</p>` : b.list ? `<ul>${b.list.map(x => `<li>${md(x)}</li>`).join("")}</ul>` : b.note ? `<div class="note">${md(b.note)}</div>` : "").join("")}</div>
      ${l.take ? `<p><b>Takeaway:</b> ${md(l.take)}</p>` : ""}
      ${l.quiz.map((z, qi) => `<div class="quiz"><p><b>${esc(z.q)}</b></p>${z.o.map((o, i) => `<button class="opt ${q[qi] != null ? (i === z.a ? "right" : i === q[qi] ? "wrong" : "") : ""}" data-act="tquiz" data-arg="${esc(l.id)}" data-q="${qi}" data-i="${i}" ${q[qi] != null ? "disabled" : ""}>${esc(o)}</button>`).join("")}${q[qi] != null ? `<div class="note">${esc(z.e)}</div>` : ""}</div>`).join("")}
      <div class="row"><button class="btn good" data-act="tdone" data-arg="${esc(l.id)}">Lesson done ✓</button></div></section>`;
  }
  h += `<section class="card flat"><header><h3>Elsewhere</h3></header><div class="row">
    <a class="btn sm" href="${esc(ME.links.desk)}" target="_blank" rel="noopener">Dalal Dojo desk (Saturday sim) ↗</a>
    <a class="btn sm" href="${esc(ME.links.varsity)}" target="_blank" rel="noopener">Zerodha Varsity ↗</a>
    <a class="btn sm" href="${esc(ME.links.algo)}" target="_blank" rel="noopener">nse-algo-trading-bot ↗</a></div>
    <p class="small muted">The algo path: 50+ journalled trades → export CSV → test the same rules in Python in your bot repo → only then think about Kite Connect.</p></section>`;
  h += `</div>`;
  return h;
}
function newTradeSheet() {
  openSheet("New paper trade", `<p class="small muted">Write the plan before you enter. Read the live price in Kite.</p>
    <div class="grid2">
      <label class="f">Symbol<input type="text" id="tSym" placeholder="e.g. RELIANCE" autocapitalize="characters"></label>
      <label class="f">Side<select id="tSide"><option>BUY</option><option>SELL</option></select></label>
      <label class="f">Entry price<input type="number" id="tEntry" step="0.05" inputmode="decimal"></label>
      <label class="f">Stop-loss<input type="number" id="tStop" step="0.05" inputmode="decimal"></label>
      <label class="f">Target (optional)<input type="number" id="tTarget" step="0.05" inputmode="decimal"></label>
      <label class="f">Product<select id="tProd"><option value="MIS">Intraday (MIS)</option><option value="CNC">Delivery (CNC)</option></select></label>
      <label class="f">Quantity<input type="number" id="tQty" step="1" inputmode="numeric"></label>
      <label class="f">Setup<select id="tSetup"><option>Breakout</option><option>Pullback</option><option>VWAP reclaim</option><option>Range</option><option>Long-term buy</option><option>Other</option></select></label>
    </div>
    <p class="small" id="tHint">Enter entry and stop to see the 1% risk size.</p>
    <label class="f">Why this trade? (one line)<input type="text" id="tWhy" placeholder="What you see, and what would prove you wrong"></label>
    <div class="row"><button class="btn pri" data-act="savetrade">Log it</button><button class="btn" data-act="close">Cancel</button></div>`);
}
function tradeHint() {
  const e = +$("#tEntry").value, s = +$("#tStop").value, el = $("#tHint");
  if (!e || !s) { el.textContent = "Enter entry and stop to see the 1% risk size."; return; }
  const q = suggestQty(e, s), rq = riskQty(e, s), qtyEl = $("#tQty");
  el.innerHTML = `1% risk (${esc(rupee(riskBudget()))}) at ${Math.abs(e - s).toFixed(2)} a share = <b>${q} shares</b>, ${esc(rupee(q * e))} of capital.` +
    (rq > q ? ` <span class="muted">(1% risk alone would be ${rq} shares, more than your capital; a stop that tight is usually too tight.)</span>` : "");
  if (!qtyEl.value) qtyEl.placeholder = String(q);
}
function saveTrade() {
  const t = { id: uid(), u: Date.now(), opened: Date.now(), sym: $("#tSym").value.trim().toUpperCase(), side: $("#tSide").value, entry: +$("#tEntry").value, stop: +$("#tStop").value,
    target: +$("#tTarget").value || null, product: $("#tProd").value, qty: +$("#tQty").value || suggestQty(+$("#tEntry").value, +$("#tStop").value), setup: $("#tSetup").value, why: $("#tWhy").value.trim() };
  if (!t.sym || !t.entry || !t.stop || !t.qty) { toast("Symbol, entry, stop-loss and quantity are needed. The stop isn't optional."); return; }
  if ((t.side === "BUY" && t.stop >= t.entry) || (t.side === "SELL" && t.stop <= t.entry)) { toast("The stop is on the wrong side of the entry."); return; }
  S.trades.push(t); save(); closeLayer(); toast("Paper trade logged."); render();
}
function closeTradeSheet(id) {
  const t = S.trades.find(x => x.id === id);
  openSheet("Close " + t.sym, `<label class="f">Exit price<input type="number" id="tExit" step="0.05" inputmode="decimal"></label>
    <label class="subt"><input type="checkbox" id="tPlan" checked> I followed my plan (stop, size, reason)</label>
    <label class="f">Lesson (optional)<input type="text" id="tNote" placeholder="What would you do differently?"></label>
    <div class="row"><button class="btn pri" data-act="savetradeclose" data-arg="${esc(id)}">Close trade</button></div>`);
}
function tradeCsv() {
  const rows = [["opened", "closed", "symbol", "side", "product", "qty", "entry", "stop", "target", "exit", "setup", "reason", "followed_plan", "gross", "charges", "net", "r_multiple", "note"]];
  for (const t of S.trades) {
    const r = tradeResult(t) || {};
    rows.push([new Date(t.opened).toISOString(), t.closed ? new Date(t.closed).toISOString() : "", t.sym, t.side, t.product, t.qty, t.entry, t.stop, t.target || "", t.exit == null ? "" : t.exit, t.setup, t.why || "", t.plan == null ? "" : t.plan,
      r.gross != null ? r.gross.toFixed(2) : "", r.ch != null ? r.ch.toFixed(2) : "", r.net != null ? r.net.toFixed(2) : "", r.r != null ? r.r.toFixed(3) : "", t.note || ""]);
  }
  download("paper-trades-" + today() + ".csv", rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(",")).join("\n"), "text/csv");
  S.missions.csv = Date.now(); save(true); render();
}
