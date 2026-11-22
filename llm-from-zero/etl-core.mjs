// Graph rules for the ETL project page. Pure functions: no DOM, no storage, no network.
//
// The learning graph is a DAG: an edge runs from a prerequisite to the topic that needs it.
// To show only what a goal needs, the page walks the edges *backwards* from the goal:
//   1. reachability: topics the goal does not reach are not needed for it (skipped)
//   2. pruning: the walk stops at a topic you already know, because knowing it covers
//      whatever it needs; its prerequisites are skipped too, unless another path needs them
//   3. ordering: what is left is put in topological order (prerequisites first)
//   4. critical path: the chain with the most study hours is the shortest time the goal
//      can take, however the rest is arranged

const index = graph => new Map(graph.nodes.map(n => [n.id, n]));

/** Topics to study for `targets`, and the known topics where the walk stopped. */
export function requiredFor(graph, targets, known = new Set()) {
  const byId = index(graph), study = new Set(), knownOnPath = new Set();
  const visit = id => {
    const node = byId.get(id);
    if (!node) throw Error('Unknown topic: ' + id);
    if (study.has(id) || knownOnPath.has(id)) return;
    if (known.has(id)) { knownOnPath.add(id); return; }
    study.add(id);
    node.needs.forEach(visit);
  };
  targets.forEach(visit);
  return { study, knownOnPath };
}

/** Every topic the targets reach when nothing is known (the unpruned path). */
export const closure = (graph, targets) => requiredFor(graph, targets).study;

/** Longest-path layering inside `ids`: a topic sits one column right of its deepest prerequisite. */
export function layers(graph, ids) {
  const byId = index(graph), layer = new Map(), active = new Set();
  const depth = id => {
    if (layer.has(id)) return layer.get(id);
    if (active.has(id)) throw Error('Prerequisite cycle among the selected topics');
    active.add(id);
    const inside = byId.get(id).needs.filter(p => ids.has(p));
    const d = inside.length ? 1 + Math.max(...inside.map(depth)) : 0;
    active.delete(id);
    layer.set(id, d);
    return d;
  };
  ids.forEach(depth);
  return layer;
}

/** Kahn's algorithm inside `ids`. Ties: lower layer, then fewer hours, then title. */
export function studyOrder(graph, ids) {
  const byId = index(graph), layer = layers(graph, ids);
  const waiting = new Map([...ids].map(id => [id, byId.get(id).needs.filter(p => ids.has(p)).length]));
  const order = [];
  const rank = (a, b) => layer.get(a) - layer.get(b) || byId.get(a).hours - byId.get(b).hours
    || byId.get(a).title.localeCompare(byId.get(b).title);
  let ready = [...waiting].filter(([, n]) => n === 0).map(([id]) => id).sort(rank);
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const [other, n] of waiting) {
      if (n > 0 && byId.get(other).needs.includes(id)) {
        waiting.set(other, n - 1);
        if (n - 1 === 0) ready.push(other);
      }
    }
    ready.sort(rank);
  }
  if (order.length !== ids.size) throw Error('Prerequisite cycle among the selected topics');
  return order;
}

/** The prerequisite chain with the most hours inside `ids`: {ids: [first ... last], hours}. */
export function criticalPath(graph, ids) {
  const byId = index(graph), best = new Map();
  for (const id of studyOrder(graph, ids)) {
    const prev = byId.get(id).needs.filter(p => ids.has(p))
      .reduce((top, p) => (!top || best.get(p).hours > best.get(top).hours ? p : top), null);
    best.set(id, { hours: byId.get(id).hours + (prev ? best.get(prev).hours : 0), prev });
  }
  let end = null;
  for (const [id, b] of best) if (!end || b.hours > best.get(end).hours) end = id;
  const chain = [];
  for (let id = end; id; id = best.get(id).prev) chain.unshift(id);
  return { ids: chain, hours: end ? best.get(end).hours : 0 };
}

/** Topics in `ids` that are not done and whose prerequisites inside `ids` are all done. */
export function readyNow(graph, ids, done) {
  const byId = index(graph);
  return studyOrder(graph, ids).filter(id => !done.has(id)
    && byId.get(id).needs.filter(p => ids.has(p)).every(p => done.has(p)));
}

/**
 * Which topics count as known, and why.
 * marked: ids you marked as known; solved: exercise ids you solved; demonstrated: ids recorded
 * as demonstrated in the learning desk. A solved checkpoint, or every practice exercise solved,
 * counts as known: you tested out of the topic.
 */
export function knownTopics(graph, { marked = new Set(), solved = new Set(), demonstrated = new Set() } = {}) {
  const why = new Map();
  for (const n of graph.nodes) {
    if (marked.has(n.id)) why.set(n.id, 'marked known');
    else if (demonstrated.has(n.id)) why.set(n.id, 'demonstrated in the learning desk');
    else if (n.checkpoint && solved.has(n.checkpoint)) why.set(n.id, 'checkpoint solved');
    else if (n.practice?.length && n.practice.every(e => solved.has(e))) why.set(n.id, 'all practice solved');
  }
  return why;
}

/** Everything the page shows for one goal, in one object. */
export function planFor(graph, targets, knownWhy) {
  const known = new Set(knownWhy.keys());
  const full = closure(graph, targets);
  const { study, knownOnPath } = requiredFor(graph, targets, known);
  const byId = index(graph), hours = ids => [...ids].reduce((h, id) => h + byId.get(id).hours, 0);
  const coveredByKnown = [...full].filter(id => !study.has(id) && !knownOnPath.has(id));
  return {
    targets,
    study,
    knownOnPath,
    coveredByKnown,           // reached without pruning, skipped because a known topic covers them
    order: studyOrder(graph, study),
    layer: layers(graph, new Set([...study, ...knownOnPath])),
    critical: criticalPath(graph, study),
    next: readyNow(graph, study, known),
    hours: hours(study),
    fullHours: hours(full),
  };
}
