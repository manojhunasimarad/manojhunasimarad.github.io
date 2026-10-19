"use strict";

const TOKEN = document.querySelector('meta[name="token"]').content;
const WEB = !!window.LFZ_WEB;     // the browser version: Python runs in this tab, not in a server on this computer
const view = document.getElementById("view");
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };

async function api(path, body) {
  const opt = { headers: { "X-Token": TOKEN } };
  if (body !== undefined) {
    opt.method = "POST";
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  let res;
  try { res = await fetch(path, opt); }
  catch (e) { throw new Error(WEB ? "Python stopped in this tab. Reload the page." : "The app's server is not running. Start it again with: python server.py"); }
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || "Request failed (" + res.status + ").");
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer = 0;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

function typeset(el) {
  const nodes = $$(".tex", el);
  if (!nodes.length) return;
  const go = () => { if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise(nodes).catch(() => {}); };
  if (window.MathJax && MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(go);
  else window.addEventListener("load", () => { if (window.MathJax && MathJax.startup) MathJax.startup.promise.then(go); }, { once: true });
}

const chip = d => d ? `<span class="chip ${esc(d)}">${esc(d)}</span>` : "";
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
function meter(name, done, total, label) {
  return `<div class="meter"><div class="top"><span class="name">${esc(name)}</span><span class="num">${label || done + " / " + total}</span></div>`
    + `<div class="track"><i style="width:${pct(done, total)}%"></i></div></div>`;
}

/* ------------------------------------------------------------------ router */

let leaveHook = null;
let routeId = 0;      // increases on every navigation, so a slow page cannot draw over a newer one
let session = null;   // the quiz in progress

const ROUTES = [
  [/^\/?$/, home, "home"],
  [/^\/learn$/, learn, "learn"],
  [/^\/lesson\/([\w-]+)$/, lesson, "learn"],
  [/^\/practice\/(\w+)$/, practice, "practice"],
  [/^\/ex\/([\w-]+)$/, exercise, "practice"],
  [/^\/quiz$/, quiz, "quiz"],
  [/^\/quiz\/run$/, quizRun, "quiz"],
  [/^\/certs$/, certs, "certs"],
  [/^\/lists\/(\w+)$/, lists, "lists"],
  [/^\/map$/, map, "map"],
  [/^\/skill\/([\w-]+)$/, skill, "map"],
  [/^\/roles$/, roles, "map"],
  [/^\/review\/([\w-]+)$/, review, "practice"],
  [/^\/focus$/, focusPage, "home"],
  [/^\/recall(?:\?(.*))?$/, recall, "recall"],
  [/^\/read(?:\?(.*))?$/, read, "read"],
  [/^\/paper\/([0-9a-f]+)$/, paper, "read"],
  [/^\/ask$/, ask, "read"],
  [/^\/settings$/, settings, "settings"]
];

async function route() {
  if (leaveHook) { try { leaveHook(); } catch (e) {} leaveHook = null; }
  if (activeAgent) { activeAgent.abort(); activeAgent = null; }   // leaving a page stops the model writing for it
  const path = (location.hash || "#/").slice(1) || "/";
  let match = null;
  for (const r of ROUTES) {
    const m = path.match(r[0]);
    if (m) { match = [r, m]; break; }
  }
  if (!match) { location.hash = "#/"; return; }
  const [r, m] = match;
  $$("#nav a").forEach(a => { if (a.dataset.nav === r[2]) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const here = $('#nav a[aria-current="page"]'), strip = $("#nav");
  if (here && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, here.offsetLeft - strip.offsetLeft - (strip.clientWidth - here.offsetWidth) / 2);   // keep it in sight on a narrow window
  view.className = "";
  const my = ++routeId;
  try {
    await r[1].apply(null, m.slice(1));
  } catch (e) {
    if (my !== routeId) return;
    view.innerHTML = `<div class="banner bad"><strong>Something went wrong.</strong> ${esc(e.message)}</div>`
      + (e.status === 403 ? `<p><button class="btn primary" id="reload">Reload the page</button></p>` : "");
    const b = $("#reload");
    if (b) b.addEventListener("click", () => location.reload());
  }
  if (my === routeId) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ------------------------------------------------------------------ today */

function card(kicker, title, text, action, done) {
  return `<div class="card${done ? " done" : ""}"><span class="k">${esc(kicker)}${done ? ` <span class="chip ok">done today</span>` : ""}</span><span class="t">${esc(title)}</span>`
    + (text ? `<span class="muted small">${esc(text)}</span>` : "")
    + (action ? `<a class="btn${action[2] ? " primary" : ""}" href="${esc(action[1])}"${action[3] ? ` data-act="${esc(action[3])}"` : ""}>${esc(action[0])}</a>` : "") + `</div>`;
}

const dayName = ord => new Date((ord - 719163) * 86400000).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

function heatHtml(d) {
  const first = ((d.weekday - 83) % 7 + 7) % 7;   // weekday of the oldest day shown, Monday = 0
  let cells = "";
  for (let i = 0; i < first; i++) cells += `<i class="pad"></i>`;
  let active = 0;
  d.heat.forEach(([ord, n]) => {
    if (n) active++;
    const lv = n === 0 ? 0 : n < 3 ? 1 : n < 8 ? 2 : n < 16 ? 3 : 4;
    cells += `<i class="l${lv}${ord === d.today ? " now" : ""}" title="${dayName(ord)}: ${n === 0 ? "nothing" : n === 1 ? "1 thing done" : n + " things done"}"></i>`;
  });
  return `<div class="heat-box"><div class="heat" role="img" aria-label="Activity over the last twelve weeks: active on ${active} of 84 days">${cells}</div>`
    + `<span class="muted small">Twelve weeks, oldest on the left. Active on ${active} of 84 days.</span></div>`;
}

async function home() {
  const ticket = routeId;
  const d = await api("/api/home");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const set = id => d.sets.find(s => s.id === id);
  const py = set("python"), dsa = set("dsa"), ml = set("ml");
  const done = new Set(d.done_today);
  const count = s => s.solved + " of " + s.total + " solved.";
  const cards = [];
  const lead = d.recall.due ? "recall" : d.reviews.length ? "review" : "lesson";      // the one card with the filled button
  if (d.recall.due) cards.push(card("Recall", d.recall.due + (d.recall.due === 1 ? " thing" : " things") + " from earlier",
    "Write what you remember, then compare. About " + d.recall.due * 2 + " minutes. Do this before anything new.", ["Start", "#/recall", true]));
  else if (done.has("recall")) cards.push(card("Recall", "Done for today", d.recall.waiting ? d.recall.waiting + " more will keep until tomorrow." : "The next ones appear when they are due.", null, true));
  d.reviews.forEach(r => cards.push(card("Rewrite from memory", r.title,
    (r.clean ? "You solved this a while ago." : "You solved this with help.") + " Blank page, no hints. " + (r.passes ? "Rewrite " + (r.passes + 1) + " of 3." : "First rewrite of 3."),
    ["Rewrite", "#/review/" + r.id, lead === "review"])));
  if (!d.reviews.length && done.has("review")) cards.push(card("Rewrite from memory", "Done for today", "The next ones appear when they are due.", null, true));
  cards.push(d.lessons.next
    ? card("Lesson", d.lessons.next_title, "Read it, then do its exercises.", ["Read", "#/lesson/" + d.lessons.next, lead === "lesson"], done.has("lesson"))
    : card("Lesson", "Every lesson is read", "Later stages get their lessons when you reach them.", ["See the stages", "#/learn"]));
  if (d.rec.python) cards.push(card("Python exercise", d.rec.python.title, d.rec.python.why + " " + count(py), ["Solve", "#/ex/" + d.rec.python.id, lead === "lesson"], done.has("python")));
  cards.push(d.rec.dsa
    ? card("DSA pattern", d.rec.dsa.title, d.rec.dsa.why + " " + count(dsa), ["Solve", "#/ex/" + d.rec.dsa.id], done.has("dsa"))
    : card("DSA pattern", "All solved", "Carry on with the A2Z sheet under Lists.", ["Open the sheet", "#/lists/dsa"]));
  cards.push(!d.ml_installed
    ? card("ML problem", "Not downloaded yet", "164 problems, about 8 MB, downloaded once.", ["Set up", "#/practice/ml"])
    : d.rec.ml
      ? card("ML problem", d.rec.ml.title, d.rec.ml.why + " " + count(ml), ["Solve", "#/ex/" + d.rec.ml.id], done.has("ml"))
      : card("ML problem", "The planned problems are solved", "", ["Browse", "#/practice/ml"]));
  const core = ["sys", "num"].map(set).filter(s => s && d.rec[s.id]).sort((a, b) => a.solved / a.total - b.solved / b.total)[0];
  if (core) cards.push(card(core.title, d.rec[core.id].title, d.rec[core.id].why + " " + count(core), ["Solve", "#/ex/" + d.rec[core.id].id], done.has(core.id)));
  if (d.reading.next) cards.push(card("Paper", d.reading.next.title, ["Not started. Pass 1 takes ten minutes.", "Pass 1 is done. Pass 2 is the full read.", "Pass 2 is done. Pass 3: could you reproduce a result?"][d.reading.next.stage] || "",
    ["Read", "#/paper/" + d.reading.next.id]));
  cards.push(card("Quiz", "Ten questions", d.quiz.missed ? d.quiz.missed + " missed questions are waiting for another try." : "New questions first.",
    ["Start", "#/quiz", false, "quiz10"], done.has("quiz")));
  if (!d.recall.cards) cards.push(card("Recall", "Nothing to recall yet", "Tick a video or a paper under Lists and write two lines from memory. It comes back here tomorrow.", ["How it works", "#/recall"]));

  const lists = d.lists;
  const waiting = d.reviews_waiting - d.reviews.length;
  view.innerHTML = `
    ${d.news ? `<div class="banner" id="news"><div class="stack"><strong>Updated to version ${esc(d.version)}. What is new:</strong>
      ${d.news.map(e => (d.news.length > 1 ? `<span class="num">Version ${esc(e.version)}</span>` : "") + `<ul class="prose">${e.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ul>`).join("")}
      <div><button class="btn" id="news-ok">Got it</button></div></div></div>` : ""}
    <div class="stack"><h1>Today</h1>
      <p class="lede">${d.active_today ? "You have worked today." : "Nothing done yet today."} Streak: ${d.streak} ${d.streak === 1 ? "day" : "days"}${d.best_streak > d.streak ? ", longest " + d.best_streak : ""}. The cards below are chosen from what you did last: solve one without help and the next is harder.</p>
      ${heatHtml(d)}</div>
    <section class="panel"><div class="body focus-strip">
      <div class="stack grow">
        ${meter("Focus today", Math.min(Math.round(d.focus.secs / 60), d.focus.goal), d.focus.goal, Math.round(d.focus.secs / 60) + " of " + d.focus.goal + " min")}
        ${d.focus.note ? `<p class="small"><span class="muted">${d.focus.note.today ? "You left yourself a note earlier today:" : "You left yourself a note last time:"}</span> ${esc(d.focus.note.note)}</p>` : ""}
        ${d.focus.plan ? `<p class="small"><span class="muted">Your plan:</span> ${esc(d.focus.plan)}</p>` : ""}
      </div>
      <div class="row-flex"><button class="btn primary" id="focus-go">Start a focus session</button><a class="btn quiet" href="#/focus">Techniques</a></div>
    </div></section>
    <div class="today">${cards.join("")}</div>
    ${waiting > 0 ? `<p class="muted small">${waiting} more ${waiting === 1 ? "rewrite is" : "rewrites are"} waiting. Two a day is enough; the rest keep.</p>` : ""}
    <div class="stack"><div class="row-flex spread"><h2>Progress</h2><a href="#/map">Skill map</a></div>
      <div class="meters">
        ${meter("Skills strong", d.skills.strong, d.skills.total)}
        ${meter("Lessons", d.lessons.read, d.lessons.total)}
        ${meter("Python", py.solved, py.total)}
        ${meter("DSA patterns", dsa.solved, dsa.total)}
        ${d.ml_installed ? meter("ML coding", ml.solved, ml.total) : meter("ML coding", 0, 1, "not downloaded")}
        ${["sys", "num"].map(set).filter(Boolean).map(s => meter(s.title, s.solved, s.total)).join("")}
        ${meter("Quiz", d.quiz.right, d.quiz.total, d.quiz.right + " right of " + d.quiz.total)}
        ${meter("Build list", lists.build.done, lists.build.total)}
        ${meter("Papers", lists.papers.done, lists.papers.total)}
        ${meter("Replays", lists.replays.done, lists.replays.total)}
        ${meter("A2Z sheet", lists.dsa.done, lists.dsa.total)}
      </div></div>
    <details class="box"><summary>How this app teaches</summary><div class="prose">
      <p>It borrows one habit from each of four well-known ways of teaching this material.</p>
      <ul>
        <li><strong>Build it from scratch</strong>, as in Andrej Karpathy's Zero to Hero: every exercise is a piece of a working model, and you write each piece.</li>
        <li><strong>Intuition, then the detail, then a graded check</strong>, as in Andrew Ng's courses: each lesson explains first and tests straight after.</li>
        <li><strong>A weekly assignment and a timed paper</strong>, as in NPTEL: the quiz bank gives short practice sets and full mock exams against the clock.</li>
        <li><strong>Implementation assignments and reading papers</strong>, as in Stanford's CS229 and CS336: the Papers list has you rebuild a result, not only read about it.</li>
      </ul>
      <p>Hints open one at a time, and a solution opens only after you have run an attempt of your own.</p>
      <p>The app also watches how you solve things. An exercise solved with no hints counts in full and leads to a harder one. One solved with hints or with the solution open counts for less and leads to another at the same level. A day later, a week later and a month later it asks you to write the solution again on a blank page, because being able to do that is what knowing it means.</p>
      <p>The same goes for what you watch and read. A tick only says you saw it, so the app asks for a few lines from memory and brings them back under <a href="#/recall">Recall</a> after a day, a week and a month.</p>
    </div></details>
    <p class="muted small">Version ${esc(d.version)}. <a href="#/settings">What changed</a></p>`;
  const qb = $('[data-act="quiz10"]');
  if (qb) qb.addEventListener("click", e => { e.preventDefault(); startQuiz({ scope: "all", n: 10, mode: "practice" }); });
  $("#focus-go").addEventListener("click", () => { location.hash = "#/focus"; });
  const nb = $("#news-ok");
  if (nb) nb.addEventListener("click", async () => { await api("/api/settings", { k: "seen_version" }); $("#news").remove(); });
}

/* ------------------------------------------------------------------ learn */

async function learn() {
  const ticket = routeId;
  const d = await api("/api/learn");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  let h = `<div class="stack"><h1>Learn</h1><p class="lede">Read a lesson, then write the functions it leads to. A lesson is finished when its exercises pass, not when you have read it.</p></div>`;
  d.courses.forEach(c => {
    h += `<section class="panel"><div class="head"><h2>${esc(c.title)}</h2><span class="muted small">${esc(c.when || "")}</span></div>`;
    if (c.soon) {
      h += `<div class="body muted">The lessons for this stage are written when you reach it. Its checklist is already under <a href="#/lists/build">Lists</a>.</div>`;
    } else {
      h += (c.blurb ? `<div class="body muted">${esc(c.blurb)}</div>` : "") + `<ul class="rows">`;
      c.lessons.forEach((l, i) => {
        h += `<li><span class="dot ${l.read ? "solved" : ""}" title="${l.read ? "read" : "not read"}"></span><span class="num">${String(i + 1).padStart(2, "0")}</span>`
          + `<a class="main" href="#/lesson/${esc(l.id)}">${esc(l.title)}</a>`
          + `<span class="num">${l.minutes} min</span><span class="num">${l.ex_solved}/${l.ex_total} exercises</span></li>`;
      });
      h += `</ul>`;
    }
    h += `</section>`;
  });
  view.innerHTML = h;
}

async function lesson(id) {
  const ticket = routeId;
  const d = await api("/api/lesson?id=" + encodeURIComponent(id));
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const exs = d.exercises.map(e => `<li><span class="dot ${esc(e.status)}"></span><a class="main" href="#/ex/${esc(e.id)}">${esc(e.title)}</a><span class="num">${e.status === "solved" ? "solved" : e.status === "open" ? "started" : "to do"}</span></li>`).join("");
  view.innerHTML = `
    <div class="row-flex"><a class="btn quiet" href="#/learn">Back to Learn</a><span class="num">${d.minutes} min read</span></div>
    <h1>${esc(d.title)}</h1>
    <article class="prose" id="lesson-body">${d.html}</article>
    ${exs ? `<section class="panel"><div class="head"><h2>Now write these</h2></div><ul class="rows">${exs}</ul></section>` : ""}
    <div class="row-flex">
      <button class="btn${d.read ? "" : " primary"}" id="mark">${d.read ? "Mark as unread" : "Mark as read"}</button>
      ${d.prev ? `<a class="btn" href="#/lesson/${esc(d.prev)}">Previous lesson</a>` : ""}
      ${d.next ? `<a class="btn" href="#/lesson/${esc(d.next)}">Next lesson</a>` : ""}
    </div>
    <div id="lesson-recall"></div>`;
  typeset(view);
  $("#mark").addEventListener("click", async () => {
    await api("/api/lesson/read", { id: d.id, on: !d.read });
    if (!d.read && d.ask && !d.recall) lessonAsk = d.id;
    route();
  });
  const box = $("#lesson-recall");
  const drawRecall = open => {
    if (d.recall) { box.innerHTML = `<p class="muted small">${recallLine(d.recall.when)}</p>`; return; }
    if (!d.read) { box.innerHTML = ""; return; }
    if (!open) {
      box.innerHTML = `<button class="btn quiet" id="lr-open">Write what you kept from this lesson</button>`;
      $("#lr-open").addEventListener("click", () => drawRecall(true));
      return;
    }
    recallBox(box, d.ask_text, async note => {
      const r = await api("/api/recall/add", { kind: "lesson", ref: d.id, note });
      d.recall = { id: r.id, when: r.when };
      drawRecall(false);
      toast("Saved. It comes back tomorrow, under Recall.");
    }, () => drawRecall(false));
    box.scrollIntoView({ block: "center" });
  };
  drawRecall(lessonAsk === d.id);
  lessonAsk = null;
}

/* ------------------------------------------------------------------ practice */

async function practice(sid) {
  const ticket = routeId;
  const [sets, d] = await Promise.all([api("/api/sets"), api("/api/exercises?set=" + encodeURIComponent(sid))]);
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const tabs = sets.sets.map(s => `<a href="#/practice/${esc(s.id)}"${s.id === sid ? ' aria-current="page"' : ""}>${esc(s.title)}${s.total ? ` <span class="num">${s.solved}/${s.total}</span>` : ""}</a>`).join("");
  const me = sets.sets.find(s => s.id === sid);
  let h = `<div class="stack"><h1>Practice</h1><p class="lede">${esc(me.blurb)}</p></div><div class="tabs">${tabs}</div>`;
  if (d.rec && !(sid === "ml" && !d.ml_installed)) h += nextHtml(d.rec, "Suggested next");
  if (sid === "ml" && !d.ml_installed) {
    h += `<section class="panel"><div class="body stack">
      ${WEB ? `<p><strong>Download the ML problems once.</strong> This fetches the open deep-ml problem set (164 problems, about 6 MB) from GitHub into this browser. It needs a connection; after that the problems work offline.</p>
      <p class="muted small">The set is licensed for educational use only. NumPy loads by itself the first time you run a problem.</p>`
      : `<p><strong>Download the ML problems once.</strong> This fetches the open deep-ml problem set (164 problems, about 8 MB) from GitHub into the <code>ml_practice/problems</code> folder. It needs an internet connection and git. After that, everything here works offline.</p>
      <p class="muted small">The set is licensed for educational use only. Most problems need NumPy: <code>pip install numpy</code>.</p>`}
      <div class="row-flex"><button class="btn primary" id="install">Download now</button><span class="muted" id="install-msg"></span></div>
    </div></section>`;
    view.innerHTML = h;
    $("#install").addEventListener("click", async () => {
      const b = $("#install"), msg = $("#install-msg");
      b.disabled = true; msg.textContent = "Downloading. This can take a minute.";
      try { const r = await api("/api/ml/install", {}); toast(r.message); route(); }
      catch (e) { msg.textContent = e.message; b.disabled = false; }
    });
    return;
  }
  const hide = lsGet("lfz.hideSolved", false);
  h += `<div class="row-flex spread"><label class="toggle"><input type="checkbox" id="hide"${hide ? " checked" : ""}> Hide solved</label><a href="#/map">See these as a skill map</a></div><section class="panel" id="list">`;
  let unit = null, open = false;
  d.rows.forEach(r => {
    if (r.unit !== unit) {
      if (open) h += `</ul>`;
      h += `<div class="unit">${sid !== "python" && sid !== "ml" && r.skill ? `<a href="#/skill/${esc(r.skill)}">${esc(r.unit)}</a>` : esc(r.unit)}</div><ul class="rows">`;
      unit = r.unit; open = true;
    }
    h += `<li data-status="${esc(r.status)}"><span class="dot ${esc(r.status)}"></span><a class="main" href="#/ex/${esc(r.id)}">${esc(r.title)}</a>`
      + (r.n ? `<span class="num">#${r.n}</span>` : "") + chip(r.difficulty) + `</li>`;
  });
  if (open) h += `</ul>`;
  h += `</section>`;
  view.innerHTML = h;
  const apply = () => {
    const on = $("#hide").checked;
    $$("#list li").forEach(li => { li.hidden = on && li.dataset.status === "solved"; });
    $$("#list .unit").forEach(u => { u.hidden = u.nextElementSibling && $$("li:not([hidden])", u.nextElementSibling).length === 0; });
  };
  $("#hide").addEventListener("change", () => { lsSet("lfz.hideSolved", $("#hide").checked); apply(); });
  apply();
}

function nextHtml(rec, label) {
  return `<div class="banner next"><span class="k">${esc(label)}</span><a class="t" href="#/ex/${esc(rec.id)}">${esc(rec.title)}</a>`
    + `<span class="muted">${esc(rec.why)}</span></div>`;
}

/* The code editor: Tab indents, Enter keeps the indent, Ctrl+Enter runs, and the text is kept as a draft. */
function setupEditor(ed, draftKey, run) {
  let escaped = false;
  const insert = text => { ed.setRangeText(text, ed.selectionStart, ed.selectionEnd, "end"); ed.dispatchEvent(new Event("input")); };
  ed.addEventListener("input", () => lsSet(draftKey, ed.value));
  ed.addEventListener("keydown", e => {
    if (e.key === "Escape") { escaped = true; return; }
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (escaped) { escaped = false; return; }
      e.preventDefault();
      if (e.shiftKey) {
        const start = ed.value.lastIndexOf("\n", ed.selectionStart - 1) + 1;
        const m = ed.value.slice(start).match(/^ {1,4}/);
        if (m) { const pos = ed.selectionStart; ed.setRangeText("", start, start + m[0].length, "preserve"); ed.selectionStart = ed.selectionEnd = Math.max(start, pos - m[0].length); ed.dispatchEvent(new Event("input")); }
      } else insert("    ");
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); run();
    } else if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const before = ed.value.slice(0, ed.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      let indent = line.match(/^[ \t]*/)[0];
      if (/:\s*$/.test(line)) indent += "    ";
      insert("\n" + indent);
    }
    escaped = false;
  });
}

function resultHtml(r) {
  let h = `<div class="result ${r.ok ? "pass" : "fail"}"><span class="verdict">${r.ok ? "PASS" : "FAIL"} &middot; test ${r.n}</span>`;
  if (!r.ok) {
    h += `<dl class="kv"><dt>ran</dt><dd><pre>${esc(r.ran)}</pre></dd><dt>expected</dt><dd><pre>${esc(r.expected)}</pre></dd>`
      + `<dt>got</dt><dd><pre>${esc(r.got || "(nothing printed)")}</pre></dd>`
      + (r.error ? `<dt>error</dt><dd><pre>${esc(r.error)}</pre></dd>` : "") + `</dl>`;
    if (r.shape) h += `<p class="small muted">Your values match, but the nesting of brackets differs from the expected text.</p>`;
    if (r.got.trim() === "None") h += `<p class="small muted">The function returned None. Did you forget <code>return</code>?</p>`;
  }
  return h + `</div>`;
}

async function exercise(id) {
  const ticket = routeId;
  const d = await api("/api/exercise?id=" + encodeURIComponent(id));
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  view.className = "wide";
  const draftKey = "lfz.draft." + d.id;
  const draft = lsGet(draftKey, null);
  const code = draft != null && draft !== d.code ? draft : d.code;
  const setName = { python: "Python", dsa: "DSA patterns", ml: "ML coding", sys: "Parallel and GPU", num: "Numerical" }[d.set] || d.set;
  const hintWord = d.hint_label || "Hint";
  view.innerHTML = `
    <div class="row-flex"><a class="btn quiet" href="#/practice/${esc(d.set)}">${esc(setName)}</a>${d.skill ? `<a href="#/skill/${esc(d.skill.id)}">${esc(d.skill.name)}</a>${d.skill.step ? `<span class="num">step ${d.skill.step} of 3</span>` : ""}` : `<span class="muted">${esc(d.unit)}</span>`}</div>
    <div class="row-flex"><h1>${esc(d.title)}</h1>${d.n ? `<span class="num">#${d.n}</span>` : ""}${chip(d.difficulty)}<span class="chip ok" id="solved-chip"${d.solved ? "" : " hidden"}>solved</span></div>
    <p class="small" id="review-line"${d.review ? "" : " hidden"}></p>
    <div class="split">
      <div class="stack">
        <article class="prose" id="statement">${d.statement}</article>
        ${d.given ? `<details class="box" open><summary>Already defined for you</summary><div class="stack"><p class="small muted">This code runs before yours on every test. Read it, use its names, and do not paste it into the editor.</p><pre>${esc(d.given)}</pre></div></details>` : ""}
        ${d.sample.length ? `<details class="box"><summary>What a test looks like</summary><div class="stack"><p class="small muted">Each test runs your code, then this, and compares what is printed. There ${d.tests === 1 ? "is 1 test" : "are " + d.tests + " tests"}.</p><pre>${esc(d.sample[0].ran)}</pre><p class="small muted">expected output</p><pre>${esc(d.sample[0].expected)}</pre></div></details>` : ""}
        ${d.lesson ? `<p class="small">Lesson: <a href="#/lesson/${esc(d.lesson.id)}">${esc(d.lesson.title)}</a></p>` : ""}
        ${d.link ? `<p class="small"><a href="${esc(d.link)}" target="_blank" rel="noopener">Open this problem on deep-ml</a> (needs internet)</p>` : ""}
        <section class="stack" id="hints-box"${d.hints_total ? "" : " hidden"}>
          <h3>${esc(hintWord)}${d.hints_total > 1 ? "s" : ""}</h3>
          <div class="stack" id="hints"></div>
          <div><button class="btn" id="hint-btn"></button></div>
        </section>
        ${d.agent ? `<section class="stack" id="nudge-box">
          <div class="row-flex"><button class="btn" id="nudge-btn">Ask your agent for a nudge</button><span class="muted small" id="nudge-note"></span></div>
          <div id="nudge-out"></div>
        </section>` : ""}
        <section class="stack" id="sol-box"${d.has_solution ? "" : " hidden"}>
          <h3>Solution</h3>
          <div class="stack" id="sol"></div>
          <div class="row-flex"><button class="btn" id="sol-btn">Show the solution</button><span class="muted small" id="sol-note"></span></div>
        </section>
        <div class="banner good" id="explain"${d.explanation ? "" : " hidden"}><div class="prose">${d.explanation || ""}</div></div>
      </div>
      <div class="stack sticky">
        <textarea class="editor" id="code" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Your solution"></textarea>
        <div class="row-flex">
          <button class="btn primary" id="run">Run tests</button>
          <button class="btn" id="reset">Reset</button>
          <span class="muted small">Ctrl+Enter runs. Tab indents; press Esc, then Tab, to leave the editor.</span>
        </div>
        <p class="muted small">${WEB ? "Saved in this browser each time you run." : `Saved to <code>${esc(d.file)}</code> each time you run, so you can also edit it in your own editor and reload this page.`}${draft != null && draft !== d.code ? " An unsaved draft from this browser was restored." : ""}</p>
        <div class="stack" id="results"></div>
        ${d.set === "ml" ? `<div><button class="btn quiet" id="mark-solved">${d.solved ? "Clear the solved mark" : "Mark as solved by hand"}</button></div>` : ""}
      </div>
    </div>
    <div class="row-flex">
      ${d.prev ? `<a class="btn" href="#/ex/${esc(d.prev)}">Previous</a>` : ""}
      ${d.next ? `<a class="btn" href="#/ex/${esc(d.next)}" id="next-ex">Next exercise</a>` : ""}
    </div>`;
  typeset(view);

  const ed = $("#code");
  ed.value = code;
  setupEditor(ed, draftKey, () => run());
  const reviewLine = rv => {
    if (!rv) return;
    const el = $("#review-line");
    el.hidden = false;
    el.innerHTML = rv.done ? `Rewritten from memory ${rv.passes} of ${rv.of} times. This one is yours.`
      : `Rewrites from memory: ${rv.passes} of ${rv.of}. Next one ${esc(rv.when)}.` + (rv.due ? ` <a href="#/review/${esc(d.id)}">Rewrite it now</a>` : "");
  };
  reviewLine(d.review);

  /* hints */
  let hints = d.hints.slice();
  const drawHints = () => {
    $("#hints").innerHTML = hints.map((t, i) => `<div class="banner">${d.hints_total > 1 ? `<span class="num">${esc(hintWord)} ${i + 1}</span>` : ""}<div class="prose">${t}</div></div>`).join("");
    typeset($("#hints"));
    const b = $("#hint-btn");
    if (hints.length >= d.hints_total) b.hidden = true;
    else b.textContent = d.hints_total > 1 ? "Show hint " + (hints.length + 1) + " of " + d.hints_total : "Show the " + hintWord.toLowerCase();
  };
  drawHints();
  $("#hint-btn").addEventListener("click", async () => {
    const r = await api("/api/hint", { id: d.id });
    if (ticket !== routeId) return;
    hints = r.hints; drawHints();
  });

  /* solution */
  let unlocked = d.solution_unlocked;
  let nudges = d.nudges || 0;
  const drawLock = () => {
    $("#sol-btn").disabled = !unlocked;
    $("#sol-note").textContent = unlocked ? "" : "Unlocks after you run an attempt of your own.";
    const nb = $("#nudge-btn");
    if (nb) {
      nb.disabled = !unlocked;
      $("#nudge-note").textContent = !unlocked ? "Unlocks after you run an attempt of your own."
        : "It looks at your code and asks one question. It does not write code. Each nudge counts as a hint" + (nudges ? " (" + nudges + " so far)." : ".");
    }
  };
  drawLock();
  const nudgeBtn = $("#nudge-btn");
  if (nudgeBtn) nudgeBtn.addEventListener("click", () => {
    nudgeBtn.disabled = true;
    agentRun("/api/agent/nudge", { id: d.id, code: ed.value }, $("#nudge-out"), final => {
      if (ticket !== routeId) return;
      if (final && final.nudges) nudges = final.nudges;
      drawLock();
    });
  });
  $("#sol-btn").addEventListener("click", async () => {
    try {
      const r = await api("/api/solution?id=" + encodeURIComponent(d.id));
      if (ticket !== routeId) return;
      $("#sol").innerHTML = `<pre>${esc(r.solution)}</pre>` + (r.explanation ? `<div class="prose">${r.explanation}</div>` : "");
      $("#sol-btn").hidden = true;
      typeset($("#sol"));
    } catch (e) { toast(e.message); }
  });

  /* run */
  let busy = false;
  async function run() {
    if (busy) return;
    busy = true;
    const b = $("#run");
    b.disabled = true; b.textContent = "Running";
    try {
      const r = await api("/api/run", { id: d.id, code: ed.value });
      if (ticket !== routeId) return;
      lsDel(draftKey);
      let head;
      if (r.solved) {
        const how = r.how ? (r.how.clean ? " Solved without help." : r.how.help ? " Solved with " + esc(r.how.help) + "." : "")
          + (r.how.review ? " The app will ask you to rewrite it from memory, " + esc(r.how.review) + "." : "") : "";
        head = `<div class="banner good"><strong>${r.total === 1 ? "The test passes." : "All " + r.total + " tests pass."}</strong>${how}</div>`
          + (r.next ? nextHtml(r.next, "Next") : d.next ? `<div class="banner next"><span class="k">Next</span><a class="t" href="#/ex/${esc(d.next)}">Next exercise in the list</a></div>` : "")
          + (r.harder ? `<p class="small">A harder version of this idea, in another section: <a href="#/ex/${esc(r.harder.id)}">${esc(r.harder.title)}</a></p>` : "");
      } else {
        head = `<div class="banner bad"><strong>${r.total === 1 ? "The test does not pass yet." : r.passed + " of " + r.total + " tests pass."}</strong></div>`
          + (r.next ? nextHtml(r.next, r.next.id === d.id ? "A suggestion" : "A step back") : "");
      }
      $("#results").innerHTML = head + r.results.map(resultHtml).join("");
      unlocked = r.solution_unlocked; drawLock();
      if (r.solved) {
        $("#solved-chip").hidden = false;
        if (r.how && r.how.review && !d.review) reviewLine({ passes: 0, of: 3, when: r.how.review, due: false, done: false });
        if (r.explanation) { $("#explain").hidden = false; $("#explain .prose").innerHTML = r.explanation; typeset($("#explain")); }
      }
    } catch (e) {
      if (ticket !== routeId) return;
      $("#results").innerHTML = `<div class="banner bad">${esc(e.message)}</div>`;
    }
    b.disabled = false; b.textContent = "Run tests";
    busy = false;
  }
  $("#run").addEventListener("click", run);

  let armed = false;
  $("#reset").addEventListener("click", async () => {
    const b = $("#reset");
    if (!armed) { armed = true; b.textContent = "Click again to discard your code"; setTimeout(() => { armed = false; b.textContent = "Reset"; }, 4000); return; }
    const r = await api("/api/reset", { id: d.id });
    ed.value = r.code; lsDel(draftKey); armed = false; b.textContent = "Reset";
    $("#results").innerHTML = "";
    toast("Back to the starter code. Your old file was kept with a .bak ending.");
  });
  const ms = $("#mark-solved");
  if (ms) ms.addEventListener("click", async () => { await api("/api/mark", { id: d.id, on: !d.solved }); route(); });
}

/* ------------------------------------------------------------------ rewrite from memory */

async function review(id) {
  const ticket = routeId;
  const d = await api("/api/exercise?review=1&id=" + encodeURIComponent(id));
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  if (d.unsolved) { toast("Solve this exercise first. Rewriting from memory comes the day after."); location.replace("#/ex/" + id); return; }
  view.className = "wide";
  const draftKey = "lfz.review." + d.id;
  const started = Date.now();
  const rv = d.review || {};
  view.innerHTML = `
    <div class="row-flex"><a class="btn quiet" href="#/">Today</a>${d.skill ? `<a href="#/skill/${esc(d.skill.id)}">${esc(d.skill.name)}</a>` : ""}</div>
    <div class="row-flex"><h1>Rewrite from memory: ${esc(d.title)}</h1>${chip(d.difficulty)}</div>
    <p class="lede">${rv.due ? "Write it again from a blank page. No hints and no solution on this page. If it passes, it counts as rewrite " + (rv.passes + 1) + " of " + rv.of + "."
      : rv.done ? "You have already rewritten this " + rv.of + " times. This run is practice and does not change anything."
      : "This rewrite is not due yet (" + esc(rv.when || "") + "). You can practise now, but it only counts on the day."}</p>
    <div class="split">
      <div class="stack"><article class="prose" id="statement">${d.statement}</article>
        ${d.given ? `<details class="box"><summary>Already defined for you</summary><div class="stack"><p class="small muted">This code runs before yours on every test.</p><pre>${esc(d.given)}</pre></div></details>` : ""}</div>
      <div class="stack sticky">
        <textarea class="editor" id="code" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Your rewrite"></textarea>
        <div class="row-flex">
          <button class="btn primary" id="run">Run tests</button>
          <button class="btn" id="giveup">I cannot write it yet</button>
          <span class="timer" id="clock">00:00</span>
        </div>
        <div class="stack" id="results"></div>
      </div>
    </div>`;
  typeset(view);
  const ed = $("#code");
  ed.value = lsGet(draftKey, null) || d.code;
  const secs = () => Math.round((Date.now() - started) / 1000);
  const timer = setInterval(() => { const c = $("#clock"); if (c) { const t = secs(); c.textContent = String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); } }, 1000);
  leaveHook = () => clearInterval(timer);
  let busy = false;
  async function run() {
    if (busy) return;
    busy = true;
    const b = $("#run");
    b.disabled = true; b.textContent = "Running";
    try {
      const r = await api("/api/run", { id: d.id, code: ed.value, review: true, secs: secs() });
      if (ticket !== routeId) return;
      let head;
      if (r.solved) {
        clearInterval(timer);
        lsDel(draftKey);
        const mins = Math.max(1, Math.round(secs() / 60));
        head = r.counted
          ? `<div class="banner good"><strong>Rewritten from memory in about ${mins} ${mins === 1 ? "minute" : "minutes"}.</strong> That is ${r.passes} of ${r.of}. ${r.done ? "No more rewrites for this one: it is yours." : "The next one is " + esc(r.when) + "."}</div>`
          : `<div class="banner good"><strong>It passes.</strong> This run was practice, so the schedule is unchanged${r.when ? " (next rewrite " + esc(r.when) + ")" : ""}.</div>`;
        head += `<div class="row-flex"><a class="btn primary" href="#/">Back to Today</a><a class="btn" href="#/ex/${esc(d.id)}">Compare with your first solution</a></div>`;
        $("#giveup").hidden = true;
      } else {
        head = `<div class="banner bad"><strong>${r.total === 1 ? "The test does not pass yet." : r.passed + " of " + r.total + " tests pass."}</strong> Keep going: nothing is recorded until it passes.</div>`;
      }
      $("#results").innerHTML = head + r.results.map(resultHtml).join("");
    } catch (e) {
      if (ticket !== routeId) return;
      $("#results").innerHTML = `<div class="banner bad">${esc(e.message)}</div>`;
    }
    b.disabled = false; b.textContent = "Run tests";
    busy = false;
  }
  setupEditor(ed, draftKey, run);
  $("#run").addEventListener("click", run);
  let armed = false;
  $("#giveup").addEventListener("click", async () => {
    const b = $("#giveup");
    if (!armed) { armed = true; b.textContent = "Click again: it comes back tomorrow"; setTimeout(() => { armed = false; b.textContent = "I cannot write it yet"; }, 4000); return; }
    await api("/api/review/giveup", { id: d.id });
    lsDel(draftKey);
    toast("It comes back tomorrow. Read your solution again now, then close it.");
    location.hash = "#/ex/" + d.id;
  });
}

/* ------------------------------------------------------------------ quiz */

async function startQuiz(opts) {
  try {
    const r = await api("/api/quiz/start", opts);
    if (!r.questions.length) { toast("There are no questions in that set yet."); return; }
    session = { mode: opts.mode, scope: opts.scope, questions: r.questions, i: 0, answers: {}, right: 0, done: 0,
                deadline: opts.mode === "exam" ? Date.now() + (opts.minutes || Math.ceil(r.questions.length * 1.8)) * 60000 : 0,
                minutes: opts.minutes || Math.ceil(r.questions.length * 1.8), passMark: opts.passMark || 0, title: opts.title || "" };
    if (location.hash === "#/quiz/run") route(); else location.hash = "#/quiz/run";
  } catch (e) { toast(e.message); }
}

async function quiz() {
  const ticket = routeId;
  const [d, c] = await Promise.all([api("/api/quiz"), api("/api/certs")]);
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const rows = d.topics.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${t.total}</td><td class="num">${t.answered}</td>`
    + `<td class="num">${t.answered ? pct(t.right, t.answered) + "%" : ""}</td><td><button class="btn" data-topic="${esc(t.id)}">Practise 10</button></td></tr>`).join("");
  const scopes = [`<option value="all">All topics</option>`]
    .concat(c.certs.map(x => `<option value="cert:${esc(x.id)}">${esc(x.name)} (${esc(x.by.split(",")[0])})</option>`))
    .concat(d.topics.map(t => `<option value="topic:${esc(t.id)}">${esc(t.name)}</option>`)).join("");
  view.innerHTML = `
    <div class="stack"><h1>Quiz</h1><p class="lede">${d.total} questions with explanations. Practice mode tells you straight away. A mock exam runs against the clock and shows the answers at the end.</p></div>
    <div class="row-flex">
      <button class="btn primary" id="mixed">Practise 10 mixed</button>
      <button class="btn" id="missed"${d.missed ? "" : " disabled"}>Review ${d.missed} missed</button>
    </div>
    <section class="panel"><div class="head"><h2>Topics</h2></div><div class="scroll-x"><table class="plain">
      <thead><tr><th>Topic</th><th>Questions</th><th>Answered</th><th>Right</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="panel"><div class="head"><h2>Mock exam</h2></div><div class="body stack">
      <p class="muted">No feedback until you submit. The time allowed keeps the pace of a three-hour, 100-question paper: 1.8 minutes a question.</p>
      <div class="row-flex">
        <select id="scope" aria-label="What to include">${scopes}</select>
        <select id="len" aria-label="Number of questions"><option value="10">10 questions</option><option value="20">20 questions</option><option value="30" selected>30 questions</option><option value="50">50 questions</option></select>
        <button class="btn primary" id="exam">Start the exam</button>
      </div>
    </div></section>`;
  $("#mixed").addEventListener("click", () => startQuiz({ scope: "all", n: 10, mode: "practice" }));
  $("#missed").addEventListener("click", () => startQuiz({ scope: "missed", n: 20, mode: "practice" }));
  $$("[data-topic]").forEach(b => b.addEventListener("click", () => startQuiz({ scope: "topic:" + b.dataset.topic, n: 10, mode: "practice" })));
  $("#exam").addEventListener("click", () => startQuiz({ scope: $("#scope").value, n: parseInt($("#len").value, 10), mode: "exam" }));
}

function questionHtml(q, n, total) {
  return `<div class="row-flex spread"><span class="num">Question ${n} of ${total}</span></div>`
    + `<div class="qtext">${q.q}</div>` + (q.code ? `<pre>${esc(q.code)}</pre>` : "");
}

async function quizRun() {
  if (!session) { location.hash = "#/quiz"; return; }
  if (session.mode === "exam") return examView();
  const s = session;
  const draw = () => {
    if (s.i >= s.questions.length) {
      view.innerHTML = `<h1>${s.right} of ${s.questions.length} right</h1>
        <p class="lede">Questions you missed come back tomorrow under <a href="#/recall">Recall</a>, as open questions with no options, and first the next time you practise here.</p>
        <div class="row-flex"><button class="btn primary" id="again">Another set</button><a class="btn" href="#/quiz">Back to Quiz</a></div>`;
      $("#again").addEventListener("click", () => startQuiz({ scope: s.scope, n: s.questions.length, mode: "practice" }));
      session = null;
      return;
    }
    const q = s.questions[s.i];
    const cover = lsGet("lfz.cover", true);
    view.innerHTML = `<div class="qcard">${questionHtml(q, s.i + 1, s.questions.length)}
      ${cover ? `<div class="row-flex" id="cover"><button class="btn primary" id="uncover">Show the options</button><span class="muted small">Say your answer to yourself first. Recalling it teaches more than recognising it.</span></div>` : ""}
      <div class="opts"${cover ? " hidden" : ""}>${q.options.map((o, k) => `<button class="opt" data-k="${k}"><span class="key">${"ABCD"[k]}</span><span>${o}</span></button>`).join("")}</div>
      <div id="after"></div></div>
      <label class="toggle small muted"><input type="checkbox" id="cover-t"${cover ? " checked" : ""}> Hide the options until I have an answer in mind</label>`;
    if (cover) $("#uncover").addEventListener("click", () => { $("#cover").hidden = true; $(".opts").hidden = false; const f = $(".opt"); if (f) f.focus(); });
    $("#cover-t").addEventListener("change", () => { lsSet("lfz.cover", $("#cover-t").checked); if (!$(".opt:disabled")) draw(); });
    $$(".opt").forEach(b => b.addEventListener("click", async () => {
      const k = parseInt(b.dataset.k, 10);
      $$(".opt").forEach(x => { x.disabled = true; });
      try {
        const r = await api("/api/quiz/check", { qid: q.id, choice: q.order[k] });
        const rightK = q.order.indexOf(r.answer);
        $$(".opt")[rightK].classList.add("right");
        if (!r.correct) b.classList.add("wrong"); else s.right++;
        $("#after").innerHTML = `<div class="banner ${r.correct ? "good" : "bad"}"><strong>${r.correct ? "Right." : "Not this time."}</strong> ${r.explain}</div>
          ${r.recall ? `<p class="muted small">It comes back tomorrow under <a href="#/recall">Recall</a>, without the options.</p>` : ""}
          <p><button class="btn primary" id="next">${s.i + 1 < s.questions.length ? "Next question" : "Finish"}</button></p>`;
        $("#next").addEventListener("click", () => { s.i++; draw(); window.scrollTo(0, 0); });
        $("#next").focus();
      } catch (e) { toast(e.message); $$(".opt").forEach(x => { x.disabled = false; }); }
    }));
  };
  draw();
}

function examView() {
  const s = session;
  let timer = 0, confirming = false;
  const left = () => Math.max(0, Math.round((s.deadline - Date.now()) / 1000));
  const clock = () => { const t = left(); return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
  async function submit() {
    clearInterval(timer);
    const answers = {};
    s.questions.forEach(q => { answers[q.id] = q.id in s.answers ? s.answers[q.id] : -1; });
    try {
      const r = await api("/api/quiz/grade", { answers });
      session = null;
      const score = pct(r.right, r.total);
      const order = s.questions.map(q => q.id);
      r.review.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      view.innerHTML = `<h1>${r.right} of ${r.total}, ${score}%</h1>
        <p class="lede">NPTEL asks for 40% on its exam paper for a certificate. Treat 80% here as the mark that means you are ready, because the real paper will have questions you have not seen.</p>
        ${r.recalls ? `<p class="muted">${r.recalls} of the questions you missed ${r.recalls === 1 ? "comes" : "come"} back tomorrow under <a href="#/recall">Recall</a>, as open questions with no options.</p>` : ""}
        <div class="row-flex"><a class="btn primary" href="#/quiz">Back to Quiz</a><a class="btn" href="#/certs">Certificates</a></div>
        <div class="stack">${r.review.map((x, i) => `<div class="qcard"><div class="row-flex spread"><span class="num">Question ${i + 1}</span><span class="chip ${x.correct ? "ok" : "hard"}">${x.correct ? "right" : x.choice === -1 ? "not answered" : "wrong"}</span></div>
          <div class="qtext">${x.q}</div>${x.code ? `<pre>${esc(x.code)}</pre>` : ""}
          <div class="opts">${x.options.map((o, k) => `<div class="opt ${k === x.answer ? "right" : k === x.choice ? "wrong" : ""}"><span>${o}</span></div>`).join("")}</div>
          <div class="banner">${x.explain}</div></div>`).join("")}</div>`;
      window.scrollTo(0, 0);
    } catch (e) { toast(e.message); }
  }
  const draw = () => {
    const q = s.questions[s.i];
    const chosen = s.answers[q.id];
    const answered = Object.keys(s.answers).length;
    view.innerHTML = `<div class="row-flex spread"><h1>Mock exam</h1><span class="timer" id="clock">${clock()}</span></div>
      <div class="strip">${s.questions.map((x, k) => `<button data-go="${k}" class="${x.id in s.answers ? "answered" : ""} ${k === s.i ? "current" : ""}" aria-label="Question ${k + 1}">${k + 1}</button>`).join("")}</div>
      <div class="qcard">${questionHtml(q, s.i + 1, s.questions.length)}
        <div class="opts">${q.options.map((o, k) => `<button class="opt ${q.order[k] === chosen ? "chosen" : ""}" data-k="${k}"><span class="key">${"ABCD"[k]}</span><span>${o}</span></button>`).join("")}</div></div>
      <div class="row-flex">
        <button class="btn" id="prev"${s.i === 0 ? " disabled" : ""}>Previous</button>
        <button class="btn" id="nextq"${s.i + 1 >= s.questions.length ? " disabled" : ""}>Next</button>
        <button class="btn primary" id="submit">${confirming ? "Click again to submit (" + (s.questions.length - answered) + " unanswered)" : "Submit"}</button>
      </div>`;
    $$(".opt").forEach(b => b.addEventListener("click", () => { s.answers[q.id] = q.order[parseInt(b.dataset.k, 10)]; confirming = false; draw(); }));
    $$("[data-go]").forEach(b => b.addEventListener("click", () => { s.i = parseInt(b.dataset.go, 10); confirming = false; draw(); }));
    $("#prev").addEventListener("click", () => { s.i--; confirming = false; draw(); });
    $("#nextq").addEventListener("click", () => { s.i++; confirming = false; draw(); });
    $("#submit").addEventListener("click", () => { if (confirming || answered === s.questions.length) submit(); else { confirming = true; draw(); } });
  };
  draw();
  timer = setInterval(() => {
    const c = $("#clock");
    if (!c) return;
    c.textContent = clock();
    c.classList.toggle("low", left() < 120);
    if (left() <= 0) submit();
  }, 1000);
  leaveHook = () => clearInterval(timer);
}

/* ------------------------------------------------------------------ certificates */

async function certs() {
  const ticket = routeId;
  const d = await api("/api/certs");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const cards = d.certs.map(c => {
    const acc = c.answered ? pct(c.right, c.answered) : 0;
    const cover = pct(c.answered, c.questions);
    const verdict = c.answered === 0 ? "Not started" : cover < 80 ? "Keep going: " + (c.questions - c.answered) + " questions not seen yet"
      : acc >= 80 ? "Ready on this bank" : acc >= 60 ? "Close: review what you missed" : "Not yet";
    return `<section class="panel"><div class="head"><h2>${esc(c.name)}</h2><span class="muted small">${esc(c.by)}</span><span class="chip">${esc(c.kind)}</span></div>
      <div class="body stack">
        <ul class="prose" style="max-width:74ch">${c.facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
        <div class="meters">
          ${meter("Seen", c.answered, c.questions)}
          ${meter("Right, of those seen", c.right, Math.max(c.answered, 1), c.answered ? acc + "%" : "none yet")}
        </div>
        <p><strong>${esc(verdict)}.</strong> <span class="muted">Topics: ${c.topics.map(t => esc(d.topics[t])).join(", ")}.</span></p>
        <div class="row-flex">
          <button class="btn primary" data-exam="${esc(c.id)}">Mock exam: ${c.mock.n} questions, ${c.mock.minutes} minutes</button>
          <button class="btn" data-practise="${esc(c.id)}">Practise 10</button>
          <a class="btn quiet" href="${esc(c.link)}" target="_blank" rel="noopener">Course page (needs internet)</a>
        </div>
      </div></section>`;
  }).join("");
  const others = d.others.map(o => `<li><span class="grow"><strong>${esc(o.name)}</strong><br><span class="muted">${esc(o.note)}</span></span>`
    + `<a class="btn quiet" href="${esc(o.link)}" target="_blank" rel="noopener">Site</a></li>`).join("");
  view.innerHTML = `<div class="stack"><h1>Certificates</h1><p class="lede">${esc(d.note)}</p></div>${cards}
    <section class="panel"><div class="head"><h2>No certificate, still worth doing</h2></div><ul class="rows">${others}</ul></section>`;
  const by = id => d.certs.find(c => c.id === id);
  $$("[data-exam]").forEach(b => b.addEventListener("click", () => { const c = by(b.dataset.exam); startQuiz({ scope: "cert:" + c.id, n: c.mock.n, minutes: c.mock.minutes, mode: "exam" }); }));
  $$("[data-practise]").forEach(b => b.addEventListener("click", () => startQuiz({ scope: "cert:" + b.dataset.practise, n: 10, mode: "practice" })));
}

/* ------------------------------------------------------------------ lists */

const LBL = { D: "deep-ml", L: "LeetCode", G: "GFG", C: "Code360", I: "InterviewBit", S: "SPOJ", A: "Article", V: "Video",
              T: "Watch", H: "Hugging Face", P: "arXiv", W: "Open", PL: "Playlist", CH: "Channel" };
const linkHtml = (p, cls) => `<a${cls || ""} href="${esc(p[1])}" target="_blank" rel="noopener">${LBL[p[0]] || "Link"}${p[2] ? `<span class="detail"> ${esc(p[2])}</span>` : ""}</a>`;

async function lists(key) {
  const ticket = routeId;
  const d = await api("/api/lists");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  if (!d.tracks[key]) { location.hash = "#/lists/build"; return; }
  const ticks = d.ticks, notes = d.notes;
  const solvedHere = new Set(d.solved);
  const track = d.tracks[key];
  const openKey = "lfz.open." + key;
  let open = lsGet(openKey, null);
  const flat = [];
  track.forEach((st, si) => st.subs.forEach(sb => sb.items.forEach(it => flat.push({ si, it }))));
  if (!open) { const nx = flat.find(x => !ticks[x.it.i]); open = nx ? [nx.si] : []; }
  const tabs = d.order.map(k => `<a href="#/lists/${esc(k)}"${k === key ? ' aria-current="page"' : ""}>${esc(d.names[k])}</a>`).join("");
  const intro = {
    build: "The stages, as things to tick. Tick a function only when its tests pass.",
    papers: "Read it, implement it from the paper alone, then reproduce one result at a scale you can afford.",
    replays: "Winning competition solutions, rebuilt one version at a time. Write your own score under each version.",
    frontier: "What is trending now, for practising triage. Tick a paper when you have decided what it is worth.",
    iv: "Tick an item when you can explain it out loud in two minutes with no notes.",
    dsa: "Striver's A2Z sheet. One problem a day, in order, in Python. The links need internet; the DSA patterns under Practice do not.",
    video: "The 72 chapters of the stoney codes video. Half of them can be solved here, offline.",
    watch: "Your YouTube subscriptions, gone through and placed at the stage where each series helps.",
    syl: "The core courses of your M.Tech, with where this app covers each topic. Tick a topic when you can explain it with no notes; tick a lab when you have run it and written down the numbers."
  }[key];
  const filter = key === "dsa" || key === "video" || key === "watch";
  const rcHtml = id => d.recall[id] ? `<a class="chip" href="#/recall?card=${d.recall[id].id}">recall ${esc(d.recall[id].when)}</a>`
    : ticks[id] ? `<button class="btn quiet rc-add">Write what you kept</button>` : "";
  const rowHtml = it => {
    const a = (cls, p) => linkHtml(p, cls);
    const here = it.x ? `<a class="here" href="#/ex/${esc(it.x)}">${solvedHere.has(it.x) ? "Solved here" : "Solve here"}</a>` : "";
    const arx = (it.p || []).find(p => p[0] === "P");
    const readHere = arx && !WEB ? `<a class="here" href="#/read?add=${encodeURIComponent(arx[1])}&title=${encodeURIComponent(it.t)}">Read here</a>` : "";
    const links = here + readHere + (it.p || []).map(p => a("", p)).join("") + (it.s || []).map(p => a(' class="sol"', p)).join("");
    const dchip = it.d === 0 || it.d === 1 || it.d === 2 ? chip(["easy", "medium", "hard"][it.d]) : "";
    const id = esc(it.i);
    return `<li data-id="${id}" data-q="${esc(it.t.toLowerCase())}" class="${ticks[it.i] ? "done" : ""}"><input type="checkbox" id="t-${id}"${ticks[it.i] ? " checked" : ""}>`
      + `<label for="t-${id}"${it.code ? ' class="code"' : ""}>${esc(it.t)}${it.n ? `<span class="row-note">${esc(it.n)}</span>` : ""}</label>`
      + (it.first ? `<span class="chip ok">start here</span>` : "") + (key === "watch" && !it.sub ? `<span class="chip">not subscribed</span>` : "")
      + `${dchip}${links ? `<span class="links">${links}</span>` : ""}<span class="rc">${rcHtml(it.i)}</span></li>`;
  };
  let h = `<div class="stack"><h1>Lists</h1><p class="lede">${esc(intro)}</p></div><div class="tabs">${tabs}</div>`;
  if (d.about[key]) {
    const aboutOpen = lsGet("lfz.about." + key, true);
    h += `<details class="box" id="about"${aboutOpen ? " open" : ""}><summary>How to use this list</summary><div class="prose">${d.about[key]}</div></details>`;
  }
  const searchWord = key === "watch" ? "Search channels and titles" : "Search problems";
  if (filter) h += `<div class="row-flex"><input type="search" id="q" placeholder="${searchWord}" aria-label="${searchWord}">
      <label class="toggle"><input type="checkbox" id="hide"> Hide done</label>${key === "dsa" ? `<label class="toggle"><input type="checkbox" id="sol"> Show solution links</label>` : ""}</div>`;
  h += `<div class="stack" id="steps">`;
  track.forEach((st, si) => {
    h += `<section class="step" data-si="${si}"><button class="step-h" aria-expanded="false"><span class="num">${String(si + (key === "build" ? 0 : 1)).padStart(2, "0")}</span>`
      + `<span class="t">${esc(st.t)}${st.when ? `<span class="when">${esc(st.when)}</span>` : ""}</span><span class="num count"></span><span class="bar2"><i></i></span></button>`
      + `<div class="step-b" hidden>` + (st.note ? `<p class="${key === "replays" ? "note-text" : "muted small"}">${st.note}</p>` : "")
      + (key === "replays" ? `<p class="ladder small" data-ladder="${si}"></p>` : "");
    st.subs.forEach(sb => {
      h += `<div class="sub">` + (sb.t ? `<div class="sub-h"><span class="t${sb.u ? " paper" : sb.f ? " mono" : sb.score ? " paper" : ""}">${esc(sb.t)}${sb.who ? ` <span class="who">${esc(sb.who)}</span>` : ""}</span>`
        + (sb.core ? `<span class="chip ok">Core</span>` : "") + (sb.u ? `<a class="small" href="${esc(sb.u)}" target="_blank" rel="noopener">Paper</a>${WEB ? "" : `<a class="small" href="#/read?add=${encodeURIComponent(sb.u)}&title=${encodeURIComponent(sb.t)}">Read here</a>`}` : "")
        + (sb.cmd ? `<code class="muted">${esc(sb.cmd)}</code>` : "") + `</div>` : "")
        + (sb.about ? `<p class="sub-about">${sb.about}</p>` : "")
        + `<ul class="ticks">${sb.items.map(rowHtml).join("")}</ul>`
        + (sb.score ? `<label class="score">Your score after this version (${esc(sb.score.label)}) <input type="text" inputmode="decimal" maxlength="24" data-note="${esc(sb.score.id)}" data-si="${si}" value="${esc(notes[sb.score.id] || "")}" placeholder="write it here"></label>` : "")
        + `</div>`;
    });
    h += `</div></section>`;
  });
  h += `</div>`;
  view.innerHTML = h;

  const steps = $$(".step");
  const ladders = () => $$("[data-ladder]").forEach(el => {
    const si = parseInt(el.dataset.ladder, 10);
    const got = track[si].subs.map((sb, k) => sb.score && notes[sb.score.id] ? "v" + k + " " + notes[sb.score.id] : null).filter(Boolean);
    el.textContent = got.length ? "Your ladder so far: " + got.join("  \u2192  ") : "";
    el.hidden = !got.length;
  });
  ladders();
  const refresh = () => {
    const q = filter ? $("#q").value.trim().toLowerCase() : "";
    const hide = filter && $("#hide").checked;
    steps.forEach((el, si) => {
      const rows = $$(".ticks li", el);
      let done = 0, vis = 0;
      rows.forEach(li => {
        const on = !!ticks[li.dataset.id];
        if (on) done++;
        const show = (!q || li.dataset.q.indexOf(q) !== -1) && !(hide && on && !$(".recall-box", li));
        li.hidden = !show;
        if (show) vis++;
      });
      $$(".sub", el).forEach(sub => { sub.hidden = $$("li:not([hidden])", sub).length === 0; });
      el.hidden = vis === 0;
      $(".count", el).textContent = done + "/" + rows.length;
      $(".bar2 i", el).style.width = pct(done, rows.length) + "%";
      const isOpen = !!q || open.indexOf(si) !== -1;
      $(".step-b", el).hidden = !isOpen;
      $(".step-h", el).setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  };
  refresh();
  $("#steps").addEventListener("click", e => {
    const b = e.target.closest(".step-h");
    if (!b) return;
    const si = parseInt(b.parentElement.dataset.si, 10);
    const k = open.indexOf(si);
    if (k === -1) open.push(si); else open.splice(k, 1);
    lsSet(openKey, open);
    refresh();
  });
  $("#steps").addEventListener("change", async e => {
    if (e.target.dataset.note) {
      const v = e.target.value.trim();
      try {
        await api("/api/note", { id: e.target.dataset.note, v });
        if (v) notes[e.target.dataset.note] = v; else delete notes[e.target.dataset.note];
        ladders();
        toast(v ? "Score saved." : "Score cleared.");
      } catch (err) { toast(err.message); }
      return;
    }
    const li = e.target.closest(".ticks li");
    if (!li || e.target.type !== "checkbox") return;
    const on = e.target.checked;
    try {
      await api("/api/tick", { id: li.dataset.id, on });
      if (on) ticks[li.dataset.id] = 1; else delete ticks[li.dataset.id];
      li.classList.toggle("done", on);
      if (on && d.ask[key] && !d.recall[li.dataset.id]) openRc(li);
      else { const h = $(".rc-holder", li); if (h && !on) h.remove(); if (!$(".rc-holder", li)) $(".rc", li).innerHTML = rcHtml(li.dataset.id); }
      refresh();
    } catch (err) { e.target.checked = !on; toast(err.message); }
  });
  /* The box under a row: what did you keep? Opens by itself on a tick in the lists that ask. */
  const openRc = li => {
    if ($(".rc-holder", li)) return;
    const id = li.dataset.id, holder = document.createElement("div");
    holder.className = "rc-holder";
    li.appendChild(holder);
    $(".rc", li).innerHTML = "";
    const close = () => { holder.remove(); $(".rc", li).innerHTML = rcHtml(id); refresh(); };
    recallBox(holder, d.ask[key] || d.ask_default, async note => {
      const r = await api("/api/recall/add", { kind: "row", ref: id, note });
      d.recall[id] = { id: r.id, when: r.when };
      close();
      toast("Saved. It comes back tomorrow, under Recall.");
    }, close);
  };
  $("#steps").addEventListener("click", e => {
    const b = e.target.closest(".rc-add");
    if (b) openRc(b.closest(".ticks li"));
  });
  const ab = $("#about");
  if (ab) ab.addEventListener("toggle", () => lsSet("lfz.about." + key, ab.open));
  if (filter) {
    $("#q").addEventListener("input", refresh);
    $("#hide").addEventListener("change", refresh);
    if (key === "dsa") $("#sol").addEventListener("change", () => view.classList.toggle("show-sol", $("#sol").checked));
  }
}

/* ------------------------------------------------------------------ skill map */

const STATE_WORD = { strong: "strong", learning: "in progress", ready: "ready to start", later: "for later", missing: "needs the download" };
const GROUP_SHORT = { py: "Python", dsa: "DSA", ml: "ML", role: "Role topic", sys: "Systems", num: "Numerical" };
const mapTabs = cur => `<div class="tabs"><a href="#/map"${cur === "map" ? ' aria-current="page"' : ""}>Skill map</a><a href="#/roles"${cur === "roles" ? ' aria-current="page"' : ""}>Role tracks</a></div>`;

async function map() {
  const ticket = routeId;
  const d = await api("/api/map");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  view.className = "wide";
  const NW = 148, NH = 66, CW = 164, RH = 104, PAD = 6;
  const W = d.cols * CW - (CW - NW) + 2 * PAD, H = d.rows * RH - (RH - NH) + 2 * PAD;
  const pos = {};
  d.skills.forEach(s => { pos[s.id] = { x: PAD + s.at[0] * CW, y: PAD + s.at[1] * RH, s }; });
  let edges = "";
  d.skills.forEach(s => s.needs.forEach(nid => {
    const a = pos[nid], b = pos[s.id];
    const x1 = a.x + NW / 2, y1 = a.y + NH, x2 = b.x + NW / 2, y2 = b.y, m = (y2 - y1) / 2;
    edges += `<path class="edge${a.s.mastery >= 0.5 ? " met" : ""}" data-a="${esc(nid)}" data-b="${esc(s.id)}" d="M${x1} ${y1} C${x1} ${y1 + m} ${x2} ${y2 - m} ${x2} ${y2}"/>`;
  }));
  const nodes = d.skills.map(s => `<a class="node ${esc(s.state)}" href="#/skill/${esc(s.id)}" data-id="${esc(s.id)}" style="left:${pos[s.id].x}px;top:${pos[s.id].y}px"`
    + ` aria-label="${esc(s.name)}: ${STATE_WORD[s.state]}, ${Math.round(s.mastery * 100)} percent">`
    + `<span class="g">${GROUP_SHORT[s.group]}</span><span class="n">${esc(s.name)}</span>`
    + `<span class="p"><i style="width:${Math.round(s.mastery * 100)}%"></i></span></a>`).join("");
  const legend = ["strong", "learning", "ready", "later"].map(k => `<span class="key"><i class="node ${k}"></i>${STATE_WORD[k]}</span>`).join("");
  let listHtml = "";
  d.groups.forEach(g => {
    const rows = d.skills.filter(s => s.group === g.id).map(s => `<li><span class="dot ${s.state === "strong" ? "solved" : s.state === "learning" ? "open" : ""}"></span>`
      + `<a class="main" href="#/skill/${esc(s.id)}">${esc(s.name)}</a><span class="num">${s.kind === "quiz" ? s.done + "/" + s.total + " right" : s.state === "missing" ? "not downloaded" : s.done + "/" + s.total + " solved"}</span>`
      + `<span class="mini"><i style="width:${Math.round(s.mastery * 100)}%"></i></span><span class="num pc">${Math.round(s.mastery * 100)}%</span></li>`).join("");
    listHtml += `<section class="panel"><div class="head"><h2>${esc(g.name)}</h2></div><ul class="rows">${rows}</ul></section>`;
  });
  view.innerHTML = `
    <div class="stack"><h1>Map</h1><p class="lede">Each box is a skill. A line means the upper one comes first. The bar in a box is how strong you are in it, counted from how you solved its exercises, not only whether you did.</p></div>
    ${mapTabs("map")}
    ${d.rec ? nextHtml(d.rec, "Suggested next") : ""}
    <div class="row-flex legend">${legend}</div>
    <div class="map-wrap" id="map-wrap"><div class="map-size" id="map-size"><div class="map" id="map" style="width:${W}px;height:${H}px">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${edges}</svg>${nodes}</div></div></div>
    <p class="muted small" id="map-hint" hidden>The map is wider than this screen. Scroll it sideways, or use the list below.</p>
    <h2>The same, as a list</h2>
    <div class="cols2">${listHtml}</div>`;
  const wrap = $("#map-wrap"), size = $("#map-size"), inner = $("#map");
  const fit = () => {
    const sc = Math.min(1, Math.max(0.74, (wrap.clientWidth - 26) / W));   // 26: the frame's padding and border
    inner.style.transform = "scale(" + sc + ")";
    size.style.width = Math.ceil(W * sc) + "px";
    size.style.height = Math.ceil(H * sc) + "px";
    const wide = wrap.scrollWidth > wrap.clientWidth + 2;
    $("#map-hint").hidden = !wide;
    return sc;
  };
  const sc0 = fit();
  // on a narrow screen, start with the skill you are working on in view
  const here = pos[(d.rec && d.rec.skill) || d.skills[0].id];
  if (here && wrap.scrollWidth > wrap.clientWidth + 2) wrap.scrollLeft = Math.max(0, (here.x + NW / 2) * sc0 - wrap.clientWidth / 2);
  let ro = null;
  if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(wrap); } else window.addEventListener("resize", fit);
  leaveHook = () => { if (ro) ro.disconnect(); else window.removeEventListener("resize", fit); };
  const light = id => {
    $$(".edge", inner).forEach(p => p.classList.toggle("hl", !!id && (p.dataset.a === id || p.dataset.b === id)));
    inner.classList.toggle("focus", !!id);
    const near = new Set([id]);
    if (id) d.skills.forEach(s => { if (s.id === id) s.needs.forEach(x => near.add(x)); if (s.needs.indexOf(id) !== -1) near.add(s.id); });
    $$(".node", inner).forEach(nd => nd.classList.toggle("near", !!id && near.has(nd.dataset.id)));
  };
  $$(".node", inner).forEach(nd => {
    nd.addEventListener("mouseenter", () => light(nd.dataset.id));
    nd.addEventListener("mouseleave", () => light(null));
    nd.addEventListener("focus", () => light(nd.dataset.id));
    nd.addEventListener("blur", () => light(null));
  });
}

async function skill(id) {
  const ticket = routeId;
  const d = await api("/api/skill?id=" + encodeURIComponent(id));
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const pcs = Math.round(d.mastery * 100);
  const link = x => `<a href="#/skill/${esc(x.id)}">${esc(x.name)}</a> <span class="num">${Math.round(x.mastery * 100)}%</span>`;
  let body = "";
  if (d.kind === "quiz") {
    body = `<section class="panel"><div class="body stack">
      <p>This skill is measured by quiz questions for now: ${d.quiz.right} of ${d.quiz.total} answered right at the last try, ${d.quiz.answered} seen.</p>
      <div><button class="btn primary" id="practise">Practise 10 questions</button></div></div></section>`;
  } else if (d.state === "missing") {
    body = `<div class="banner">These exercises come from the ML problem set, which is not downloaded yet. <a href="#/practice/ml">Set it up</a> (about 8 MB, once).</div>`;
  } else {
    let step = 0, rows = "";
    d.rows.forEach(r => {
      if (d.kind === "ex" && r.step !== step) { step = r.step; rows += `<li class="step-row"><span class="num">Step ${step} of 3</span></li>`; }
      rows += `<li><span class="dot ${esc(r.status)}"></span><a class="main" href="#/ex/${esc(r.id)}">${esc(r.title)}</a>`
        + `<span class="muted small grow2">${esc(r.how)}${r.review ? (r.how ? ", " : "") + esc(r.review) : ""}</span>`
        + (r.due ? `<a class="btn" href="#/review/${esc(r.id)}">Rewrite</a>` : "") + chip(r.difficulty) + `</li>`;
    });
    body = `<section class="panel"><div class="head"><h2>${d.kind === "ex" ? "The ladder" : "In course order"}</h2><span class="muted small">${d.done} of ${d.total} solved</span></div><ul class="rows">${rows}</ul></section>`;
  }
  view.innerHTML = `
    <div class="row-flex"><a class="btn quiet" href="#/map">Map</a><span class="muted">${esc(GROUP_SHORT[d.group])}</span></div>
    <div class="row-flex"><h1>${esc(d.name)}</h1><span class="chip${d.state === "strong" ? " ok" : ""}">${STATE_WORD[d.state]}</span></div>
    <p class="lede">${esc(d.about)}</p>
    <div class="meters">${meter("Mastery", pcs, 100, pcs + "%")}</div>
    <p class="muted small">Counted as strong from ${Math.round(d.strong_at * 100)}%. A skill that builds on this one is suggested once this reaches ${Math.round(d.met_at * 100)}%. Harder steps count for more, and an exercise solved with hints counts for less until you have rewritten it from memory.</p>
    ${d.needs.length ? `<p>Builds on: ${d.needs.map(link).join(", ")}</p>` : ""}
    ${d.unlocks.length ? `<p>Leads to: ${d.unlocks.map(link).join(", ")}</p>` : ""}
    ${d.rec ? nextHtml(d.rec, "Next in this skill") : ""}
    ${body}
    ${d.watch.length ? `<section class="panel"><div class="head"><h2>Watch for this skill</h2><span class="muted small">after your own attempt, not before</span><a class="small" href="#/lists/watch">The whole list</a></div>
      <ul class="rows">${d.watch.map(w => `<li><span class="dot ${w.done ? "solved" : ""}" title="${w.done ? "ticked in the Watch list" : "not ticked yet"}"></span>`
        + `<span class="grow">${esc(w.t)}${w.n ? `<span class="row-note">${esc(w.n)}</span>` : ""}</span><span class="links">${w.p.map(p => linkHtml(p)).join("")}</span></li>`).join("")}</ul></section>` : ""}`;
  const pb = $("#practise");
  if (pb) pb.addEventListener("click", () => startQuiz({ scope: "topic:" + d.quiz.topic, n: 10, mode: "practice" }));
}

async function roles() {
  const ticket = routeId;
  const d = await api("/api/roles");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const panels = d.roles.map(r => {
    const ready = Math.round(r.ready * 100);
    return `<section class="panel role"><div class="head"><h2>${esc(r.name)}</h2>${r.main ? `<span class="chip ok">your main track</span>` : ""}<span class="num">${ready}% on what this app measures</span></div>
      <div class="body stack">
        <p>${esc(r.what)}</p>
        <p><strong>What you already bring.</strong> ${esc(r.brings)}</p>
        <p class="muted small">Job titles to search for: ${esc(r.titles)}.</p>
        <h3>What the interviews ask</h3>
        <div class="scroll-x"><table class="plain rounds"><tbody>${r.rounds.map(x => `<tr><th scope="row">${esc(x.name)}</th><td>${esc(x.asks)}</td></tr>`).join("")}</tbody></table></div>
        <h3>Where you stand</h3>
        <ul class="parts">${r.parts.map(p => `<li><a href="${esc(p.href)}">${esc(p.label)}</a><span class="mini"><i style="width:${Math.round(p.value * 100)}%"></i></span><span class="num">${esc(p.note)}</span></li>`).join("")}</ul>
        <p><strong>The project to show.</strong> ${esc(r.project)}</p>
      </div></section>`;
  }).join("");
  const advice = d.search.map(sec => `<section class="panel"><div class="head"><h2>${esc(sec.title)}</h2></div><div class="body"><ul class="prose">${sec.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div></section>`).join("");
  view.innerHTML = `
    <div class="stack"><h1>Map</h1><p class="lede">Five kinds of job this plan leads to. Each shows what its interviews ask, which parts of this app prepare them, and how far along you are on those parts.</p></div>
    ${mapTabs("roles")}
    ${panels}
    <h2>The search itself</h2>
    ${advice}`;
}

/* ------------------------------------------------------------------ settings */

async function settings() {
  const ticket = routeId;
  const d = await api("/api/settings");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const m = d.manifest, c = m.counts;
  const when = new Date(m.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  view.innerHTML = `<h1>Settings</h1>
    ${devicesPanel(d)}
    <section class="panel"><div class="head"><h2>Solutions</h2></div><div class="body stack">
      <label class="toggle"><input type="radio" name="sol" value="after_attempt"${d.solutions === "after_attempt" ? " checked" : ""}> Unlock a solution after I have run an attempt of my own (recommended)</label>
      <label class="toggle"><input type="radio" name="sol" value="always"${d.solutions === "always" ? " checked" : ""}> Always allow solutions</label>
    </div></section>
    <section class="panel"><div class="head"><h2>Version ${esc(m.version)}</h2><span class="muted small">${esc(when)}</span></div><div class="body stack">
      <p>${c.exercises} exercises with tests (${c.python} Python, ${c.dsa} DSA), ${c.ml_plan} planned ML problems, ${c.lessons} lessons, ${c.questions} quiz questions, ${c.skills} skills on the map.</p>
      ${m.changelog.map((e, i) => `<details class="box"${i === 0 ? " open" : ""}><summary>${esc(e.version)}</summary><div><ul class="prose">${e.changes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></details>`).join("")}
      <details class="box"><summary>How updates work</summary><div class="prose">
        <ul>${m.rules.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        ${WEB ? `<p>This browser version updates itself: a new version is fetched the next time you open the app with a connection, and used from the visit after that. Your progress is not touched.</p>` : `<p>To move to a newer version: unpack it beside this one (each version has its own folder name), then run this from inside the new folder, with the path of the old one:</p>
        <pre>python update.py ${esc(d.root)}</pre>
        <p>It copies your progress, your solution files and the downloaded ML problems across. The old folder is not changed, so you can delete it once the new one works.</p>`}
      </div></details>
    </div></section>
    ${WEB ? browserPanel(d) : `<section class="panel" id="agent-panel"><div class="head"><h2>Your agent</h2><span class="muted small" id="a-state"></span></div><div class="body stack">
      <p>A language model that runs on your own GPU. It reads papers with you on the Read page, answers questions, and gives a nudge on an exercise when you ask. It never writes exercise code. Nothing is sent to it until you set it up here.</p>
      <div class="row-flex"><button class="btn" id="m-check">Check this computer</button><span class="muted" id="m-msg">Looks for a GPU and for Ollama.</span></div>
      <div class="form-grid">
        <label for="a-url">Model server address</label>
        <div class="row-flex"><input type="text" id="a-url" spellcheck="false" size="30"><button class="btn" id="a-connect">Connect</button></div>
        <label for="a-model">Model</label>
        <select id="a-model"><option value="">Connect first</option></select>
        <label for="a-ctx">Context length</label>
        <select id="a-ctx"><option value="4096">4,096 tokens</option><option value="8192">8,192 tokens</option><option value="16384">16,384 tokens</option><option value="32768">32,768 tokens</option></select>
      </div>
      <div class="row-flex"><button class="btn primary" id="a-test" disabled>Test the model</button><span class="muted" id="a-msg"></span></div>
      <details class="box"><summary>Setting it up on this computer</summary><div class="prose">
        <ol>
          <li>Install Ollama from <code>ollama.com</code>. It runs the model and uses your GPU by itself.</li>
          <li>Press "Check this computer" above to see what size of model fits your GPU.</li>
          <li>In a terminal, download one model of that size. Examples: <code>ollama pull gemma3:4b</code> (3 to 4 billion parameters), <code>ollama pull qwen3:8b</code> (7 to 8 billion), <code>ollama pull gemma3:12b</code> or <code>ollama pull phi4:14b</code> (12 to 14 billion), <code>ollama pull gpt-oss:20b</code> (about 20 billion).</li>
          <li>Come back here, press Connect, choose the model, and press Test.</li>
        </ol>
        <p>Those names were in Ollama's library in mid-2026. A newer model of the same size may be better; its library page lists them.</p>
        <p>Context length is how much text the model sees at once. 8,192 is a safe start. A longer context reads a paper in fewer pieces but needs more GPU memory. If answers become very slow, lower it.</p>
      </div></details>
      <details class="box"><summary>Using the college server's GPU instead</summary><div class="prose">
        <p>Run the model there and reach it through an SSH tunnel. The app does not change; only the address does.</p>
        <pre># on the server, once
ollama pull qwen3:8b

# on this laptop, each time you want the agent
ssh -N -L 11500:127.0.0.1:11434 you@the-server</pre>
        <p>Then set the address above to <code>http://127.0.0.1:11500</code> and press Connect. While the tunnel is open, the text of the paper or exercise you ask about goes to that server. Check that the server allows this kind of use. Other model servers that speak the OpenAI protocol, such as vLLM or llama.cpp, work at their own address in the same way.</p>
      </div></details>
      <p class="muted small">A small local model gets things wrong. Its summaries are a second reader, not a replacement for reading, and each one is marked with the model that wrote it.</p>
    </div></section>
    <section class="panel"><div class="head"><h2>This computer</h2></div><div class="body stack">
      <p>Python ${esc(d.python)}. NumPy: ${d.numpy ? esc(d.numpy) : "not installed. The ML problems need it: <code>pip install numpy</code>"}.</p>
      <div class="row-flex"><button class="btn" id="gpu">Look for PyTorch and a GPU</button><span class="muted" id="gpu-msg">Needed from Stage 3. The check can take half a minute.</span></div>
      <p>Your progress and your solution files are in <code>${esc(d.data)}</code>. To back them up, copy that folder, or save your progress as a file under Your devices.</p>
      <p class="muted small">The server listens on 127.0.0.1 only, so nothing here is reachable from another computer. It runs the code you write, as you, on this machine. If you set up an agent, what you ask it is sent to the model address you gave and nowhere else. Fetching a paper by link contacts that paper's site.</p>
    </div></section>`}
    <section class="panel"><div class="head"><h2>Where a GPU matters</h2></div><div class="scroll-x"><table class="plain">
      <thead><tr><th>Stage</th><th>GPU</th><th>Why</th></tr></thead><tbody>
      <tr><td>0 to 2</td><td>Not needed</td><td>Plain Python and NumPy. Everything runs in seconds on a laptop.</td></tr>
      <tr><td>3, PyTorch</td><td>Useful</td><td>Learn to move a model and its data to the device here, while the models are small.</td></tr>
      <tr><td>4, Transformer</td><td>Wanted</td><td>A character-level GPT trains in minutes on a GPU and takes an hour or more without one.</td></tr>
      <tr><td>5, fine-tuning</td><td>Needed</td><td>GPT-2 fine-tuning and LoRA. A 16 GB card is plenty.</td></tr>
      <tr><td>6, RL</td><td>Mostly not</td><td>The simulator, on the CPU, is the slow part. Pixel inputs such as CarRacing are the exception.</td></tr>
      <tr><td>7 and 8</td><td>For training only</td><td>Train on the GPU, then run on the Raspberry Pi. Measuring it there is the point.</td></tr>
      <tr><td>Replays</td><td>Needed</td><td>Boosted trees on 590,000 rows, and a 7B model with LoRA in 4-bit.</td></tr>
      </tbody></table></div>
      <div class="body muted small">Keep this app on the laptop. For long runs, start the training on the bigger machine over SSH inside <code>tmux</code>, and copy the numbers back. If that machine belongs to your lab or employer, check that personal coursework is allowed on it.</div>
    </section>`;
  $$('input[name="sol"]').forEach(r => r.addEventListener("change", async () => { await api("/api/settings", { k: "solutions", v: r.value }); toast("Saved."); }));
  devicesWire();
  if (WEB) {
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p => {
      const el = $("#storage-line");
      if (el) el.textContent = p ? "The browser has agreed to keep this site's data when space runs low." : "The browser may clear this site's data if the device runs low on space. Installing the app (Add to Home screen) usually prevents that.";
    }).catch(() => {});
    return;
  }
  /* the agent */
  const aState = cfg => { $("#a-state").textContent = cfg.ready ? "ready: " + cfg.model : "not set up"; $("#a-test").disabled = !cfg.ready; };
  const fillModels = (cfg) => {
    const sel = $("#a-model");
    const models = cfg.models || [];
    sel.innerHTML = models.length
      ? `<option value="">Choose a model</option>` + models.map(m => `<option value="${esc(m.name)}"${m.name === cfg.model ? " selected" : ""}>${esc(m.name)}${m.params ? " (" + esc(m.params) + (m.quant ? ", " + esc(m.quant) : "") + (m.gb ? ", " + m.gb + " GB" : "") + ")" : ""}</option>`).join("")
      : `<option value="${esc(cfg.model || "")}">${cfg.model ? esc(cfg.model) : "No models found"}</option>`;
  };
  const connect = async extra => {
    const msg = $("#a-msg");
    msg.textContent = "Connecting";
    try {
      const cfg = await api("/api/agent/config", Object.assign({ url: $("#a-url").value, ctx: $("#a-ctx").value }, extra || {}));
      if (ticket !== routeId) return;
      $("#a-url").value = cfg.url;
      fillModels(cfg);
      aState(cfg);
      msg.textContent = cfg.error ? cfg.error
        : !cfg.models.length ? "Connected, but no model is downloaded there yet."
        : cfg.ready ? "Connected to " + (cfg.kind === "ollama" ? "Ollama" : "an OpenAI-compatible server") + ". Model: " + cfg.model + "."
        : "Connected to " + (cfg.kind === "ollama" ? "Ollama" : "an OpenAI-compatible server") + ". Choose a model.";
    } catch (e) { msg.textContent = e.message; }
  };
  api("/api/agent").then(cfg => {
    if (ticket !== routeId) return;
    $("#a-url").value = cfg.url;
    $("#a-ctx").value = String(cfg.ctx);
    if (!$("#a-ctx").value) $("#a-ctx").value = "8192";
    fillModels(cfg);
    aState(cfg);
  });
  $("#a-connect").addEventListener("click", () => connect());
  $("#a-model").addEventListener("change", () => { if ($("#a-model").value) connect({ model: $("#a-model").value }); });
  $("#a-ctx").addEventListener("change", () => connect($("#a-model").value ? { model: $("#a-model").value } : null));
  $("#a-test").addEventListener("click", async () => {
    const b = $("#a-test"), msg = $("#a-msg");
    b.disabled = true; msg.textContent = "Asking the model for one word. The first call loads the model and can take a minute.";
    try {
      const r = await api("/api/agent/test", {});
      msg.textContent = r.ok ? "It answered \u201c" + r.reply + "\u201d in " + r.secs + " seconds. The agent is ready." : r.error;
    } catch (e) { msg.textContent = e.message; }
    b.disabled = false;
  });
  $("#m-check").addEventListener("click", async () => {
    const msg = $("#m-msg");
    msg.textContent = "Looking";
    try {
      const m = await api("/api/agent/check");
      const gpus = m.gpus.map(g => g.name + " (" + g.gb + " GB)").join(", ");
      msg.textContent = (gpus ? "Found " + gpus + ". " + (m.fits ? "A model of " + m.fits + " fits. " : "") : "") + (m.note ? m.note + " " : "")
        + (m.ollama ? "Ollama is installed." : "Ollama is not installed yet.");
    } catch (e) { msg.textContent = e.message; }
  });

  $("#gpu").addEventListener("click", async () => {
    const b = $("#gpu"), msg = $("#gpu-msg");
    b.disabled = true; msg.textContent = "Looking";
    try {
      const g = await api("/api/gpu");
      msg.textContent = !g.torch ? "PyTorch is not installed for this Python. Install it when you reach Stage 3, from pytorch.org, choosing the build for your GPU."
        : g.cuda ? "PyTorch " + g.torch + " with " + g.gpus.map(x => x.name + " (" + x.gb + " GB)").join(", ") + "."
        : g.mps ? "PyTorch " + g.torch + " with Apple's GPU (MPS)."
        : "PyTorch " + g.torch + " is installed, but it does not see a GPU. That is fine until Stage 4.";
    } catch (e) { msg.textContent = e.message; }
    b.disabled = false;
  });
}


/* ------------------------------------------------------------------ moving progress between devices */

const dateWord = ts => ts ? new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

function devicesPanel(d) {
  return `<section class="panel" id="devices"><div class="head"><h2>Your devices</h2><span class="muted small">last saved: ${esc(dateWord(d.sync.exported))} &middot; last added: ${esc(dateWord(d.sync.imported))}</span></div><div class="body stack">
      <p>${WEB ? "Your progress is kept in this browser, on this device." : "Your progress is kept on this computer."} To carry it to another device, save it as a file here and add that file there. Adding a file only adds what is new and never removes anything, so you can do it in both directions, as often as you like.</p>
      <div class="row-flex">
        <button class="btn primary" id="sync-save">Save my progress as a file</button>
        <button class="btn" id="sync-share" hidden>Send it to another device</button>
        <label class="btn" for="sync-file">Add progress from a file</label><input type="file" id="sync-file" accept=".json,application/json" class="visually-hidden">
      </div>
      <p class="muted small" id="sync-msg"></p>
      <details class="box"><summary>Sending the file by Bluetooth</summary><div class="prose">
        <ol>
          <li>On the phone, press "Send it to another device" and choose Bluetooth or Quick Share. If that button is not shown, press "Save my progress as a file", open the file in Files or Downloads, and share it from there.</li>
          <li>On a Windows laptop, open Settings, Bluetooth and devices, then "Send or receive files via Bluetooth", and choose "Receive files" before you send.</li>
          <li>Open the app on the receiving device, come to this page, and press "Add progress from a file".</li>
        </ol>
        <p>To bring two devices level, add the phone's file on the laptop, then save on the laptop and add that file on the phone. Email, a USB cable or Google Drive work just as well as Bluetooth. The file is small: tens of kilobytes for most people.</p>
        <p>What a file does not carry: a tick you removed on one device comes back if the other still has it, and paper PDFs stay where they were uploaded. The notes on a paper do travel: upload the same PDF on the other device and they are already there.</p>
      </div></details>
    </div></section>`;
}

function devicesWire() {
  const msg = $("#sync-msg");
  const fileName = () => "llm-from-zero-progress-" + (WEB ? "browser" : "laptop") + "-" + new Date().toISOString().slice(0, 10) + ".json";
  const makeFile = async () => {
    const data = await api("/api/export");
    return new File([JSON.stringify(data)], fileName(), { type: "application/json" });
  };
  $("#sync-save").addEventListener("click", async () => {
    try {
      const f = await makeFile();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      msg.textContent = "Saved as " + f.name + " in your downloads.";
    } catch (e) { msg.textContent = e.message; }
  });
  const share = $("#sync-share");
  try {
    const probe = new File(["{}"], "x.json", { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [probe] })) share.hidden = false;
  } catch (e) {}
  share.addEventListener("click", async () => {
    try {
      const f = await makeFile();
      await navigator.share({ files: [f], title: "LLM From Zero progress" });
      msg.textContent = "Sent. On the other device, open Settings and press “Add progress from a file”.";
    } catch (e) { if (e.name !== "AbortError") msg.textContent = e.message; }
  });
  $("#sync-file").addEventListener("change", async () => {
    const f = $("#sync-file").files[0];
    if (!f) return;
    msg.textContent = "Reading " + f.name;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { msg.textContent = "That file is not a progress file from this app."; return; }
    try {
      const r = await api("/api/import", { data });
      msg.textContent = r.message;
      toast(r.message);
    } catch (e) { msg.textContent = e.message; }
    $("#sync-file").value = "";
  });
}

function browserPanel(d) {
  return `<section class="panel"><div class="head"><h2>This browser</h2></div><div class="body stack">
      <p>Python ${esc(d.python)} runs inside this browser, so nothing is installed and nothing you write leaves this device. NumPy and SciPy load by themselves the first time a problem needs them.</p>
      <p id="storage-line" class="muted small"></p>
      <p class="muted small">Clearing this site's data in the browser deletes your progress here. Save it as a file now and then, above. The agent and fetching papers by link need the laptop version, which runs on your own computer.</p>
    </div></section>`;
}

/* ------------------------------------------------------------------ talking to the agent */

let activeAgent = null;

/* Ask the server for a streamed answer and show it in `el` as it is written. */
function agentRun(path, body, el, onDone) {
  if (activeAgent) activeAgent.abort();
  const ctl = new AbortController();
  activeAgent = ctl;
  el.innerHTML = `<div class="agent-status"><span class="spin" aria-hidden="true"></span><span class="st">Starting</span><button class="btn quiet" data-stop>Stop</button></div><div class="agent-text"></div>`;
  const st = $(".st", el), out = $(".agent-text", el);
  let text = "";
  $("[data-stop]", el).addEventListener("click", () => ctl.abort());
  (async () => {
    let final = null;
    try {
      const res = await fetch(path, { method: "POST", headers: { "X-Token": TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      if (!res.ok) { let d = {}; try { d = await res.json(); } catch (e) {} throw new Error(d.error || "Request failed (" + res.status + ")."); }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", err = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.t === "status") st.textContent = ev.text;
          else if (ev.t === "delta") { text += ev.text; out.textContent = text; st.textContent = "Writing"; }
          else if (ev.t === "done") final = ev;
          else if (ev.t === "error") err = ev.text;
        }
      }
      if (err) throw new Error(err);
      el.innerHTML = final && final.html ? `<div class="prose agent-out">${final.html}</div>` : `<div class="agent-text">${esc(text)}</div>`;
      typeset(el);
    } catch (e) {
      if (e.name === "AbortError") el.innerHTML = text ? `<div class="agent-text">${esc(text)}</div><p class="muted small">Stopped.</p>` : "";
      else el.innerHTML = `<div class="banner bad">${esc(e.message === "Failed to fetch" ? "The app's server is not running. Start it again with: python server.py" : e.message)}</div>`;
      final = null;
    }
    if (activeAgent === ctl) activeAgent = null;
    if (onDone) onDone(final, text);
  })();
  return ctl;
}

const noAgent = WEB ? `<div class="banner">The agent runs in the laptop version, with a model on your own GPU. Everything else on this page works here.</div>`
  : `<div class="banner">No local model is set up yet. <a href="#/settings">Set one up under Settings</a>: it takes one install and one download.</div>`;

/* ------------------------------------------------------------------ focus */

const Focus = {
  s: lsGet("lfz.focus", null),      // the running session: {id, kind, name, phase, start, planned, rest, intent, belled}
  meta: null,                       // techniques and options, from the server
  save() { if (this.s) lsSet("lfz.focus", this.s); else lsDel("lfz.focus"); },
  elapsed() { return Math.max(0, Math.round((Date.now() - this.s.start) / 1000)); },
  async load() { this.meta = await api("/api/focus"); return this.meta; },
};
const clock = t => { t = Math.max(0, Math.round(t)); return (t >= 3600 ? Math.floor(t / 3600) + ":" + String(Math.floor(t % 3600 / 60)).padStart(2, "0") : String(Math.floor(t / 60)).padStart(2, "0")) + ":" + String(t % 60).padStart(2, "0"); };

function beep(times) {
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < (times || 2); i++) {
      const o = C.createOscillator(), g = C.createGain(), t = C.currentTime + i * 0.4;
      o.frequency.value = 660; o.connect(g); g.connect(C.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.start(t); o.stop(t + 0.34);
    }
    setTimeout(() => C.close(), 2000);
  } catch (e) {}
}

function focusSignal(title, body) {
  const o = (Focus.meta && Focus.meta.options) || {};
  if (o.sound !== false) beep(2);
  try { if (o.notify && "Notification" in window && Notification.permission === "granted") new Notification(title, { body }); } catch (e) {}
}

function focusPanel(html) {
  const p = $("#focus-panel");
  if (!html) { p.hidden = true; p.innerHTML = ""; return; }
  p.innerHTML = html + `<button class="btn quiet close" data-close aria-label="Close">Close</button>`;
  p.hidden = false;
  $$("[data-close]", p).forEach(b => b.addEventListener("click", () => focusPanel(null)));
}

async function focusStart(kind, intent) {
  const meta = Focus.meta || await Focus.load();
  const k = meta.kinds.find(x => x.id === kind) || meta.kinds[1];
  const r = await api("/api/focus/start", { kind: k.id, intent: intent || "", ref: location.hash });
  Focus.s = { id: r.id, kind: k.id, name: k.name, phase: "work", start: Date.now(), planned: k.work * 60, rest: k.rest * 60, intent: intent || "", belled: false };
  Focus.save();
  focusPanel(null);
  focusDraw();
}

/* End the working part. `finished` says whether it ran its course. */
async function focusEndWork(finished, byBell) {
  const s = Focus.s;
  if (!s || s.phase !== "work") return;
  const secs = s.planned ? Math.min(Focus.elapsed(), s.kind === "start5" && s.belled ? 6 * 3600 : s.planned) : Focus.elapsed();
  const rest = s.kind === "flow" ? Math.max(120, Math.min(1200, Math.round(secs / 5))) : s.rest;
  const id = s.id, name = s.name, kind = s.kind, ask = !Focus.meta || Focus.meta.options.next !== false;
  if (finished && rest) { Focus.s = { id, kind, name, phase: "rest", start: Date.now(), planned: rest, rest: 0, intent: "" }; } else Focus.s = null;
  Focus.save();
  focusDraw();
  try { await api("/api/focus/end", { id, secs, done: !!finished }); } catch (e) { toast(e.message); }
  if (byBell) focusSignal("Focus session done", name + ": " + Math.round(secs / 60) + " minutes.");
  const mins = Math.max(1, Math.round(secs / 60));
  focusPanel(`<strong>${finished ? "Session done" : "Stopped"}: ${mins} ${mins === 1 ? "minute" : "minutes"}.</strong>`
    + (finished && rest ? `<p class="small muted">Break: ${Math.round(rest / 60)} minutes. Stand up and look at something far away.</p>` : "")
    + (ask ? `<label class="small" for="focus-note">Where do you pick up next time? One line.</label>
        <div class="row-flex"><input type="text" id="focus-note" maxlength="300" placeholder="Next step"><button class="btn primary" id="focus-note-save">Save</button></div>` : ""));
  const save = $("#focus-note-save");
  if (save) {
    const send = async () => { const v = $("#focus-note").value.trim(); if (v) { await api("/api/focus/note", { id, note: v }); toast("Saved. Today will show it when you come back."); } focusPanel(null); };
    save.addEventListener("click", send);
    $("#focus-note").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
    $("#focus-note").focus();
  }
  if (location.hash === "#/focus" || location.hash === "#/" || location.hash === "") route();
}

function focusTick() {
  const s = Focus.s;
  if (!s) return;
  const el = Focus.elapsed();
  if (s.phase === "work" && s.planned && el >= s.planned) {
    if (s.kind === "start5" && !s.belled) {
      s.belled = true; Focus.save();
      focusSignal("Five minutes done", "You have started. Stop here, or keep going.");
      focusPanel(`<strong>Five minutes done.</strong><p class="small">Starting was the hard part. Keep going for as long as it holds, or stop here: both count.</p>
        <div class="row-flex"><button class="btn primary" data-close>Keep going</button><button class="btn" id="focus-stop5">Stop here</button></div>`);
      $("#focus-stop5").addEventListener("click", () => focusEndWork(true, false));
    } else if (s.kind !== "start5") {
      focusEndWork(true, el < s.planned + 3 * 3600);     // after hours away, end it without a bell
      return;
    }
  }
  if (s.phase === "rest" && el >= s.planned) {
    const again = s.kind;
    Focus.s = null; Focus.save();
    focusSignal("Break over", "Ready for the next one?");
    focusPanel(`<strong>Break over.</strong><div class="row-flex"><button class="btn primary" id="focus-again">Start another ${esc(s.name)}</button></div>`);
    $("#focus-again").addEventListener("click", () => focusStart(again, ""));
  }
  focusDraw();
}

function focusDraw() {
  const pill = $("#focus-pill"), s = Focus.s;
  if (!s) {
    pill.innerHTML = `<a href="#/focus">Focus</a>`;
    pill.className = "focus-pill";
    document.title = "LLM From Zero";
    return;
  }
  const el = Focus.elapsed();
  const counting = !s.planned || (s.kind === "start5" && s.belled);
  const shown = clock(counting ? el : s.planned - el);
  pill.className = "focus-pill on " + s.phase;
  pill.innerHTML = `<span class="lbl">${s.phase === "rest" ? "Break" : esc(s.name)}</span><b class="time">${shown}</b>`
    + (s.intent ? `<span class="what">${esc(s.intent)}</span>` : "")
    + `<button class="btn" id="focus-stop">${s.phase === "rest" ? "Skip" : counting ? "Finish" : "Stop"}</button>`;
  document.title = shown + " · " + (s.phase === "rest" ? "Break" : "Focus");
  $("#focus-stop").addEventListener("click", () => {
    if (s.phase === "rest") { Focus.s = null; Focus.save(); focusPanel(null); focusDraw(); return; }
    focusEndWork(counting ? el >= 300 || s.kind === "start5" : el >= s.planned, false);
  });
}

async function focusPage() {
  const ticket = routeId;
  const d = await Focus.load();
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const o = d.options, mins = Math.round(d.today.secs / 60);
  const running = Focus.s && Focus.s.phase === "work";
  const kinds = d.kinds.map(k => `<label class="kind"><input type="radio" name="kind" value="${esc(k.id)}"${k.id === o.kind ? " checked" : ""}>
      <span class="stack"><strong>${esc(k.name)}</strong><span class="muted small">${esc(k.about)}</span></span></label>`).join("");
  const rows = d.today.sessions.filter(x => x.secs > 0).map(x => `<tr><td class="num">${new Date(x.ts * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</td><td>${esc(x.name)}</td>`
    + `<td class="num">${Math.round(x.secs / 60)} min</td><td>${x.done ? "finished" : "stopped early"}</td><td>${esc(x.intent || "")}${x.note ? `<br><span class="muted small">Next: ${esc(x.note)}</span>` : ""}</td></tr>`).join("");
  const stats = d.stats.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${t.started}</td><td class="num">${t.finished}</td><td class="num">${t.mins} min</td></tr>`).join("");
  const tog = (k, label, on) => `<label class="toggle"><input type="checkbox" data-opt="${k}"${on ? " checked" : ""}> ${label}</label>`;
  view.innerHTML = `
    <div class="stack"><h1>Focus</h1><p class="lede">One thing, for a fixed time, with the next step written down when you stop. Pick a technique, try it for a week, and let the numbers below say whether it suits you.</p></div>
    <section class="panel"><div class="head"><h2>${running ? "A session is running" : "Start a session"}</h2><span class="muted small">${mins} of ${o.goal} minutes today</span></div><div class="body stack">
      <div class="kinds">${kinds}</div>
      ${o.intent ? `<label for="intent">What is this session for? One thing.</label><input type="text" id="intent" maxlength="200" value="${esc(d.suggest)}">` : ""}
      <div class="row-flex"><button class="btn primary" id="go"${running ? " disabled" : ""}>Start</button>${running ? `<span class="muted">Stop the running session in the bar at the top first.</span>` : ""}</div>
    </div></section>
    ${rows ? `<section class="panel"><div class="head"><h2>Today</h2></div><div class="scroll-x"><table class="plain"><tbody>${rows}</tbody></table></div></section>` : ""}
    <section class="panel"><div class="head"><h2>Your numbers</h2><span class="muted small">last 14 days</span></div>
      <div class="scroll-x"><table class="plain"><thead><tr><th>Technique</th><th>Started</th><th>Finished</th><th>Time</th></tr></thead><tbody>${stats}</tbody></table></div>
      <div class="body muted small">${d.verdict ? esc(d.verdict) : "Once you have a few sessions with two techniques, this will say which one you finish most often."} All time: ${d.all.sessions} sessions, ${d.all.mins} minutes.</div>
    </section>
    <section class="panel"><div class="head"><h2>Things to try</h2></div><div class="body stack" id="opts">
      ${tog("intent", "Write what the session is for before it starts", o.intent)}
      ${tog("next", "At the end, write where to pick up next time. Today shows it when you come back", o.next)}
      ${tog("sound", "Play two soft tones at the end", o.sound)}
      ${tog("notify", "Show a desktop notification at the end", o.notify)}
      <div class="form-grid">
        <label for="goal">Minutes of focus to aim for each day</label><input type="text" inputmode="numeric" id="goal" class="narrow" value="${o.goal}">
        <label for="plan">One if-then plan, shown on Today</label><input type="text" id="plan" maxlength="200" placeholder="If it is 7 in the morning, then I open Today before anything else." value="${esc(o.plan)}">
      </div>
    </div></section>
    <details class="box"><summary>What the evidence says</summary><div class="prose">
      <p>Two experiments with university students compared break schedules. In the first (87 students, 2023), students given fixed breaks were less tired and more concentrated than students who chose their own, and got the same work done in less time. In the second (94 students, 2025), Pomodoro made tiredness rise faster than self-chosen breaks, and neither Pomodoro nor Flowtime changed how much work got done.</p>
      <p>So no schedule is proven best, and the honest answer is to find out which one you finish. That is what the table above is for.</p>
      <p>Three things have better support than any timer, and the app already does them: testing yourself instead of re-reading (the quiz and the rewrites from memory), spreading practice over days (the one-day, one-week, one-month schedule), and deciding in advance when and where you will start (the if-then plan above).</p>
      <p class="muted small">Sources: Biwer and others, British Journal of Educational Psychology, 2023. Smits, Wenzel and de Bruin, Behavioral Sciences, 2025.</p>
    </div></details>`;
  $("#go").addEventListener("click", async () => {
    const kind = ($('input[name="kind"]:checked') || {}).value || o.kind;
    try { await focusStart(kind, $("#intent") ? $("#intent").value.trim() : ""); route(); } catch (e) { toast(e.message); }
  });
  const setOpt = async (k, v) => { const r = await api("/api/focus/set", { k, v }); Focus.meta.options = r.options; };
  $$("[data-opt]").forEach(c => c.addEventListener("change", async () => {
    if (c.dataset.opt === "notify" && c.checked && "Notification" in window && Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { c.checked = false; toast("The browser did not allow notifications."); return; }
    }
    await setOpt(c.dataset.opt, c.checked ? "1" : "0"); toast("Saved.");
  }));
  $("#goal").addEventListener("change", async () => { await setOpt("goal", $("#goal").value); toast("Saved."); });
  $("#plan").addEventListener("change", async () => { await setOpt("plan", $("#plan").value); toast("Saved."); });
}

/* ------------------------------------------------------------------ reading shelf */

const STAGE_WORD = ["to read", "pass 1 done", "pass 2 done", "read three times"];
const readTabs = cur => `<div class="tabs"><a href="#/read"${cur === "read" ? ' aria-current="page"' : ""}>Shelf</a><a href="#/ask"${cur === "ask" ? ' aria-current="page"' : ""}>Ask your agent</a></div>`;

async function read(query) {
  const ticket = routeId;
  const params = new URLSearchParams(query || "");
  if (params.get("add")) {                     // arrived from a "Read here" link in a list
    view.innerHTML = `<p class="muted">Fetching the paper. This needs a connection.</p>`;
    try {
      const r = await api("/api/papers/add", { url: params.get("add"), title: params.get("title") || "" });
      if (ticket !== routeId) return;
      location.replace("#/paper/" + r.id);
    } catch (e) {
      if (ticket !== routeId) return;
      view.innerHTML = `<div class="banner bad">${esc(e.message)}</div><p><a class="btn" href="#/read">Open the shelf</a></p>`;
    }
    return;
  }
  const d = await api("/api/papers");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const rows = d.papers.map(p => `<li><span class="dot ${p.stage >= 3 ? "solved" : p.stage ? "open" : ""}"></span><a class="main" href="#/paper/${esc(p.id)}">${esc(p.title)}</a>`
    + `<span class="num">${p.pages ? p.pages + " pages" : ""}</span>${p.decision ? `<span class="chip">${esc(p.decision)}</span>` : ""}<span class="chip${p.stage >= 3 ? " ok" : ""}">${STAGE_WORD[p.stage]}</span></li>`).join("");
  view.innerHTML = `
    <div class="stack"><h1>Read</h1><p class="lede">Papers you are reading, kept ${WEB ? "in this browser" : "on this computer"}. Each one opens beside your notes, and is read three times: a ten-minute pass, a full pass, and a pass where you work out how to reproduce it.</p></div>
    ${readTabs("read")}
    <section class="panel"><div class="head"><h2>Add a paper</h2></div><div class="body stack">
      <div class="row-flex"><label class="btn" for="file">Upload a PDF</label><input type="file" id="file" accept="application/pdf,.pdf" class="visually-hidden">
        <span class="muted"${WEB ? " hidden" : ""}>or</span><input type="text" id="link" class="grow"${WEB ? " hidden" : ""} placeholder="Paste a link: arXiv, Hugging Face papers, or any address that ends in a PDF"><button class="btn primary" id="add"${WEB ? " hidden" : ""}>Fetch</button></div>
      <p class="muted small" id="add-msg">${WEB ? "The PDF stays in this browser. To read a paper you found online, download its PDF and upload it here." : "Fetching by link needs a connection. Uploading does not."}</p>
      ${d.can_extract || WEB ? "" : `<div class="banner">To let your agent read papers, install one small library and add the paper again: <code>pip install pypdf</code>. Reading and note-taking work without it.</div>`}
    </div></section>
    <section class="panel"><div class="head"><h2>Your shelf</h2><span class="muted small">${d.papers.length} ${d.papers.length === 1 ? "paper" : "papers"}</span></div>
      ${rows ? `<ul class="rows">${rows}</ul>` : `<div class="body muted">Nothing here yet. A good first one: ${WEB ? `pick a paper from <a href="#/lists/papers">the Papers list</a>, download its PDF, and upload it here.` : `<a href="#/lists/papers">the Papers list</a> has a "Read here" link beside each paper.`}</div>`}
    </section>`;
  const msg = $("#add-msg");
  const done = r => { location.hash = "#/paper/" + r.id; };
  $("#file").addEventListener("change", async () => {
    const f = $("#file").files[0];
    if (!f) return;
    msg.textContent = "Uploading " + f.name;
    try {
      const res = await fetch("/api/papers/upload?name=" + encodeURIComponent(f.name), { method: "POST", headers: { "X-Token": TOKEN, "Content-Type": "application/pdf" }, body: f });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || "Upload failed.");
      done(r);
    } catch (e) { msg.textContent = e.message; }
  });
  const fetchIt = async () => {
    const url = $("#link").value.trim();
    if (!url) return;
    msg.textContent = "Fetching";
    try { done(await api("/api/papers/add", { url })); } catch (e) { msg.textContent = e.message; }
  };
  $("#add").hidden = WEB;
  $("#add").addEventListener("click", fetchIt);
  $("#link").addEventListener("keydown", e => { if (e.key === "Enter") fetchIt(); });
}

async function paper(id) {
  const ticket = routeId;
  const d = await api("/api/paper?id=" + encodeURIComponent(id));
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  view.className = "wide";
  const n = d.notes;
  const area = (k, label, rows, hint) => `<label for="n-${k}">${label}</label><textarea id="n-${k}" data-k="${k}" rows="${rows}" placeholder="${esc(hint)}">${esc(n[k] || "")}</textarea>`;
  const textNote = d.status === "text" ? "" : !d.has_file ? `<div class="banner">The PDF is on another device. Upload it here first.</div>` : d.status === "scan"
    ? `<div class="banner">No text could be taken out of this PDF, so it is probably a scan. You can read and annotate it; the agent cannot read it.</div>`
    : `<div class="banner">To let your agent read this paper, install one small library and add the paper again: <code>pip install pypdf</code>.</div>`;
  view.innerHTML = `
    <div class="row-flex"><a class="btn quiet" href="#/read">Shelf</a><span class="chip" id="stage">${STAGE_WORD[d.stage]}</span><span class="num">${d.pages ? d.pages + " pages" : ""}</span></div>
    <input type="text" id="p-title" class="title-input" value="${esc(d.title)}" aria-label="Title">
    <div class="split paper">
      <div class="stack sticky">
        ${d.has_file ? `<iframe class="pdf" src="${WEB ? "about:blank" : esc(d.file)}" title="${esc(d.title)}"></iframe>`
          : `<div class="banner stack"><strong>The PDF of this paper is on another device.</strong><p>Your notes came across with your progress. To read the paper beside them, upload the same PDF here.</p>
             <div class="row-flex"><label class="btn primary" for="re-file">Upload the PDF</label><input type="file" id="re-file" accept="application/pdf,.pdf" class="visually-hidden"><span class="muted small" id="re-msg"></span></div></div>`}
        <p class="small"${d.has_file ? "" : " hidden"}><a href="${esc(d.file)}" id="pdf-tab" target="_blank" rel="noopener">Open the PDF in its own tab</a>${/^https?:/.test(d.source) ? ` &middot; <a href="${esc(d.source)}" target="_blank" rel="noopener">Where it came from</a>` : ""}</p>
      </div>
      <div class="stack">
        <section class="panel"><div class="head"><h2>Pass 1</h2><span class="muted small">ten minutes: title, abstract, figures, conclusion</span></div><div class="body stack">
          ${area("claim", "What do they claim, compared with what, and measured how? One or two lines, in your own words.", 3, "They claim that ... beats ... on ..., measured by ...")}
          <label for="n-decision">What is this paper worth to you?</label>
          <select id="n-decision" data-k="decision"><option value="">Not decided</option>${["skip", "keep an eye on", "read fully", "replicate"].map(x => `<option${n.decision === x ? " selected" : ""}>${x}</option>`).join("")}</select>
          <p class="muted small" id="p-recall">${d.recall ? recallLine(d.recall) : "Once your claim is written, this paper comes back under Recall: tomorrow, then in a week, then in a month."}</p>
        </div></section>
        <section class="panel"><div class="head"><h2>Pass 2</h2><span class="muted small">an hour: everything except the proofs</span></div><div class="body stack">
          ${area("method", "The method in your own words, as if explaining it to a classmate.", 5, "")}
          ${area("unclear", "What you did not understand. Be exact: which equation, which figure.", 3, "")}
        </div></section>
        <section class="panel"><div class="head"><h2>Pass 3</h2><span class="muted small">could you rebuild it?</span></div><div class="body stack">
          ${area("repro", "What would you need to reproduce one result: data, model size, the number to match?", 4, "")}
        </div></section>
        <section class="panel"><div class="head"><h2>Your agent</h2><span class="muted small">${d.agent ? esc(d.model) : ""}</span></div><div class="body stack" id="agent-box">
          ${!d.agent ? noAgent : textNote ? textNote : `
            <div class="row-flex"><button class="btn primary" id="sum-btn">${d.summary ? "Summarise again" : "Summarise"}</button><button class="btn" id="quiz-btn">Quiz me on it</button><span class="muted small" id="sum-note"></span></div>
            <div id="sum-out">${d.summary ? `<div class="prose agent-out">${d.summary}</div>` : ""}</div>
            <p class="muted small" id="sum-by"${d.summary ? "" : " hidden"}>Written by ${esc(d.summary_by || "a local model")} on your machine. It can be wrong: check each claim against the page it cites.</p>
            <div id="quiz-out"></div>
            <div class="stack" id="qa">${d.qa.map(x => `<div class="qa"><p class="q">${esc(x.q)}</p><div class="prose agent-out">${x.html}</div></div>`).join("")}</div>
            <div class="row-flex"><input type="text" id="q-in" class="grow" maxlength="2000" placeholder="Ask about this paper"><button class="btn" id="q-btn">Ask</button></div>`}
        </div></section>
        <div><button class="btn quiet" id="remove">Remove from the shelf</button></div>
      </div>
    </div>`;
  typeset(view);
  if (d.has_file && WEB) {                 // the PDF lives in this browser, so it is shown from memory
    fetch(d.file).then(r => r.blob()).then(b => {
      if (ticket !== routeId) return;
      const u = URL.createObjectURL(b);
      $("iframe.pdf").src = u;
      $("#pdf-tab").href = u;
    }).catch(() => {});
  }
  const reFile = $("#re-file");
  if (reFile) reFile.addEventListener("change", async () => {
    const f = reFile.files[0];
    if (!f) return;
    $("#re-msg").textContent = "Uploading";
    try {
      const res = await fetch("/api/papers/upload?name=" + encodeURIComponent(f.name), { method: "POST", headers: { "X-Token": TOKEN, "Content-Type": "application/pdf" }, body: f });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || "Upload failed.");
      if (r.id !== d.id) { $("#re-msg").textContent = "That is a different PDF from the one these notes belong to, so it was added to the shelf as a paper of its own."; return; }
      route();
    } catch (e) { $("#re-msg").textContent = e.message; }
  });
  let unlocked = d.unlocked;
  const lock = () => {
    const b = $("#sum-btn");
    if (!b) return;
    b.disabled = !unlocked;
    $("#sum-note").textContent = unlocked ? "" : "Unlocks when you have written your own claim under Pass 1. Your reading first, then the model's.";
  };
  lock();
  $$("[data-k]").forEach(el => el.addEventListener("change", async () => {
    try {
      const r = await api("/api/papers/note", { id: d.id, k: el.dataset.k, v: el.value });
      if (ticket !== routeId) return;
      $("#stage").textContent = STAGE_WORD[r.stage];
      if (r.recall) $("#p-recall").innerHTML = recallLine(r.recall);
      unlocked = r.unlocked; lock();
      toast("Saved.");
    } catch (e) { toast(e.message); }
  }));
  $("#p-title").addEventListener("change", async () => { await api("/api/papers/note", { id: d.id, k: "title", v: $("#p-title").value }); toast("Saved."); });
  let armed = false;
  $("#remove").addEventListener("click", async () => {
    const b = $("#remove");
    if (!armed) { armed = true; b.textContent = "Click again: this deletes the PDF and your notes on it"; setTimeout(() => { armed = false; b.textContent = "Remove from the shelf"; }, 4000); return; }
    await api("/api/papers/delete", { id: d.id });
    location.hash = "#/read";
  });
  if (!$("#sum-btn")) return;
  $("#sum-btn").addEventListener("click", () => {
    $("#sum-by").hidden = true;
    agentRun("/api/agent/summary", { paper: d.id }, $("#sum-out"), final => {
      if (ticket !== routeId || !final) return;
      $("#sum-by").hidden = false;
      $("#sum-by").textContent = "Written by " + (final.by || "a local model") + " on your machine. It can be wrong: check each claim against the page it cites.";
      $("#sum-btn").textContent = "Summarise again";
    });
  });
  $("#quiz-btn").addEventListener("click", () => {
    agentRun("/api/agent/quiz", { paper: d.id }, $("#quiz-out"), final => {
      if (ticket !== routeId || !final || !final.answers) return;
      $("#quiz-out").insertAdjacentHTML("beforeend", `<details class="box"><summary>Answers, after you have tried</summary><div class="prose">${final.answers}</div></details>`);
    });
  });
  const askIt = () => {
    const q = $("#q-in").value.trim();
    if (!q) return;
    $("#q-in").value = "";
    const box = document.createElement("div");
    box.className = "qa";
    box.innerHTML = `<p class="q">${esc(q)}</p><div class="a"></div>`;
    $("#qa").appendChild(box);
    agentRun("/api/agent/ask", { paper: d.id, q }, $(".a", box));
  };
  $("#q-btn").addEventListener("click", askIt);
  $("#q-in").addEventListener("keydown", e => { if (e.key === "Enter") askIt(); });
}

const askLog = [];     // the conversation on the Ask page, kept while the app stays open

async function ask() {
  const ticket = routeId;
  const cfg = await api("/api/agent");
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const draw = x => `<div class="qa"><p class="q">${esc(x.q)}</p><div class="a">${x.html ? `<div class="prose agent-out">${x.html}</div>` : ""}</div></div>`;
  view.innerHTML = `
    <div class="stack"><h1>Read</h1><p class="lede">Ask your own model to explain an idea. It is told to explain and to ask what you have tried, not to write solutions for you.</p></div>
    ${readTabs("ask")}
    ${!cfg.ready ? noAgent : `
      <div class="stack" id="qa">${askLog.map(draw).join("")}</div>
      <div class="row-flex"><input type="text" id="q-in" class="grow" maxlength="2000" placeholder="For example: why does a hash map look a key up in constant time?"><button class="btn primary" id="q-btn">Ask</button>
        <button class="btn quiet" id="q-clear"${askLog.length ? "" : " hidden"}>Start over</button></div>
      <p class="muted small">Answered by ${esc(cfg.model)} on your machine. A small model can be confidently wrong, so treat an answer as a lead to check, not as a fact.</p>`}`;
  typeset(view);
  if (!cfg.ready) return;
  const askIt = () => {
    const q = $("#q-in").value.trim();
    if (!q) return;
    $("#q-in").value = "";
    const item = { q, html: "", text: "" };
    const history = [];
    askLog.forEach(x => { if (x.text) { history.push({ role: "user", content: x.q }); history.push({ role: "assistant", content: x.text }); } });
    askLog.push(item);
    $("#qa").insertAdjacentHTML("beforeend", draw(item));
    $("#q-clear").hidden = false;
    agentRun("/api/agent/ask", { q, history }, $$("#qa .a").pop(), (final, text) => { if (final) { item.html = final.html; item.text = final.text || text; } });
  };
  $("#q-btn").addEventListener("click", askIt);
  $("#q-in").addEventListener("keydown", e => { if (e.key === "Enter") askIt(); });
  $("#q-clear").addEventListener("click", () => { askLog.length = 0; route(); });
}

/* ------------------------------------------------------------------ recall */

/* A box that asks for a note written from memory. `onSave(text)` may throw to show a message. */
function recallBox(el, prompt, onSave, onSkip) {
  el.innerHTML = `<div class="recall-box"><p class="rb-q">${esc(prompt)}</p><textarea rows="3" maxlength="4000" aria-label="${esc(prompt)}"></textarea>
    <div class="row-flex"><button class="btn primary" data-save>Save. It comes back tomorrow</button><button class="btn quiet" data-skip>Not this one</button><span class="muted small" data-msg></span></div></div>`;
  const ta = $("textarea", el), msg = $("[data-msg]", el);
  $("[data-save]", el).addEventListener("click", async () => {
    const v = ta.value.trim();
    if (v.length < 10) { msg.textContent = "Write at least a line."; ta.focus(); return; }
    try { await onSave(v); } catch (e) { msg.textContent = e.message; }
  });
  $("[data-skip]", el).addEventListener("click", onSkip);
  ta.focus({ preventScroll: true });
}

const recallLine = when => `In <a href="#/recall">Recall</a>: ${esc(when)}.`;
let lessonAsk = null;      // the lesson that was just marked as read, so its page opens the box

async function recall(query) {
  const ticket = routeId;
  const params = new URLSearchParams(query || "");
  const one = params.get("card");
  const d = await api("/api/recall" + (one ? "?card=" + encodeURIComponent(one) : params.get("more") ? "?more=1" : ""));
  if (ticket !== routeId) return;   // a newer page has been opened meanwhile
  const s = d.stats, w = s.week, queue = d.queue, tally = [0, 0, 0];
  let i = 0;
  const cards = d.cards.map(c => `<li><span class="dot ${c.kept ? "solved" : c.due ? "open" : ""}"></span><a class="main" href="#/recall?card=${c.id}">${esc(c.title)}</a>`
    + `<span class="chip">${esc(c.label)}</span>${c.last == null ? "" : `<span class="num">last time: ${["lost", "partly", "all of it"][c.last]}</span>`}<span class="num">${esc(c.when)}</span>`
    + `<button class="btn quiet" data-del="${c.id}">Remove</button></li>`).join("");
  view.innerHTML = `
    <div class="stack"><h1>Recall</h1><p class="lede">Close the source, write what you remember, then compare. What you had all of comes back after a day, then a week, then a month. A tick says you saw something. This says whether you still have it.</p></div>
    <div id="session"></div>
    <section class="panel"><div class="head"><h2>What you are keeping</h2></div><div class="body stack">
      <div class="meters">
        ${meter("After a week or more", w.all, w.tried, w.tried ? w.all + " of " + w.tried + " all there" : "nothing yet")}
        ${meter("Kept for a month", s.kept, s.cards, s.kept + " of " + s.cards)}
        ${meter("Today", Math.min(d.done_today, d.options.cap), d.options.cap, d.done_today + " of " + d.options.cap)}
      </div>
      <p class="muted small">${w.tried ? (w.parts ? w.parts + " more " + (w.parts === 1 ? "was" : "were") + " partly there. " : "") + "The first figure is the honest one: what was still there after a week or longer."
        : "The first figure fills in once a note is a week old. It is the honest measure of what stays."}</p>
    </div></section>
    <details class="box" id="own"><summary>Add something of your own</summary><div class="stack">
      <p class="muted small">A lecture, a bug you fixed, something a colleague explained. Write it from memory, not by copying.</p>
      <label for="o-title">What is it about?</label><input type="text" id="o-title" maxlength="200">
      <label for="o-note">What is worth keeping?</label><textarea id="o-note" rows="3" maxlength="4000"></textarea>
      <div class="row-flex"><button class="btn primary" id="o-save">Save. It comes back tomorrow</button><span class="muted small" id="o-msg"></span></div>
    </div></details>
    ${cards ? `<section class="panel"><div class="head"><h2>Everything in Recall</h2><span class="muted small">${s.cards} ${s.cards === 1 ? "note" : "notes"}. Open one to practise it early.</span></div><ul class="rows">${cards}</ul></section>` : ""}
    <section class="panel"><div class="head"><h2>Options</h2></div><div class="body stack">
      <div class="form-grid"><label for="cap">How many to ask for each day</label><input type="text" inputmode="numeric" id="cap" class="narrow" value="${d.options.cap}"></div>
      <label class="toggle"><input type="checkbox" id="ask"${d.options.ask ? " checked" : ""}> Ask for a note when I tick a video, a paper or an interview topic, and when I finish a lesson</label>
    </div></section>
    <details class="box"><summary>Why this is worth ten minutes a day</summary><div class="prose">
      <p>In one experiment, students either re-read a passage about fourteen times, or read it about three times and wrote down what they remembered. A week later the second group recalled 61% of it and the first 40%. Tested minutes after studying, the re-readers did better, which is why re-reading feels like it works.</p>
      <p>In another, with 200 students, one group recalled a text from memory and the other drew concept maps while looking at it. A week later the recall group scored about 50% higher.</p>
      <p>A 2013 review of ten study techniques rated two as high value: testing yourself, and spreading practice over time. Re-reading, highlighting and summarising were rated low.</p>
      <p>What this does not tell you: those studies used short texts, not a three-hour video on distributed systems. How much it does for you is what the "after a week or more" figure above will show.</p>
      <p class="muted small">Sources: Roediger and Karpicke, Psychological Science, 2006. Karpicke and Blunt, Science, 2011. Dunlosky and others, Psychological Science in the Public Interest, 2013.</p>
    </div></details>`;

  const sess = $("#session");
  const draw = () => {
    if (!queue.length) {
      sess.innerHTML = !s.cards
        ? `<section class="panel"><div class="head"><h2>Nothing here yet</h2></div><div class="body prose">
            <p>Notes arrive here in four ways:</p>
            <ul><li>Tick a row under <a href="#/lists/watch">Watch</a>, <a href="#/lists/video">Video 70</a>, <a href="#/lists/papers">Papers</a>, <a href="#/lists/frontier">Frontier</a> or <a href="#/lists/iv">Interview</a>, and write two or three lines from memory.</li>
            <li>Finish a <a href="#/learn">lesson</a> and write what it taught.</li>
            <li>Miss a question in the <a href="#/quiz">Quiz</a>. It comes back here as an open question, with no options to recognise.</li>
            <li>Write your claim for a paper on your <a href="#/read">shelf</a>. The paper comes back, checked against your own notes.</li></ul>
            <p>Each one returns the next day. You write again before you see what you wrote.</p></div></section>`
        : d.waiting
          ? `<div class="banner good"><strong>Today's ${d.options.cap} are done.</strong> ${d.waiting} more ${d.waiting === 1 ? "is" : "are"} due and will keep until tomorrow. <a href="#/recall?more=1">Do them now</a></div>`
          : `<div class="banner${d.done_today ? " good" : ""}"><strong>${d.done_today ? "Done for today." : "Nothing is due today."}</strong>${d.next ? " The next one is due " + esc(d.next) + "." : ""}</div>`;
      return;
    }
    const c = queue[i];
    sess.innerHTML = `<section class="panel recall"><div class="head"><h2>${one && c.when !== "due now" ? "Practising early" : (i + 1) + " of " + queue.length}</h2><span class="chip">${esc(c.label)}</span></div><div class="body stack">
        ${c.html ? `<div class="qtext">${c.html}</div>${c.code ? `<pre>${esc(c.code)}</pre>` : ""}` : `<h3>${esc(c.title)}</h3>`}
        <label for="r-text">${esc(c.prompt)}</label>
        <textarea id="r-text" rows="5" maxlength="4000"></textarea>
        <div class="row-flex" id="r-act"><button class="btn primary" id="r-check" disabled>Compare</button><button class="btn quiet" id="r-blank">I remember nothing</button>
          <span class="muted small">Write first. ${c.kind === "quiz" ? "The answer" : "Your earlier note"} stays hidden until you have.</span></div>
        <div class="stack" id="r-ref"></div>
      </div></section>`;
    typeset(sess);
    const ta = $("#r-text");
    ta.addEventListener("input", () => { $("#r-check").disabled = ta.value.trim().length < Math.max(c.least, c.kind === "quiz" ? 1 : 15); });
    const reveal = async blank => {
      let r;
      try { r = await api("/api/recall/check", { id: c.id }); } catch (e) { toast(e.message); return; }
      if (ticket !== routeId) return;
      const text = blank ? "" : ta.value.trim(), ref = r.ref;
      ta.readOnly = true;
      $("#r-act").hidden = true;
      const has = !!(ref.html || ref.parts.length);
      const body = ref.html ? `<div class="prose">${ref.html}</div>`
        : has ? ref.parts.map(p => (p[0] ? `<p class="muted small">${esc(p[0])}</p>` : "") + `<p class="own-text">${esc(p[1])}</p>`).join("")
        : `<p class="muted">There is no earlier note for this one.</p>`;
      const links = [c.link ? `<a href="${esc(c.link)}">Open it here</a>` : "", c.ext ? `<a href="${esc(c.ext)}" target="_blank" rel="noopener">Open the source</a>` : ""].filter(Boolean).join(" &middot; ");
      $("#r-ref").innerHTML = `
        <div class="ref"><h4>${esc(ref.head)}</h4>${body}${links ? `<p class="small">${links}</p>` : ""}</div>
        ${d.agent && !blank && has ? `<div class="row-flex"><button class="btn" id="r-agent">What did I miss?</button><span class="muted small">${esc(d.model)} compares the two texts. It is told to add nothing of its own.</span></div><div id="r-agent-out"></div>` : ""}
        <strong>How much of it did you have?</strong>
        <div class="row-flex">${blank ? "" : `<button class="btn" data-g="2">All of it</button><button class="btn" data-g="1">Parts of it</button>`}<button class="btn" data-g="0">Lost it</button></div>
        ${c.own && !blank ? `<label class="toggle small"><input type="checkbox" id="r-keep"> Keep today's version as my note from now on</label>` : ""}
        <p class="muted small">All of it: the wait grows, to a week, then a month. Parts of it: half the same wait again. Lost it: tomorrow.</p>`;
      typeset(sess);
      const ag = $("#r-agent");
      if (ag) ag.addEventListener("click", () => { ag.disabled = true; agentRun("/api/agent/recall", { id: c.id, text }, $("#r-agent-out"), () => { if (ticket === routeId && $("#r-agent")) $("#r-agent").disabled = false; }); });
      $$("[data-g]", sess).forEach(b => b.addEventListener("click", async () => {
        const grade = parseInt(b.dataset.g, 10);
        $$("[data-g]", sess).forEach(x => { x.disabled = true; });
        try {
          const g = await api("/api/recall/grade", { id: c.id, text, grade, keep: !!($("#r-keep") && $("#r-keep").checked) });
          if (ticket !== routeId) return;
          tally[grade]++;
          const back = g.kept ? "Kept for a month. It will not be asked again." : g.early ? "Noted. It was not due yet, so its date stays: " + g.when.replace(/^due /, "") + "." : "It comes back " + g.when.replace(/^due /, "") + ".";
          i++;
          if (i < queue.length) { toast(back); draw(); window.scrollTo(0, 0); return; }
          toast(queue.length > 1 ? "Done: " + tally[2] + " all there, " + tally[1] + " partly, " + tally[0] + " lost." : back);
          if (one) location.hash = "#/recall"; else route();
        } catch (e) { toast(e.message); $$("[data-g]", sess).forEach(x => { x.disabled = false; }); }
      }));
      $("#r-ref").scrollIntoView({ block: "nearest" });
    };
    $("#r-check").addEventListener("click", () => reveal(false));
    $("#r-blank").addEventListener("click", () => reveal(true));
  };
  draw();

  $("#o-save").addEventListener("click", async () => {
    try {
      await api("/api/recall/add", { kind: "own", title: $("#o-title").value, note: $("#o-note").value });
      toast("Saved. It comes back tomorrow.");
      route();
    } catch (e) { $("#o-msg").textContent = e.message; }
  });
  $$("[data-del]").forEach(b => {
    let armed = false;
    b.addEventListener("click", async () => {
      if (!armed) { armed = true; b.textContent = "Click again to remove"; setTimeout(() => { armed = false; b.textContent = "Remove"; }, 4000); return; }
      try { await api("/api/recall/delete", { id: b.dataset.del }); route(); } catch (e) { toast(e.message); }
    });
  });
  $("#cap").addEventListener("change", async () => { try { await api("/api/recall/set", { k: "cap", v: $("#cap").value }); toast("Saved."); route(); } catch (e) { toast(e.message); } });
  $("#ask").addEventListener("change", async () => { await api("/api/recall/set", { k: "ask", v: $("#ask").checked ? "1" : "0" }); toast("Saved."); });
}

/* ------------------------------------------------------------------ start */

/* The bar grows to two rows on a narrow window or while a timer runs. Things that stick below it follow its height. */
const barEl = $(".bar");
const setBar = () => document.documentElement.style.setProperty("--bar-h", barEl.offsetHeight + "px");
if (window.ResizeObserver) new ResizeObserver(setBar).observe(barEl); else window.addEventListener("resize", setBar);
setBar();

focusDraw();
setInterval(focusTick, 1000);
if (Focus.s) Focus.load().catch(() => {});
route();
