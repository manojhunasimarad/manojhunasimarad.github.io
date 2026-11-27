/* Cook: one pick that fits the cook block you're in, from your pantry, with protein first. Plus the protein log,
   the pantry, and a shopping list. Recipes come from Kitchen From Zero, plus the dishes you asked about in October. */
"use strict";

const PANTRY = Object.fromEntries(D.pantry.map(p => [p.k, p]));
const SOFT = new Set(D.soft);
const RECIPES = D.recipes;
const RBYID = Object.fromEntries(RECIPES.map(r => [r.id, r]));
const FRESH = ["onion", "tomato", "potato", "milk", "curd", "eggs", "chicken", "chickenbl", "paneer", "bread", "capsicum", "cucumber", "coriander", "spinach", "bhindi", "banana"];
const cookOpt = { slot: "auto", budget: 0, diet: "any", seed: 0, q: "" };   // budget: 0 = auto, 999 = any

const labelOf = k => k.split("|").map(x => (PANTRY[x] ? PANTRY[x].l : x)).join(" or ");
const pstate = k => (S.pantry[k] != null ? S.pantry[k] : PANTRY[k] ? PANTRY[k].d : 0);   // 0 have, 1 low, 2 out
const haveOne = need => need.split("|").some(k => SOFT.has(k) || pstate(k) < 2);
const missingOf = r => r.needs.filter(n => !haveOne(n));
const people = () => clamp(+(cfg("people") || 1), 1, 8);

/* The cook block that's on now, or the next one today. */
function cookBlock(d = new Date()) {
  const m = minOf(d), list = blocksFor(d).filter(b => b.k === "cook");
  return list.find(b => b.s <= m && m < b.e) || list.find(b => b.s > m) || null;
}
function autoSlot(d = new Date()) {
  const b = cookBlock(d), m = b ? b.s : minOf(d);
  if (isFast(d)) return "Dinner";
  if (m < 11 * 60) return /lunch box/i.test(b ? b.t : "") ? "Breakfast + lunch box" : "Breakfast";
  if (m < 15 * 60 + 30) return "Lunch";
  if (m < 18 * 60) return "Snack";
  return "Dinner";
}
/* Minutes to cook: a "(cap: N min)" in the block wins; otherwise 30 on weekday mornings, 25 on weekday evenings, 40 at weekends. */
function autoBudget(d = new Date()) {
  const b = cookBlock(d), cap = b && b.t.match(/cap:\s*(\d+)/i);
  if (cap) return +cap[1];
  const wk = dayKind(d) === "weekend", m = b ? b.s : minOf(d);
  if (isFast(d)) return 35;
  return wk ? 40 : m < 11 * 60 ? 30 : 25;
}
const SLOT_COURSES = { "Breakfast": ["breakfast", "snack"], "Lunch box": ["main"], "Lunch": ["main", "soup"], "Snack": ["snack", "breakfast"], "Dinner": ["main", "soup"] };

function cookPicks(o = {}) {
  const d = new Date(), slot = o.slot || (cookOpt.slot === "auto" ? autoSlot(d) : cookOpt.slot);
  if (slot === "Breakfast + lunch box") return cookPicks(Object.assign({}, o, { slot: "Breakfast" }));
  const budget = o.budget || (cookOpt.budget ? cookOpt.budget : autoBudget(d)), diet = cookOpt.diet;
  const rnd = seeded(hash(today() + slot) + cookOpt.seed * 7919), out = [];
  for (const r of RECIPES) {
    if (!(SLOT_COURSES[slot] || ["main"]).includes(r.course) || !r.min || r.min > budget) continue;
    if (slot === "Lunch box" && !(r.tags.includes("lunchbox") || r.course === "main") ) continue;
    if (diet === "veg" && r.diet !== "veg") continue;
    if (diet === "egg" && r.diet === "nonveg") continue;
    const miss = missingOf(r); if (miss.length > 2) continue;
    const last = S.cooked[r.id] || 0, days = (Date.now() - last) / 86400000;
    let score = r.n.p * 1.3 - miss.length * 22 + rnd() * 12 + (r.tags.includes("mine") ? 6 : 0) + (r.tags.includes("quick") ? 4 : 0) - r.min * 0.15;
    if (slot === "Lunch box" && r.tags.includes("lunchbox")) score += 12;
    if (last && days < 3) score -= 30; else if (last && days < 7) score -= 10;
    if (isFast(d) && slot === "Dinner") score += r.n.p >= 25 ? 10 : -10;
    out.push({ r, miss, score, slot });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, o.limit || 5);
}

