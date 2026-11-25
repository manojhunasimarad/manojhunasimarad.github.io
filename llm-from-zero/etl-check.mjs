// "Check what you know" for the ETL project: one screen per topic on the whole-project path, in
// study order. Each topic shows what it covers, 1-3 multiple-choice questions with instant feedback,
// an explain-it-yourself question with a self-rating, and a suggestion: skip it or study it.
// Choosing "skip" marks the topic known on the ETL page (lfz-etl-v1), so it drops out of the plan.

export const CHECK_KEY = "lfz-etl-check-v1";
export const ETL_KEY = "lfz-etl-v1";
const DEFAULT_CHECK_KEY = CHECK_KEY, DEFAULT_KNOWN_KEY = ETL_KEY;
const RATES = [["knew", "I knew it"], ["partly", "Partly"], ["new", "New to me"]];

/** Topics of the whole project in study order, with the step that first needs each and its questions. */
export function checkTopics(graph, etl, quiz, E, recommendedTopic, group) {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const order = E.planFor(graph, etl.whole.targets, new Map()).order;
  const firstStep = new Map();
  for (const s of [...etl.steps].sort((a, b) => a.n - b.n))
    for (const id of E.closure(graph, s.targets)) if (!firstStep.has(id)) firstStep.set(id, s.n);
  // the order of the overview: by the step that first needs a topic, study order within a step
  const stepOf = id => firstStep.get(id) || 99;
  return order.map((id, i) => [id, i]).sort((a, b) => stepOf(a[0]) - stepOf(b[0]) || a[1] - b[1]).map(([id]) => {
    const node = byId.get(id);
    const max = node.group === (group || "Data engineering") ? 3 : 2;
    return { id, node, step: firstStep.get(id) || null, questions: quiz.questions.filter(q => recommendedTopic(q) === id).slice(0, max) };
  });
}

/** What the answers so far suggest for one topic: "skip", "study" or null (not enough answers yet). */
export function suggest(topic, rec = {}) {
  const answers = rec.answers || {};
  const total = topic.questions.length;
  const answered = topic.questions.filter(q => q.id in answers).length;
  const right = topic.questions.filter(q => answers[q.id] === q.answer).length;
  const rate = rec.rate || null;
  if (total) {
    if (answered < total && !rate) return { kind: null, right, answered, total };
    if (answered < total) return { kind: rate === "knew" ? "skip" : "study", right, answered, total };
    if (right === total && rate !== "new" && rate !== "partly") return { kind: "skip", right, answered, total };
    return { kind: "study", right, answered, total };
  }
  if (!rate) return { kind: null, right, answered, total };
  return { kind: rate === "knew" ? "skip" : "study", right, answered, total };
}

