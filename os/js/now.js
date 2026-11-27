/* Now: the moment, focus sessions, today's three, the day as a checklist, and the night lock after bedtime. */
"use strict";

let nowDay = 0;            // 0 = today; the arrows on the day list move it
let nightPassUntil = 0;    // a 10-minute pass through the night lock

/* ------------------------------------------------------------------ night lock
   After bedtime every tab except Life is behind this screen. A pass is allowed, and counted. */
function nightLocked() { return lateBy() > 0 && Date.now() > nightPassUntil; }
function nightLockHtml() {
  const d = new Date(), late = lateBy(d), nk = nightKey(d), opens = Math.max(1, (S.late[nk] || []).length), passes = (S.nightPass || {})[nk] || 0;
  const wakeIn = (toMin(cfg("wake")) - minOf(d) + 1440) % 1440;
  const asleep = !!S.sleep.pending;
  return `<div class="stack"><section class="card hero" style="border-left-color:var(--bad);text-align:center;align-items:center;padding:28px 16px">
    <div style="font-size:54px;line-height:1">🌚</div>
    <div class="lbl">Night lock · ${hm(minOf(d))}</div>
    <div class="what">${asleep ? "You logged sleep at " + clockOf(S.sleep.pending) + ". So why are we talking?" : "Bedtime was " + esc(cfg("bed")) + ". You're " + dur(late) + " over."}</div>
    <p class="muted">Alarm in ${dur(wakeIn)}. Opened ${opens} time${opens === 1 ? "" : "s"} tonight${passes ? " · " + passes + " pass" + (passes > 1 ? "es" : "") + " used" : ""}.</p>
    <div class="row" style="justify-content:center">
      ${asleep ? `<button class="btn pri" data-act="backtosleep">Back to sleep 😴</button>${wakeIn < 60 ? `<button class="btn" data-act="wake">I'm up ☀️</button>` : ""}`
               : `<button class="btn pri" data-act="sleep">Going to sleep 😴</button>`}
      <button class="btn ghost" data-act="nightpass">10-minute pass</button>
    </div>
    <p class="small muted">Chrome and YouTube still work, because a web page can't block other apps. Android's Focus mode can: Life → Settings → Block apps at night.</p>
  </section></div>`;
}

/* ------------------------------------------------------------------ focus ("I'm on it")
   Confirms you're doing the current block: roasts go quiet until it ends, and you get the nudge to silence the phone. */
function startFocus() {
  const info = nowInfo(), b = info.cur;
  S.focus = { start: Date.now(), until: Date.now() + Math.max(10, info.left) * 60000, t: b.t, k: b.k, id: b.id };
  save();
  toast("On it until " + hm(b.e) + ". " + (PHONE ? "Swipe down → Do Not Disturb." : "Phone face down."));
  render();
}
function endFocus() {
  if (!S.focus) return;
  const mins = Math.round((Math.min(Date.now(), S.focus.until) - S.focus.start) / 60000), ds = today();
  S.focusLog = S.focusLog || {}; S.focusLog[ds] = (S.focusLog[ds] || 0) + mins;
  if (mins >= 10 && S.focus.id) ticksOf(ds)[S.focus.id] = Date.now();
  S.focus = null; save();
  toast(mins >= 10 ? "Focused " + dur(mins) + ". Block ticked." : "Ended.");
  render();
}