function cookPickLi(d) {
  d = d || new Date();
  const fasting = isFast(d) && minOf(d) < 18 * 60, x = cookPicks({ limit: 1 })[0];
  if (fasting) return `<div class="li"><span aria-hidden="true">🙏</span><div class="grow"><div class="t1">Fast day: nothing to cook till evening</div><div class="t2">${x ? "Tonight: " + esc(x.r.title) + " · " + Math.round(x.r.n.p) + " g protein" : "Dinner picks are in Cook"}</div></div><a class="btn sm" href="#cook">Cook</a></div>`;
  if (!x) return `<div class="li"><span aria-hidden="true">🍳</span><div class="grow"><div class="t1">Nothing fits right now</div><div class="t2">Mark what's in the pantry</div></div><a class="btn sm" href="#cook">Cook</a></div>`;
  return `<div class="li"><span aria-hidden="true">🍳</span><div class="grow"><div class="t1"><button class="linkish" data-act="recipe" data-arg="${esc(x.r.id)}">${esc(x.r.title)}</button></div>
    <div class="t2">${esc(autoSlot(d))} · ${x.r.min} min · ${Math.round(x.r.n.p)} g protein${x.miss.length ? " · need " + esc(x.miss.map(labelOf).join(", ")) : ""}</div></div><a class="btn sm" href="#cook">Cook</a></div>`;
}

/* Quantities: the recipes give 1 serving; this rescales "120 g", "½ tsp", "1–2 cloves"… (from Kitchen From Zero) */
const FR = [[0, ""], [.125, "⅛"], [.25, "¼"], [1 / 3, "⅓"], [.5, "½"], [2 / 3, "⅔"], [.75, "¾"], [1, ""]];
const FRV = { "½": .5, "¼": .25, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125 };
function nice(x) {
  if (x >= 10) return String(Math.round(x));
  let w = Math.floor(x), f = x - w, best = FR[0];
  FR.forEach(c => { if (Math.abs(c[0] - f) < Math.abs(best[0] - f)) best = c; });
  if (best[0] === 1) { w += 1; best = FR[0]; }
  if (w === 0 && !best[1]) return "a little";
  return (w ? String(w) : "") + best[1];
}
function scaleQ(q, f) {
  if (!q || Math.abs(f - 1) < 0.01) return q;
  return q.split(/(\s\/\s|\s\+\s)/).map(part => {
    if (/^\s[\/+]\s$/.test(part)) return part;
    if (/^a pinch/i.test(part)) return f >= 1.75 ? Math.round(f) + " pinches" + part.slice(7) : part;
    const m = part.match(/^(\d+(?:\.\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])(\s*[–-]\s*(\d+(?:\.\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]))?(.*)$/);
    if (!m) return part;
    const val = s => { s = s.trim(); let v = parseFloat(s) || 0; const fr = s.match(/[½¼¾⅓⅔⅛]/); if (fr) v += FRV[fr[0]]; return v; };
    const unit = m[4] || "";
    const fmt = v => (/^\s*(g|ml)\b/.test(unit) && v * f >= 10 ? String(Math.round(v * f / 5) * 5) : nice(v * f));
    const out = fmt(val(m[1])) + (m[2] ? "–" + fmt(val(m[3])) : "");
    return out + (val(m[1]) * f > 1.01 ? unit.replace(/^(\s*)(cup|clove|slice|inch)\b(?!es|s)/, (x, sp, u) => sp + u + (u === "inch" ? "es" : "s")) : unit);
  }).join("");
}
const appUrl = k => { const a = D.apps.find(x => x.key === (S.set.app || "instamart")) || D.apps[0]; return a.url + encodeURIComponent((PANTRY[k] && PANTRY[k].b) || k); };

