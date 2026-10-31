/* Learn: one Python exercise at a time (Stage 0 of LLM From Zero), 5 recall cards a day, the Radar, and the bookshelf. */
"use strict";

const EX = D.py.ex, QZ = D.py.quiz;
const BOX_DAYS = [0, 1, 2, 4, 8, 16];
const llmEx = id => ME.links.llm + "#/ex/" + id;
const llmLesson = id => ME.links.llm + "#/lesson/" + id;
const currentEx = () => EX.find(e => !S.learn.done[e.id]) || null;
const doneCount = () => EX.filter(e => S.learn.done[e.id]).length;

function learnPickLi() {
  const e = currentEx(), due = dueCards().length;
  if (!e) return `<div class="li"><span>🐍</span><div class="grow"><div class="t1">Stage 0 done 🎉 Next: NumPy</div><div class="t2">Continue in LLM From Zero</div></div><a class="btn sm" href="${esc(llmLesson("s1-01"))}" target="_blank" rel="noopener">Open ↗</a></div>`;
  return `<div class="li"><span aria-hidden="true">🐍</span><div class="grow"><div class="t1">Python ${doneCount() + 1}/${EX.length}: <button class="linkish" data-act="ex" data-arg="${esc(e.id)}">${esc(e.t)}</button></div>
    <div class="t2">${esc(e.unit)} · ${due} recall card${due === 1 ? "" : "s"} due · laptop for the code, phone for recall</div></div>
    <a class="btn sm" href="#learn">Learn</a></div>`;
}

/* ---- recall (Leitner boxes) */
function dueCards() {
  const ds = today(), out = [];
  let fresh = 0;
  const introduced = Object.keys(S.quiz).filter(k => S.quiz[k].first === ds).length;
  for (const q of QZ) {
    const c = S.quiz[q.id];
    if (c) { if (c.due <= ds) out.push(q); }
    else if (introduced + fresh < 3) { out.push(q); fresh++; }
  }
  return out.slice(0, 5);
}
let recallQ = null;
function answerCard(qid, i) {
  const q = QZ.find(x => x.id === qid), ok = i === q.a, ds = today();
  const c = S.quiz[qid] || { box: 0, first: ds };
  c.box = ok ? Math.min(5, c.box + 1) : 1;
  c.due = ymd(addDays(new Date(), ok ? BOX_DAYS[c.box] : 1));
  S.quiz[qid] = c; S.quizLog[ds] = (S.quizLog[ds] || 0) + 1; save(true);
  return ok;
}