/* ------------------------------------------------------------------ the tab */
function renderNow() {
  const d = new Date(), ds = ymd(d), info = nowInfo(d), b = info.cur;
  let h = `<div class="stack">`;
  h += heroHtml(d, info);
  const lastR = S.roast.log[0];
  if (lastR && Date.now() - lastR.t < 3 * 3600000) h += `<div class="roastline"><span class="e" aria-hidden="true">${R[lastR.k] ? R[lastR.k].icon : "🔥"}</span><div><div class="lbl">${clockOf(lastR.t)} · ${esc(R[lastR.k] ? R[lastR.k].title : "")}</div><p>${esc(lastR.line)}</p></div></div>`;
  const ll = laundryLeft();
  if (ll != null) h += `<section class="card"><div class="row sp"><h3>🧺 Washing machine</h3><span class="mono">${ll > 0 ? dur(ll / 60000) + " left" : "done " + dur(-ll / 60000) + " ago"}</span></div>
      ${barHtml(S.laundry.min * 60000 - Math.max(0, ll), S.laundry.min * 60000, ll > 0 ? "" : "warn")}
      <div class="row"><button class="btn sm ${ll > 0 ? "" : "pri"}" data-act="hang">Hung them ✓</button></div></section>`;
  const trip = tripOn(ds), tmr = !trip && tripOn(ymd(addDays(d, 1))), back = !trip && tripOn(ymd(addDays(d, -1)));
  if (trip) h += `<section class="card"><h3>🧳 Travelling${trip.place ? " · " + esc(trip.place) : ""}</h3><p class="muted small">Until ${esc(trip.to)}. Cooking, chores and trading are off; Python recall and walks stay on.</p></section>`;
  if (tmr) h += `<section class="card"><h3>🧳 Trip tomorrow${tmr.place ? " · " + esc(tmr.place) : ""}</h3>${tripList(tmr, "before")}</section>`;
  if (back) h += `<section class="card"><h3>🏠 Back home</h3>${tripList(back, "back")}</section>`;
  h += `<section class="card"><header><h2>Today's three</h2><span class="r muted small">one of each is enough</span></header>
    <div class="list">${cookPickLi(d)}${learnPickLi(d)}${tradePickLi(d)}</div></section>`;
  h += statsHtml(d);
  h += dayListHtml(addDays(d, nowDay), nowDay === 0 ? info : null);
  return h + `</div>`;
}
function heroHtml(d, info) {
  const b = info.cur, ds = ymd(d);
  if (S.sleep.pending) return `<section class="card hero"><div class="lbl">Asleep since ${clockOf(S.sleep.pending)}</div>
      <div class="what">☀️ Morning, ${esc(ME.name)}</div><p class="muted">Tap when you're actually up: it records the night.</p>
      <button class="btn pri block" data-act="wake">I'm up ☀️</button></section>`;
  if (S.focus && S.focus.until > Date.now()) {
    const left = (S.focus.until - Date.now()) / 60000, total = (S.focus.until - S.focus.start) / 60000;
    return `<section class="card hero" style="border-left-color:var(--good)"><div class="row sp"><span class="lbl">On it · focus</span><span class="left">${dur(left)} left</span></div>
      <div class="what">${icon(S.focus.k)} ${esc(S.focus.t)}</div>${barHtml(total - left, total, "good")}
      <p class="small muted">Roasts are quiet until this ends. ${PHONE ? "Phone on Do Not Disturb?" : "Phone face down?"}</p>
      <div class="row"><button class="btn" data-act="focusend">Done · end focus</button></div></section>`;
  }
  if (b.k === "sleep" && info.m < toMin(cfg("wake"))) return `<section class="card hero"><div class="lbl">Before the alarm · ${dur(info.left)} to ${esc(cfg("wake"))}</div>
      <div class="what">🌅 Up early?</div><p class="muted">Tap and add last night's bedtime. An early start counts; just don't spend it on reels.</p>
      <button class="btn pri block" data-act="wake">I'm up ☀️</button></section>`;
  const pct = clamp(Math.round(100 * (info.m - b.s) / Math.max(1, b.e - b.s)), 0, 100), done = isTicked(ds, b.id);
  const real = b.k !== "sleep" && !b.gap;
  return `<section class="card hero"><div class="row sp"><span class="lbl">Now · ${hm(b.s)}–${hm(b.e)}</span><span class="left">${dur(info.left)} left</span></div>
    <div class="what">${icon(b.k)} ${esc(b.t)}</div>${barHtml(pct, 100)}
    ${b.sub.length ? `<div class="subs" style="display:flex;flex-direction:column;gap:4px">${b.sub.map((s, i) => subTick(ds, b, s, i)).join("")}</div>` : ""}
    <p class="small muted">${info.next ? "Next" + (info.next.tomorrow ? " (tomorrow)" : "") + ": " + icon(info.next.k) + " " + esc(info.next.t) + " · " + hm(info.next.s) : ""}</p>
    <div class="row">${real ? `<button class="btn ${done ? "good" : ""}" data-act="tick" data-arg="${esc(b.id)}">${done ? "Done ✓" : "Mark done"}</button>` : ""}
      ${real && ["work", "learn", "research", "book", "trade", "clean", "cook", "fix", "laundry", "workout", "run"].includes(b.k) ? `<button class="btn" data-act="focus">I'm on it · focus</button>` : ""}
      ${blockAction(b)}</div></section>`;
}
function blockAction(b) {
  if (b.k === "laundry" && /load/i.test(b.t) && !S.laundry) return `<button class="btn" data-act="laundry">🧺 Start ${cfg("washMin")}-min timer</button>`;
  if (b.k === "cook" || b.k === "eat") return `<a class="btn" href="#cook">🍳 What do I cook?</a>`;
  if (b.k === "learn" || b.k === "recall") return `<a class="btn" href="#learn">🐍 Today's Python</a>`;
  if (b.k === "trade") return `<a class="btn" href="#trade">📈 Trade</a>`;
  if (b.k === "research" || b.k === "book") return `<a class="btn" href="#learn">📬 Radar · books</a>`;
  if (b.k === "read" || b.k === "wind") return `<button class="btn" data-act="sleep">😴 Going to sleep</button>`;
  if (b.k === "run" || b.k === "workout" || b.k === "walk") return `<button class="btn" data-act="runlog">🏃 Log a run</button>`;
  if (b.k === "fix" || b.k === "review" || b.k === "people") return `<a class="btn" href="#life">🧭 Life</a>`;
  return "";
}
function subTick(ds, b, s, i) {
  const id = b.id + "#" + i;
  return `<label class="subt"><input type="checkbox" data-act="subtick" data-ds="${ds}" data-arg="${esc(id)}" ${isTicked(ds, id) ? "checked" : ""}>${esc(s)}</label>`;
}
function statsHtml(d) {
  const ds = ymd(d), ln = lastNight(), sm = ln ? sleptMin(ln) : 0, target = cfg("sleepTarget") * 60;
  const p = Math.round(proteinOn(ds)), pt = cfg("proteinTarget"), ph = phoneMin(ds), pht = cfg("phoneTarget"), st = streak(), aw = LOC.awCache[ds];
  const fasting = isFast(d) && minOf(d) < 19 * 60;
  const tile = (inner, act, href) => href ? `<a class="stat" href="${href}" style="text-decoration:none;color:inherit;display:block">${inner}</a>` : `<button class="stat" data-act="${act}" style="text-align:left;border:0;cursor:pointer;width:100%">${inner}</button>`;
  return `<section class="grid2">
    ${tile(`<div class="k">😴 Last night</div><div class="v">${ln ? dur(sm) : "—"}</div>${ln ? barHtml(sm, target, sm >= target - 30 ? "good" : sm < 360 ? "bad" : "warn") : `<div class="k">tap to add</div>`}`, "sleepsheet")}
    ${tile(`<div class="k">🥚 Protein</div><div class="v">${p}<span class="small muted"> / ${pt} g</span></div>${fasting ? `<div class="k">🙏 fast: all at dinner</div>` : barHtml(p, pt, p >= pt * .9 ? "good" : "")}`, null, "#cook")}
    ${tile(`<div class="k">📱 Phone today</div><div class="v">${ph ? dur(ph) : "—"}</div>${ph ? barHtml(ph, pht, ph > pht ? "bad" : "good") : `<div class="k">tap: Digital Wellbeing total</div>`}`, "phonelog")}
    ${tile(`<div class="k">🔥 Python streak</div><div class="v">${st} day${st === 1 ? "" : "s"}</div><div class="k">${aw ? "💻 laptop " + dur(aw.total / 60) + " today" : learnedOn(ds) ? "today counted ✓" : "not yet today"}</div>`, null, "#learn")}
  </section>`;
}
function dayListHtml(date, info) {
  const ds = ymd(date), prog = dayProgress(date), list = blocksFor(date).filter(x => !(x.gap && x.e - x.s < 20));
  const title = nowDay === 0 ? "Today · " + DAYS_LONG[date.getDay()] : nowDay === 1 ? "Tomorrow · " + DAYS_LONG[date.getDay()] : nowDay === -1 ? "Yesterday · " + DAYS_LONG[date.getDay()] : DAYS_LONG[date.getDay()] + " " + ds.slice(5);
  return `<section class="card"><header><h2>${esc(title)}</h2><span class="r mono small">${prog.done}/${prog.total}</span></header>
    <p class="small muted">${DAYKIND_LABEL[dayKind(date)]}${isFast(date) ? " · 🙏 fast till dinner" : ""}</p>${barHtml(prog.done, prog.total, "good")}
    <div class="tl">${list.map(x => blockRow(ds, x, info)).join("")}</div>
    <div class="row sp"><button class="btn sm" data-act="nowday" data-arg="${nowDay - 1}">← ${DAYS[addDays(date, -1).getDay()]}</button>
      ${nowDay !== 0 ? `<button class="btn sm" data-act="nowday" data-arg="0">Today</button>` : `<a class="btn sm ghost" href="#life">Edit the week</a>`}
      <button class="btn sm" data-act="nowday" data-arg="${nowDay + 1}">${DAYS[addDays(date, 1).getDay()]} →</button></div></section>`;
}
function blockRow(ds, x, info) {
  const isNow = info && x === info.cur, done = isTicked(ds, x.id) || (x.k === "sleep" && x.id === "sleep-am" && !!S.sleep.nights[ds]);
  const past = info && x.e <= info.m;
  const tick = x.k === "sleep" || x.gap ? "<span></span>" : `<button class="tick" role="checkbox" aria-checked="${done}" aria-label="Done: ${esc(x.t)}" data-act="tickday" data-ds="${ds}" data-arg="${esc(x.id)}"></button>`;
  const showSubs = x.sub.length && (!info || !past);
  return `<div class="blk ${isNow ? "now" : ""} ${done ? "done" : ""} ${past && !isNow ? "past" : ""}"><span class="t">${hm(x.s)}</span><span class="ic" aria-hidden="true">${icon(x.k)}</span>
    <div class="w"><div class="n">${esc(x.t)}</div>${showSubs ? `<div class="subs">${x.sub.map((s, i) => subTick(ds, x, s, i)).join("")}</div>` : ""}</div>${tick}</div>`;
}
function tripList(trip, which) {
  const items = window.OS_TRIP[which], k = trip.id + ":" + which, t = S.tripTicks[k] || {};
  return `<div class="subs" style="display:flex;flex-direction:column;gap:4px">${items.map((s, i) => `<label class="subt"><input type="checkbox" data-act="triptick" data-arg="${esc(k)}" data-i="${i}" ${t[i] ? "checked" : ""}>${esc(s)}</label>`).join("")}</div>`;
}