/* ------------------------------------------------------------------ the tab */
function renderCook() {
  const d = new Date(), ds = ymd(d), fasting = isFast(d) && minOf(d) < 18 * 60;
  const slot = cookOpt.slot === "auto" ? autoSlot(d) : cookOpt.slot, budget = cookOpt.budget || autoBudget(d);
  const seg = (act, opts, val) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button aria-pressed="${String(val) === String(v)}" data-act="${act}" data-arg="${v}">${l}</button>`).join("")}</div>`;
  let h = `<div class="stack">`;
  if (fasting) h += `<section class="card hero" style="border-left-color:var(--info)"><div class="what">🙏 Tuesday fast</div><p class="muted">Nothing to cook until evening. These are dinner picks to break the fast: start light, then protein (40 g or more tonight).</p></section>`;
  const lists = slot === "Breakfast + lunch box" ? [["Breakfast", cookPicks({ slot: "Breakfast" })], ["Lunch box", cookPicks({ slot: "Lunch box" })]] : [[slot, cookPicks({})]];
  h += `<section class="card"><header><h2>What do I cook?</h2><span class="r muted small">${esc(slot)} · ${budget >= 999 ? "any time" : "≤ " + budget + " min"} · for ${people()}</span></header>
    <div class="row">${seg("cslot", [["auto", "Auto"], ["Breakfast", "Breakfast"], ["Lunch", "Lunch"], ["Dinner", "Dinner"], ["Snack", "Snack"]], cookOpt.slot)}</div>
    <div class="row">${seg("cbudget", [[0, "Auto"], [15, "15"], [25, "25"], [30, "30"], [45, "45"], [60, "60"], [999, "Any"]], cookOpt.budget)}<span class="small muted">min</span></div>
    <div class="row">${seg("cdiet", [["any", "Any"], ["egg", "Veg + egg"], ["veg", "Veg"]], cookOpt.diet)}
      <span class="row" style="margin-left:auto"><span class="small muted">People</span><button class="btn sm" data-act="people" data-arg="-1" aria-label="Fewer people">−</button><b class="mono">${people()}</b><button class="btn sm" data-act="people" data-arg="1" aria-label="More people">+</button></span></div>
    ${lists.map(([name, picks]) => `${lists.length > 1 ? `<div class="lbl" style="margin-top:4px">${esc(name)}</div>` : ""}${picks.length ? `<div class="list">${picks.map((x, i) => pickRow(x, i === 0)).join("")}</div>` : `<p class="empty">Nothing fits. Allow more minutes or mark what you have below.</p>`}`).join("")}
    <div class="row"><button class="btn" data-act="cookshuffle">🔀 Shuffle</button><button class="btn ghost" data-act="shoplist">🛒 Copy shopping list</button></div></section>`;
  const p = proteinOn(ds), pt = cfg("proteinTarget"), eaten = eatenToday(ds);
  h += `<section class="card"><header><h2>Protein today</h2><span class="r mono">${Math.round(p)} / ${pt} g</span></header>${barHtml(p, pt, p >= pt * .9 ? "good" : "")}
    ${eaten.length ? `<div class="list">${eaten.map((e, i) => `<div class="li"><div class="grow"><div class="t1">${esc(e.t)}</div><div class="t2">${clockOf(e.at)} · ${Math.round(e.p)} g protein · ${Math.round(e.kcal)} kcal</div></div><button class="btn sm ghost" data-act="uneat" data-arg="${i}" aria-label="Remove ${esc(e.t)}">×</button></div>`).join("")}</div>` : `<p class="empty">Open a recipe and tap “Ate 1 serving”, or add a quick one.</p>`}
    <div class="chips">${D.extras.map(x => `<button data-act="eatx" data-arg="${esc(x.id)}">+ ${esc(x.t)} · ${Math.round(x.p)} g</button>`).join("")}</div></section>`;
  h += `<section class="card"><header><h2>Fresh today?</h2><span class="r small muted">tap: have ↔ low ↔ out</span></header>
    <div class="chips">${FRESH.filter(k => PANTRY[k]).map(k => `<button aria-pressed="${pstate(k) < 2}" data-act="pcycle" data-arg="${k}">${esc(PANTRY[k].l)}${pstate(k) === 1 ? " (low)" : ""}</button>`).join("")}</div>
    <details><summary>Whole pantry (${D.pantry.length})</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      <input type="text" data-input="pantryq" placeholder="Search the pantry" value="${esc(cookOpt.q)}" aria-label="Search the pantry">${pantryHtml()}</div></details></section>`;
  const weekCook = [0, 1, 2, 3, 4, 5, 6].reduce((a, dow) => a + rawWeek(dow).filter(b => b[2] === "cook").reduce((x, b) => x + toMin(b[1]) - toMin(b[0]), 0), 0);
  h += `<section class="card flat"><p class="small muted">Your week has <b>${hrs(weekCook)}</b> of cooking blocks; the old Kitchen default week had about 12 h.
    The full cookbook, including the Book 1 biryanis, is still at <a href="${esc(ME.links.kitchen)}" target="_blank" rel="noopener">Kitchen From Zero</a>.</p></section>`;
  return h + `</div>`;
}
function pickRow(x, top) {
  const r = x.r;
  return `<div class="li"><div class="grow"><div class="t1">${top ? "⭐ " : ""}${esc(r.title)}</div>
    <div class="t2">${r.min} min · ${Math.round(r.n.p)} g protein · ${Math.round(r.n.kcal)} kcal · ${esc(r.cuisine)}${x.miss.length ? ` · <span style="color:var(--warn)">need ${esc(x.miss.map(labelOf).join(", "))}</span>` : ""}</div></div>
    <button class="btn sm ${top ? "pri" : ""}" data-act="recipe" data-arg="${esc(r.id)}">Open</button></div>`;
}
function pantryHtml() {
  const q = (cookOpt.q || "").toLowerCase(), groups = {}, lab = ["Have", "Low", "Out"], col = ["var(--good)", "var(--warn)", "var(--muted)"];
  D.pantry.filter(p => !q || p.l.toLowerCase().includes(q)).forEach(p => (groups[p.g] = groups[p.g] || []).push(p));
  const keys = Object.keys(groups);
  if (!keys.length) return `<p class="empty">Nothing matches “${esc(cookOpt.q)}”.</p>`;
  return keys.map(g => `<details ${q ? "open" : ""}><summary>${esc(g)} <span class="muted small">${groups[g].filter(p => pstate(p.k) < 2).length}/${groups[g].length}</span></summary><div class="list">${groups[g].map(p => {
    const s = pstate(p.k);
    return `<div class="li" style="padding:6px 0"><div class="grow">${esc(p.l)}</div><button class="btn sm" data-act="pcycle" data-arg="${p.k}" style="min-width:64px;justify-content:center;color:${col[s]}">${lab[s]}</button></div>`;
  }).join("")}</div></details>`).join("");
}