function renderLearn() {
  const e = currentEx(), done = doneCount(), st = streak();
  let h = `<div class="stack">`;
  h += `<section class="card"><header><h2>Stage 0 · Python by hand</h2><span class="r mono">${done}/${EX.length}</span></header>${barHtml(done, EX.length, "good")}
    <p class="small muted">You asked to start tiny and get really good at Python before anything else. So this is the only track here until it's done. 🔥 ${st}-day streak (a day counts with 1 exercise or 5 recall cards).</p></section>`;
  if (e) {
    const hints = S.learn.hints[e.id] || 0;
    h += `<section class="card"><header><span class="lbl">Today's exercise · ${esc(e.unit)} · ${esc(e.d)}</span></header>
      <h2>${esc(e.t)}</h2><div class="prose">${e.st}</div>
      <pre><code>${esc(e.start)}</code></pre>
      ${e.tests.length ? `<details><summary>Tests it must pass</summary><pre><code>${e.tests.map(([t, x]) => esc(t) + "   # → " + esc(x)).join("\n")}</code></pre></details>` : ""}
      ${e.hints.slice(0, hints).map((x, i) => `<div class="note"><b>Hint ${i + 1}.</b> ${x}</div>`).join("")}
      <div class="row">
        <a class="btn pri" href="${esc(llmEx(e.id))}" target="_blank" rel="noopener">${PHONE ? "Open on the laptop ↗" : "Write it in LLM From Zero ↗"}</a>
        ${hints < e.hints.length ? `<button class="btn" data-act="hint" data-arg="${esc(e.id)}">Hint ${hints + 1} of ${e.hints.length}</button>` : ""}
        <button class="btn good" data-act="passed" data-arg="${esc(e.id)}">All tests pass ✓</button>
      </div>
      <p class="small muted">Rules: you type every line. Stuck for 20 minutes? Take a hint, or ask about the concept, never for the code. ${e.lesson ? `Lesson: <a href="${esc(llmLesson(e.lesson))}" target="_blank" rel="noopener">${esc((D.py.lessons.find(l => l.id === e.lesson) || {}).t || e.lesson)} ↗</a>` : ""}</p>
    </section>`;
  } else {
    h += `<section class="card"><h2>Stage 0 complete 🎉</h2><p>You wrote every Stage 0 function by hand. Next stages live in LLM From Zero:</p>
      <div class="list">${D.py.next.map(l => `<div class="li"><div class="grow">${esc(l.t)}</div><a class="btn sm" href="${esc(llmLesson(l.id))}" target="_blank" rel="noopener">Open ↗</a></div>`).join("")}</div></section>`;
  }
  // Recall
  const due = dueCards();
  h += `<section class="card"><header><h2>Recall</h2><span class="r small muted">${S.quizLog[today()] || 0} answered today</span></header>`;
  if (!due.length) h += `<p class="empty">No cards due. Back tomorrow.</p>`;
  else {
    const q = recallQ && due.find(x => x.id === recallQ.id) ? recallQ : { id: due[0].id, ans: null };
    recallQ = q;
    const c = QZ.find(x => x.id === q.id);
    h += `<p class="small muted">${due.length} due · phone-friendly</p><p><b>${esc(c.q)}</b></p>${c.code ? `<pre><code>${esc(c.code)}</code></pre>` : ""}
      <div class="quiz">${c.o.map((o, i) => `<button class="opt ${q.ans != null ? (i === c.a ? "right" : i === q.ans ? "wrong" : "") : ""}" data-act="recall" data-arg="${i}" ${q.ans != null ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
      ${q.ans != null ? `<div class="note">${q.ans === c.a ? "Right. " : "Not quite. "}${c.e}</div><div class="row"><button class="btn pri" data-act="recallnext">Next card</button></div>` : ""}`;
  }
  h += `</section>`;
  h += radarHtml();
  h += shelfHtml();
  h += `<section class="card flat"><header><h3>Everything else stays in the library</h3></header><p class="small muted">LLM From Zero still has the full build, DSA, ML problems and papers. Open it on the laptop when Stage 0 is done, not before. <a href="${esc(ME.links.llm)}" target="_blank" rel="noopener">LLM From Zero ↗</a></p></section>`;
  h += `</div>`;
  return h;
}
function exSheet(id) {
  const e = EX.find(x => x.id === id); if (!e) return;
  location.hash = "#learn"; closeLayer();
}
function passEx(id) {
  S.learn.done[id] = Date.now(); save();
  const e = EX.find(x => x.id === id);
  openSheet("Passed: " + e.t, `<p>Nice. Here's the reference solution to compare with yours. If yours is longer, ask yourself what each extra line buys.</p>
    <pre><code>${esc(e.sol)}</code></pre>${e.why ? `<div class="note">${e.why}</div>` : ""}
    <div class="row"><button class="btn pri" data-act="close">Done</button></div>`);
  render();
}

/* ---- Radar: fresh things in your topics, fetched straight from free public sources */
const DEFAULT_TOPICS = [
  { q: "federated learning vehicular", l: "FL for vehicles (your research)" },
  { q: "communication-efficient federated learning edge devices", l: "Efficient FL on edge hardware" },
  { q: "small language model training from scratch", l: "LLMs from scratch" },
  { q: "cardiac MRI segmentation", l: "Cardiac MRI segmentation (Philips)" },
  { q: "retrieval augmented generation agents", l: "RAG and agents (interviews)" },
  { q: "algorithmic trading NSE India", l: "Algo trading (India)" }
];
const EVERGREEN = [
  { t: "CS50's Introduction to Programming with Python (Harvard, free)", k: "Course · Stage 0", u: "https://cs50.harvard.edu/python/" },
  { t: "The Joy of Computing using Python (NPTEL)", k: "Course · Stage 0", u: "https://nptel.ac.in/courses/106106182" },
  { t: "Python for Data Analysis, 3rd ed. (free online)", k: "Textbook · Stage 0–1", u: "https://wesmckinney.com/book/" },
  { t: "Neural Networks: Zero to Hero (Andrej Karpathy)", k: "Video course · Stage 2–4", u: "https://karpathy.ai/zero-to-hero.html" },
  { t: "Stanford CS336: Language Modeling from Scratch", k: "Course · Stage 4–5", u: "https://stanford-cs336.github.io/" },
  { t: "Flower: federated learning tutorials", k: "Docs · your FL testbed", u: "https://flower.ai/docs/" },
  { t: "Zerodha Varsity (free)", k: "Course · trading", u: "https://zerodha.com/varsity/" }
];
const topics = () => S.radar.topics || DEFAULT_TOPICS;
async function jget(url, opts) { const r = await fetch(url, Object.assign({ cache: "no-store" }, opts || {})); if (!r.ok) throw new Error(r.status + " from " + new URL(url).host); return r.json(); }
async function radarRefresh() {
  const items = [], errs = [], since90 = ymd(addDays(new Date(), -150)), since30 = ymd(addDays(new Date(), -30)), weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  toast("Fetching the Radar…");
  const jobs = [];
  jobs.push(jget("https://huggingface.co/api/daily_papers?limit=30").then(arr => {
    arr.map(x => ({ id: "hf:" + (x.paper && x.paper.id), t: (x.paper && x.paper.title) || x.title, u: "https://huggingface.co/papers/" + (x.paper && x.paper.id), src: "Hugging Face daily papers", topic: "AI today", score: (x.paper && x.paper.upvotes) || 0, kind: "paper", meta: ((x.paper && x.paper.upvotes) || 0) + " upvotes" }))
      .sort((a, b) => b.score - a.score).slice(0, 6).forEach(x => items.push(x));
  }).catch(e => errs.push("Hugging Face: " + e.message)));
  for (const tp of topics()) {
    jobs.push(jget("https://api.openalex.org/works?search=" + encodeURIComponent(tp.q) + "&filter=from_publication_date:" + since90 + "&sort=cited_by_count:desc&per-page=4&select=id,title,publication_date,cited_by_count,primary_location,doi").then(j => {
      (j.results || []).forEach(w => {
        const src = w.primary_location && w.primary_location.source ? w.primary_location.source.display_name : "";
        items.push({ id: "oa:" + w.id, t: w.title, u: w.doi || (w.primary_location && w.primary_location.landing_page_url) || w.id, src: src || "OpenAlex", topic: tp.l, score: w.cited_by_count, kind: /arxiv/i.test(src) ? "preprint" : "paper", meta: w.publication_date + " · cited " + w.cited_by_count + (src ? " · " + src : "") });
      });
    }).catch(e => errs.push("OpenAlex: " + e.message)));
    jobs.push(jget("https://api.github.com/search/repositories?q=" + encodeURIComponent(tp.q) + "+pushed:%3E" + since30 + "&sort=stars&order=desc&per_page=3").then(j => {
      (j.items || []).forEach(r => items.push({ id: "gh:" + r.full_name, t: r.full_name + (r.description ? ": " + r.description : ""), u: r.html_url, src: "GitHub", topic: tp.l, score: r.stargazers_count, kind: "repo", meta: "★ " + r.stargazers_count + " · pushed " + r.pushed_at.slice(0, 10) }));
    }).catch(e => errs.push("GitHub: " + e.message)));
  }
  for (const q of ["LLM", "federated learning", "Python"]) {
    jobs.push(jget("https://hn.algolia.com/api/v1/search?query=" + encodeURIComponent(q) + "&tags=story&numericFilters=created_at_i%3E" + weekAgo + ",points%3E40&hitsPerPage=4").then(j => {
      (j.hits || []).forEach(x => items.push({ id: "hn:" + x.objectID, t: x.title, u: x.url || "https://news.ycombinator.com/item?id=" + x.objectID, src: "Hacker News", topic: "Blogs and discussion · " + q, score: x.points, kind: "blog", meta: x.points + " points · " + (x.num_comments || 0) + " comments" }));
    }).catch(e => errs.push("Hacker News: " + e.message)));
  }
  await Promise.all(jobs);
  const seen = new Set();
  LOC.radar = { at: Date.now(), items: items.filter(x => x.t && !seen.has(x.id) && seen.add(x.id)), errs: [...new Set(errs)].slice(0, 4) };
  saveLoc(); render();
  toast(items.length ? "Radar: " + items.length + " items." : "Radar couldn't reach the sources (offline?).");
}
let radarFilter = "all";
function radarHtml() {
  const R0 = LOC.radar, saved = Object.values(S.radar.saved);
  let h = `<section class="card"><header><h2>📡 Radar</h2><span class="r small muted">${R0 ? "updated " + new Date(R0.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not fetched yet"}</span></header>
    <p class="small muted">What's moving in your topics: papers and journals (OpenAlex), today's top AI papers (Hugging Face), repos (GitHub) and blog posts (Hacker News). Fetched straight from the sources; no AI, no subscription. Save what you'll read in a research or book block.</p>
    <div class="row"><button class="btn pri sm" data-act="radar">${R0 ? "Refresh" : "Fetch now"}</button><button class="btn sm" data-act="topics">Topics</button>
      <div class="seg" role="group" aria-label="Show">${[["all", "All"], ["paper", "Papers"], ["repo", "Repos"], ["blog", "Blogs"], ["saved", "Saved " + saved.length]].map(([k, l]) => `<button aria-pressed="${radarFilter === k}" data-act="rfilter" data-arg="${k}">${l}</button>`).join("")}</div></div>`;
  let list = radarFilter === "saved" ? saved : (R0 ? R0.items : []);
  if (radarFilter === "paper") list = list.filter(x => x.kind === "paper" || x.kind === "preprint");
  else if (["repo", "blog"].includes(radarFilter)) list = list.filter(x => x.kind === radarFilter);
  list = list.filter(x => !S.radar.done[x.id] || radarFilter === "saved");
  if (list.length) {
    const byTopic = {};
    list.forEach(x => (byTopic[x.topic] = byTopic[x.topic] || []).push(x));
    h += Object.entries(byTopic).map(([tp, xs]) => `<details ${radarFilter !== "all" ? "open" : ""}><summary>${esc(tp)} <span class="small muted">· ${xs.length}</span></summary><div class="list">${xs.slice(0, 8).map(x => `<div class="li"><div class="grow">
      <div class="t1"><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a></div><div class="t2">${esc(x.src)} · ${esc(x.meta)}</div></div>
      <div class="row" style="flex-wrap:nowrap">${S.radar.saved[x.id] ? `<button class="btn sm" data-act="rdone" data-arg="${esc(x.id)}" title="Read it">✓</button>` : `<button class="btn sm" data-act="rsave" data-arg="${esc(x.id)}" title="Save for a reading block">＋</button>`}</div></div>`).join("")}</div></details>`).join("");
  } else h += `<p class="empty">${radarFilter === "saved" ? "Nothing saved yet." : R0 ? "Nothing here." : "Tap Fetch now (needs internet)."}</p>`;
  if (R0 && R0.errs && R0.errs.length) h += `<p class="small muted">Couldn't reach: ${esc(R0.errs.join("; "))}</p>`;
  h += `<details><summary>Evergreen: courses and textbooks for your stage</summary><div class="list">${EVERGREEN.map(x => `<div class="li"><div class="grow"><div class="t1"><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a></div><div class="t2">${esc(x.k)}</div></div></div>`).join("")}</div></details>`;
  h += `</section>`;
  return h;
}
function radarSave(id) {
  const x = (LOC.radar && LOC.radar.items.find(i => i.id === id)); if (!x) return;
  S.radar.saved[id] = Object.assign({ savedAt: Date.now() }, x); save(); render();
}
function radarDone(id) { S.radar.done[id] = Date.now(); delete S.radar.saved[id]; save(); render(); }
function topicsSheet() {
  openSheet("Radar topics", `<p class="small muted">One topic per line: the search words, then a | and a label (optional).</p>
    <textarea id="topicsTa" style="min-height:180px">${esc(topics().map(t => t.q + (t.l && t.l !== t.q ? " | " + t.l : "")).join("\n"))}</textarea>
    <div class="row"><button class="btn pri" data-act="topicssave">Save</button><button class="btn" data-act="topicsreset">Reset</button></div>`);
}

/* ---- Bookshelf: one technical and one non-technical at a time */
const shelf = () => S.shelf || window.OS_BOOKS;
function shelfHtml() {
  const B = shelf(), cur = k => B.find(b => b.kind === k && !(S.books[b.id] && S.books[b.id].done) && !b.next) || B.find(b => b.kind === k && !(S.books[b.id] && S.books[b.id].done));
  const row = b => {
    if (!b) return "";
    const s = S.books[b.id] || { page: 0 }, pct = b.pages ? Math.round(100 * s.page / b.pages) : 0;
    return `<div class="li"><span aria-hidden="true">${b.kind === "tech" ? "📘" : "📖"}</span><div class="grow"><div class="t1">${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.t)}</a>` : esc(b.t)}</div>
      <div class="t2">${b.kind === "tech" ? "Technical · Wed and Sun book blocks" : "Non-technical · every night 22:00, instead of the phone"} · page ${s.page || 0}${b.pages ? " of " + b.pages + " (" + pct + "%)" : ""}</div>${b.pages ? barHtml(s.page || 0, b.pages, "good") : ""}<div class="t2">${esc(b.note || "")}</div></div>
      <button class="btn sm" data-act="bookpage" data-arg="${esc(b.id)}">Page</button></div>`;
  };
  return `<section class="card"><header><h2>Bookshelf</h2><button class="r linkish small" data-act="shelfedit">Edit shelf</button></header>
    <div class="list">${row(cur("tech"))}${row(cur("fun"))}</div>
    <details><summary>Up next and finished</summary><div class="list">${B.map(b => `<div class="li"><div class="grow"><div class="t1">${esc(b.t)}</div><div class="t2">${b.kind === "tech" ? "Technical" : "Non-technical"}${S.books[b.id] && S.books[b.id].done ? " · finished " + ymd(new Date(S.books[b.id].done)) : ""}</div></div>
      ${S.books[b.id] && S.books[b.id].done ? "" : `<button class="btn sm" data-act="bookdone" data-arg="${esc(b.id)}">Finished</button>`}</div>`).join("")}</div></details>
    <p class="small muted">The suggestions are a start, not a syllabus: swap in anything you actually want to read.</p></section>`;
}