export function mountCheck(view, ctx, query) {
  const { graph, etl, quiz, E, recommendedTopic, lsGet, lsSet, esc } = ctx;
  // the ETL project by default; a resume project passes its own keys, route and name
  const CHECK_KEY = ctx.checkKey || DEFAULT_CHECK_KEY, ETL_KEY = ctx.knownKey || DEFAULT_KNOWN_KEY;
  const BASE = ctx.base || "#/etl", NAME = ctx.name || "ETL project";
  const topics = checkTopics(graph, etl, quiz, E, recommendedTopic, ctx.group);
  const idx = new Map(topics.map((t, i) => [t.id, i]));
  const stepTitle = new Map(etl.steps.map(s => [s.n, s.title]));
  const lessonTitle = new Map(((ctx.course && ctx.course.lessons) || []).map(l => [l.id, l.title]));
  const exTitle = ctx.exTitle || (id => id);
  const params = new URLSearchParams(query || "");
  const current = params.get("t");
  let recs = lsGet(CHECK_KEY, {});
  if (!recs || typeof recs !== "object") recs = {};

  const save = () => lsSet(CHECK_KEY, recs);
  const known = () => { const s = lsGet(ETL_KEY, {}); return new Set(Array.isArray(s.known) ? s.known : []); };
  const setKnown = (id, on) => {
    const s = lsGet(ETL_KEY, {}), k = new Set(Array.isArray(s.known) ? s.known : []);
    if (on) k.add(id); else k.delete(id);
    lsSet(ETL_KEY, { ...s, known: [...k], updated: Date.now() });
  };
  const decision = id => (recs[id] && recs[id].decision) || null;
  const stepLabel = t => t.step ? `Step ${t.step}` : "Whole project";
  const hours = ids => ids.reduce((s, id) => s + (topics[idx.get(id)].node.hours || 0), 0);
  const firstOpen = () => topics.find(t => !decision(t.id));

  if (current && idx.has(current)) topicScreen(topics[idx.get(current)]);
  else overview();

  function overview() {
    const skip = topics.filter(t => decision(t.id) === "skip").map(t => t.id);
    const study = topics.filter(t => decision(t.id) === "study").map(t => t.id);
    const done = skip.length + study.length;
    const nq = topics.reduce((s, t) => s + t.questions.length, 0);
    const next = firstOpen();
    const pct = Math.round(100 * done / topics.length);
    const groups = [];
    for (const t of topics) {
      const key = t.step || 99;
      let g = groups.find(x => x.key === key);
      if (!g) groups.push(g = { key, title: t.step ? `Step ${t.step}: ${stepTitle.get(t.step)}` : "Bringing it together", items: [] });
      g.items.push(t);
    }
    groups.sort((a, b) => a.key - b.key);
    const chip = id => decision(id) === "skip" ? `<span class="chip ok">skip</span>` : decision(id) === "study" ? `<span class="chip medium">study</span>` : `<span class="chip">not checked</span>`;
    view.innerHTML = `
      <div class="stack"><p class="small muted"><a href="${BASE}">← ${esc(NAME)}</a></p><h1>Check what you know</h1>
        <p class="lede">${topics.length} topics stand between you and the whole ${esc(NAME)}. For each one: read what it covers, answer ${nq ? "1 to 3 quick questions" : "a question"}, rate yourself, then <strong>skip it</strong> or <strong>study it</strong>. What you skip drops out of your study plan. About 15 minutes for all of them; stop and continue any time.</p></div>
      <section class="panel"><div class="body stack">
        <div class="meter"><div class="top"><span class="name">Checked</span><span class="num">${done} of ${topics.length} topics</span></div><div class="track"><i style="width:${pct}%"></i></div></div>
        <div class="chk-sum"><div><b>${skip.length}</b><span>to skip · saves ~${hours(skip)} h</span></div><div><b>${study.length}</b><span>to study · ~${hours(study)} h</span></div><div><b>${topics.length - done}</b><span>not checked yet</span></div></div>
        <div class="row-flex">${next ? `<a class="btn primary big" href="${BASE}/check?t=${esc(next.id)}">${done ? "Continue the check" : "Start the check"} →</a>` : `<span class="banner good">All topics checked.</span>`}
          <a class="btn big" href="${BASE}?goal=whole">See my study plan</a>
          ${done ? `<button type="button" class="btn quiet" id="chk-reset">Start over</button>` : ""}</div>
      </div></section>
      <h2 class="chk-h">What's inside, step by step</h2>
      <p class="muted small">Tap a topic to check just that one. Each line shows the questions it has and the study time if you need it.</p>
      ${groups.map(g => `<section class="panel"><div class="head"><h2>${esc(g.title)}</h2></div><ul class="rows chk-list">${g.items.map(t => `
        <li><a class="main" href="${BASE}/check?t=${esc(t.id)}"><span class="t">${esc(t.node.title)}</span><span class="s">${esc(t.node.summary)}</span></a>
          <span class="meta">${t.questions.length ? `<span class="chip">${t.questions.length} MCQ</span>` : `<span class="chip">explain</span>`}<span class="num">~${t.node.hours} h</span>${chip(t.id)}</span></li>`).join("")}</ul></section>`).join("")}`;
    const r = view.querySelector("#chk-reset");
    if (r) r.addEventListener("click", () => {
      if (!confirmReset()) return;
      const k = known();
      for (const t of topics) if (decision(t.id) === "skip") k.delete(t.id);
      const s = lsGet(ETL_KEY, {}); lsSet(ETL_KEY, { ...s, known: [...k], updated: Date.now() });
      recs = {}; save(); overview();
    });
  }

  function confirmReset() {
    const b = view.querySelector("#chk-reset");
    if (b.dataset.armed) return true;
    b.dataset.armed = "1"; b.textContent = "Tap again to clear your answers"; b.classList.add("danger");
    return false;
  }

  function topicScreen(t) {
    const i = idx.get(t.id), n = t.node, rec = recs[t.id] || {}, answers = rec.answers || {};
    const sug = suggest(t, rec);
    const prev = topics[i - 1], next = topics[i + 1];
    const keys = "ABCD";
    const qHtml = t.questions.map((q, qi) => {
      const chosen = answers[q.id];
      const has = chosen !== undefined;
      const opts = q.options.map((o, oi) => {
        const cls = has ? (oi === q.answer ? " right" : oi === chosen ? " wrong" : "") : "";
        return `<button type="button" class="opt${cls}" data-q="${esc(q.id)}" data-o="${oi}"${has ? " disabled" : ""}><span class="key">${keys[oi]}</span><span>${o}</span></button>`;
      }).join("");
      const fb = has ? `<div class="banner ${chosen === q.answer ? "good" : "bad"}"><strong>${chosen === q.answer ? "Right." : "Not quite. The answer is " + keys[q.answer] + "."}</strong> ${q.explain}</div>` : "";
      return `<div class="chk-q"><p class="qn">Question ${qi + 1} of ${t.questions.length}</p><p class="qq">${q.q}</p>${q.code ? `<pre><code>${esc(q.code)}</code></pre>` : ""}<div class="opts">${opts}</div>${fb}</div>`;
    }).join("");
    const lessons = (n.lessons || []).map(l => `<a href="#/lesson/${esc(l)}">${esc(lessonTitle.get(l) || l)}</a>`).join(" · ");
    const practice = (n.practice || []).map(id => `<a href="#/ex/${esc(id)}">${esc(exTitle(id))}</a>`).join(" · ");
    const dec = decision(t.id);
    const sugText = sug.kind === "skip"
      ? `<strong>Suggestion: skip it.</strong> ${sug.total ? `You got ${sug.right} of ${sug.total} right` : "You rated yourself as knowing it"}${sug.total && rec.rate === "knew" ? " and you knew the explanation" : ""}.`
      : sug.kind === "study"
        ? `<strong>Suggestion: study it</strong> (~${n.hours} h). ${sug.total ? `You got ${sug.right} of ${sug.total} right${sug.answered < sug.total ? " so far" : ""}` : ""}${rec.rate ? `${sug.total ? " and" : "You"} rated it “${RATES.find(r => r[0] === rec.rate)[1].toLowerCase()}”` : ""}.`
        : `Answer the question${t.questions.length > 1 ? "s" : ""} above${t.questions.length ? " or rate yourself" : ""} to get a suggestion. You can also decide straight away.`;
    view.innerHTML = `
      <div class="chk-bar"><a href="${BASE}/check">← All topics</a><span class="num">Topic ${i + 1} of ${topics.length}</span></div>
      <div class="track chk-track"><i style="width:${Math.round(100 * (i + 1) / topics.length)}%"></i></div>
      <div class="stack"><h1>${esc(n.title)}</h1>
        <div class="row-flex"><span class="chip">${esc(stepLabel(t))}</span><span class="chip">~${n.hours} h to study</span><span class="chip">${esc(n.difficulty || "")}</span>${dec ? `<span class="chip ${dec === "skip" ? "ok" : "medium"}">decided: ${dec}</span>` : ""}</div></div>
      <section class="panel"><div class="head"><h2>What it covers</h2></div><div class="body stack">
        <p>${esc(n.summary)}</p>
        ${t.step ? `<p class="muted small">First needed in Step ${t.step}: ${esc(stepTitle.get(t.step))}.</p>` : ""}
        ${lessons ? `<p class="small"><strong>Lesson:</strong> ${lessons}</p>` : ""}
        ${practice ? `<p class="small"><strong>Practice (${n.practice.length}):</strong> ${practice}</p>` : ""}
      </div></section>
      ${t.questions.length ? `<section class="panel"><div class="head"><h2>Quick questions</h2><span class="num">${sug.answered} of ${sug.total} answered</span></div><div class="body stack">${qHtml}</div></section>` : ""}
      <section class="panel"><div class="head"><h2>Explain it in your own words</h2></div><div class="body stack">
        <p class="qq">${esc(n.question)}</p>
        <p class="muted small">Say your answer out loud or in your head first, then compare.</p>
        <details class="chk-ans"${rec.shown ? " open" : ""}><summary>Show the answer</summary><p>${esc(n.answer)}</p></details>
        <p class="small"><strong>How well did you know it?</strong></p>
        <div class="seg3">${RATES.map(([k, label]) => `<button type="button" class="btn${rec.rate === k ? " primary" : ""}" data-rate="${k}" aria-pressed="${rec.rate === k}">${label}</button>`).join("")}</div>
      </div></section>
      <section class="panel chk-verdict ${sug.kind || ""}"><div class="body stack">
        <p>${sugText}</p>
        <div class="seg2">
          <button type="button" class="btn big${sug.kind === "skip" || dec === "skip" ? " primary" : ""}" data-decide="skip">Skip it: I know this</button>
          <button type="button" class="btn big${sug.kind === "study" || dec === "study" ? " primary" : ""}" data-decide="study">Study it</button>
        </div>
        <p class="muted small">Skip marks it known on your ${esc(NAME)} study plan. You can change it any time.</p>
      </div></section>
      <div class="chk-nav">${prev ? `<a class="btn" href="${BASE}/check?t=${esc(prev.id)}">← ${esc(prev.node.title)}</a>` : `<span></span>`}${next ? `<a class="btn" href="${BASE}/check?t=${esc(next.id)}">${esc(next.node.title)} →</a>` : `<a class="btn" href="${BASE}/check">Finish →</a>`}</div>`;

    const redraw = () => { const y = window.scrollY; topicScreen(t); window.scrollTo(0, y); };
    view.querySelectorAll("[data-o]").forEach(b => b.addEventListener("click", () => {
      const r = recs[t.id] = recs[t.id] || {};
      r.answers = { ...(r.answers || {}), [b.dataset.q]: Number(b.dataset.o) };
      save(); redraw();
    }));
    view.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => {
      const r = recs[t.id] = recs[t.id] || {};
      r.rate = b.dataset.rate; r.shown = true; save(); redraw();
    }));
    const det = view.querySelector(".chk-ans");
    det.addEventListener("toggle", () => { const r = recs[t.id] = recs[t.id] || {}; r.shown = det.open; save(); });
    view.querySelectorAll("[data-decide]").forEach(b => b.addEventListener("click", () => {
      const r = recs[t.id] = recs[t.id] || {};
      r.decision = b.dataset.decide; r.at = Date.now(); save();
      setKnown(t.id, r.decision === "skip");
      if (ctx.toast) ctx.toast(r.decision === "skip" ? `Skipping ${n.title}: marked known.` : `${n.title} stays in your study plan.`);
      const after = topics.slice(i + 1).find(x => !decision(x.id)) || topics.find(x => !decision(x.id));
      location.hash = after ? BASE + "/check?t=" + after.id : BASE + "/check";
    }));
  }
}