/* ------------------------------------------------------------------ recipe sheet, eating, shopping */
function recipeSheet(id) {
  const r = RBYID[id]; if (!r) return;
  const f = people(), miss = missingOf(r), d = new Date(), k = dayKind(d), ck = "long_cook:" + today() + r.id;
  if (r.min > 45 && k !== "weekend" && k !== "travel" && !S.roast.last[ck]) {
    closeLayer();
    roast("long_cook", { mins: r.min, day: DAYS_LONG[d.getDay()] }, { once: today() + r.id, force: true, cta: ["Show it anyway", "recipe", r.id] });
    return;
  }
  openSheet(r.title, `<p class="muted">${esc(r.sub)}</p>
    <div class="row"><span class="pill">${r.min} min</span><span class="pill p">${Math.round(r.n.p)} g protein / serving</span><span class="pill">${esc(r.uses)}</span><span class="pill">${esc(r.diet)}</span></div>
    <div class="row"><span class="small muted">Cooking for</span><button class="btn sm" data-act="people" data-arg="-1" aria-label="Fewer">−</button><b class="mono">${f}</b><button class="btn sm" data-act="people" data-arg="1" aria-label="More">+</button><span class="small muted">· ${esc(r.serving)} each</span></div>
    ${miss.length ? `<div class="note"><b>Missing:</b> ${miss.map(n => { const k = n.split("|")[0]; return `${esc(labelOf(n))} (<a href="${esc(appUrl(k))}" target="_blank" rel="noopener">order</a> · <button class="linkish" data-act="pcycle" data-arg="${esc(k)}">mark have</button>)`; }).join(", ")}</div>` : ""}
    <div><h3>Ingredients${f > 1 ? " for " + f : ""}</h3>${r.ing.map(g => `${g.g ? `<div class="lbl" style="margin-top:8px">${esc(g.g)}</div>` : ""}<div class="list">${g.i.map(([n, q, note]) => `<div class="li" style="padding:5px 0"><div class="grow">${esc(n)}${note ? ` <span class="muted small">· ${esc(note)}</span>` : ""}</div><span class="mono small">${esc(scaleQ(q, f))}</span></div>`).join("")}</div>`).join("")}</div>
    <div><h3>Method</h3><ol style="padding-left:20px;margin:6px 0 0;display:flex;flex-direction:column;gap:6px">${r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>
    ${r.tips.map(([t, x]) => `<div class="note"><b>${esc(t)}.</b> ${esc(x)}</div>`).join("")}
    ${r.serve ? `<p class="small"><b>Serve:</b> ${esc(r.serve)}</p>` : ""}
    <p class="small muted">Per serving: ${Math.round(r.n.kcal)} kcal · protein ${r.n.p} g · carbs ${r.n.c} g · fat ${r.n.f} g · fibre ${r.n.fib} g. ${esc(r.keeps)}. Source: ${esc(r.src)}. Approximate figures.</p>
    <div class="row"><button class="btn good" data-act="eat" data-arg="${esc(r.id)}">🍽️ Ate 1 serving</button><button class="btn" data-act="cooked" data-arg="${esc(r.id)}">Cooked it</button></div>`, { noFocus: true });
}
function eat(id, extraId) {
  const ds = today(); S.eaten[ds] = S.eaten[ds] || [];
  if (extraId) { const x = D.extras.find(e => e.id === extraId); if (!x) return; S.eaten[ds].push({ id: x.id, t: x.t, p: x.p, kcal: x.kcal, at: Date.now() }); }
  else { const r = RBYID[id]; if (!r) return; S.eaten[ds].push({ id: r.id, t: r.title, p: r.n.p, kcal: r.n.kcal, at: Date.now() }); S.cooked[r.id] = Date.now(); closeLayer(); }
  save(); toast("Logged: " + Math.round(proteinOn(ds)) + " / " + cfg("proteinTarget") + " g protein today."); render();
}
function shopText() {
  const need = new Map();
  for (const slot of ["Breakfast", "Lunch box", "Dinner"]) for (const x of cookPicks({ slot, limit: 2 })) for (const n of x.miss) need.set(n.split("|")[0], x.r.title);
  const low = D.pantry.filter(p => pstate(p.k) === 1).map(p => p.l);
  const staplesOut = D.pantry.filter(p => p.d === 0 && pstate(p.k) === 2).map(p => p.l);
  const lines = ["Shopping list · " + today()];
  if (need.size) lines.push("", "For today's picks:", ...Array.from(need).map(([k, t]) => "- " + labelOf(k) + " (" + t + ")"));
  if (low.length) lines.push("", "Running low:", ...low.map(x => "- " + x));
  if (staplesOut.length) lines.push("", "Staples out:", ...staplesOut.map(x => "- " + x));
  if (lines.length === 1) lines.push("", "Nothing needed. Pantry's in order.");
  return lines.join("\n");
}
