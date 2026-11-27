// The growing pipeline map of the ETL step guide: one picture of the whole e-commerce pipeline that
// draws itself as steps are finished. Done parts are solid, the part to do now is outlined and marked,
// open parts (lock off) are plain, and locked parts are dashed outlines with only their name.
// Pure string builder (no DOM): used by etl-guide.mjs, tested in tools/proof.test.mjs.

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Columns: main batch path on the left, side branches on the right; Airflow is a bracket on the far left.
const MAIN = { x: 26, w: 184 }, SIDE = { x: 222, w: 132 }, ROW = 64, TOP = 10, H = 46, W = 362;
const at = (col, row) => ({ ...(col === 'm' ? MAIN : SIDE), y: TOP + row * ROW });

/** Section id → place and labels. `sub` is shown only once the part is no longer locked. */
export const PARTS = [
  { id: 'setup', col: 'm', row: 0, title: 'Your laptop', sub: 'venv · Docker · Postgres · Git' },
  { id: 'latest', col: 's', row: 0, title: 'Latest main', sub: 'git pull · tests green' },
  { id: 's1', col: 'm', row: 1, title: '1 Sources', sub: 'generator + Olist → profile' },
  { id: 's11', col: 's', row: 1, title: '11 LLM labels', sub: 'review comments → Gemini' },
  { id: 's2', col: 'm', row: 2, title: '2 Postgres core', sub: 'raw text → 3NF tables' },
  { id: 's9', col: 's', row: 2, title: '9 Kafka stream', sub: 'events → windows' },
  { id: 's3', col: 'm', row: 3, title: '3 Spark silver', sub: 'bronze → silver + quarantine' },
  { id: 's5', col: 's', row: 3, title: '5 Quality gates', sub: '115 checks' },
  { id: 's4', col: 'm', row: 4, title: '4 Gold star schema', sub: 'facts · dims · SCD2' },
  { id: 's7', col: 's', row: 4, title: '7 Tuning', sub: 'partitions · broadcast' },
  { id: 's6', col: 'm', row: 5, title: '6 SQL + dashboard', sub: '10 questions · Streamlit' },
  { id: 's10', col: 's', row: 5, title: '10 Cloud', sub: 'Databricks · Snowflake' },
  { id: 'extras', col: 'm', row: 6, title: 'GPU + Ask your data', sub: 'V100 · text to SQL' },
  { id: 'record', col: 's', row: 6, title: 'Your stories', sub: 'RESULTS.md · STORIES.md' },
];
const AIRFLOW = { id: 's8', title: '8 Airflow', rows: [2, 4] };
// from → to, with which sides to join.
const EDGES = [
  ['setup', 'latest', 'h'], ['setup', 's1', 'v'], ['s1', 's2', 'v'], ['s2', 's3', 'v'], ['s3', 's4', 'v'], ['s4', 's6', 'v'], ['s6', 'extras', 'v'],
  ['s1', 's11', 'h'], ['s1', 's9', 'd'], ['s3', 's5', 'h'], ['s4', 's7', 'h'], ['s4', 's10', 'd'], ['extras', 'record', 'h'],
];

/**
 * State of every section: 'done' | 'now' | 'open' | 'locked' | 'none' (section missing from the guide).
 * `progress` is guideProgress(); `lockOn` the speedrun lock; `lockedBy` the rule from journey-core.mjs.
 */
export function partStates(progress, lockOn, lockedBy) {
  const states = {}, now = progress.next && progress.next.id;
  for (const s of progress.sections || []) {
    const done = s.total ? s.done === s.total : false;
    states[s.id] = done ? 'done' : s.id === now ? 'now' : lockOn && lockedBy(progress, s.id) ? 'locked' : 'open';
  }
  return states;
}

function node(p, st, info, fresh) {
  const b = at(p.col, p.row), cls = `pm-node ${st}${fresh ? ' fresh' : ''}`;
  const tick = st === 'done' ? '✓ ' : st === 'locked' ? '🔒 ' : '';
  const meter = info && info.total && st !== 'locked' && st !== 'done' ? `<text class="pm-count" x="${b.x + b.w - 8}" y="${b.y + 17}" text-anchor="end">${info.done}/${info.total}</text>` : '';
  const badge = st === 'now' ? `<rect class="pm-badge" x="${b.x + b.w - 40}" y="${b.y - 8}" width="40" height="15" rx="7.5"/><text class="pm-badge-t" x="${b.x + b.w - 20}" y="${b.y + 3}" text-anchor="middle">NOW</text>` : '';
  const label = `${p.title}${st === 'done' ? ', done' : st === 'now' ? ', do this now' : st === 'locked' ? ', locked' : ''}${info && info.total ? `, ${info.done} of ${info.total} boxes` : ''}`;
  return `<a href="#etl/${esc(p.id)}" class="pm-link" aria-label="${esc(label)}"><g class="${cls}" data-part="${esc(p.id)}"><title>${esc(label)}</title>
    <rect class="pm-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${H}" rx="10"/>
    <text class="pm-title" x="${b.x + 10}" y="${b.y + (st === 'locked' ? 28 : 19)}">${esc(tick + p.title)}</text>
    ${st === 'locked' ? '' : `<text class="pm-sub" x="${b.x + 10}" y="${b.y + 36}">${esc(p.sub)}</text>`}${meter}${badge}</g></a>`;
}

function edge([a, b, how], states) {
  const pa = PARTS.find(p => p.id === a), pb = PARTS.find(p => p.id === b);
  if (!pa || !pb || states[a] === 'none' || states[b] === 'none') return '';
  const A = at(pa.col, pa.row), B = at(pb.col, pb.row);
  const on = states[a] === 'done' && states[b] === 'done', next = states[a] === 'done' && states[b] === 'now';
  const cls = `pm-edge ${on ? 'on' : next ? 'next' : 'off'}`;
  let d;
  if (how === 'h') d = `M${A.x + A.w} ${A.y + H / 2}H${B.x}`;
  else if (how === 'v') d = `M${A.x + A.w / 2} ${A.y + H}V${B.y}`;
  else d = `M${A.x + A.w} ${A.y + H - 8}C${A.x + A.w + 8} ${A.y + H + 4} ${B.x - 10} ${B.y - 4} ${B.x + 14} ${B.y}`;
  return `<path class="${cls}" d="${d}" marker-end="url(#pm-arrow-${on || next ? 'on' : 'off'})"/>`;
}

function airflow(states, progress, fresh) {
  const st = states[AIRFLOW.id];
  if (!st || st === 'none') return '';
  const y1 = TOP + AIRFLOW.rows[0] * ROW, y2 = TOP + AIRFLOW.rows[1] * ROW + H;
  const info = progress.sections.find(s => s.id === AIRFLOW.id);
  const label = `${AIRFLOW.title}${st === 'done' ? ', done' : st === 'now' ? ', do this now' : st === 'locked' ? ', locked' : ''}: it runs steps 2 to 5 as one DAG${info && info.total ? `, ${info.done} of ${info.total} boxes` : ''}`;
  return `<a href="#etl/${AIRFLOW.id}" class="pm-link" aria-label="${esc(label)}"><g class="pm-node pm-air ${st}${fresh ? ' fresh' : ''}" data-part="${AIRFLOW.id}"><title>${esc(label)}</title>
    <path class="pm-bracket" d="M20 ${y1}H12a6 6 0 0 0-6 6V${y2 - 6}a6 6 0 0 0 6 6H20"/>
    <rect class="pm-air-hit" x="0" y="${y1}" width="22" height="${y2 - y1}"/>
    <text class="pm-air-t" transform="translate(16 ${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle">${esc((st === 'done' ? '✓ ' : st === 'locked' ? '🔒 ' : '') + AIRFLOW.title)}${st === 'now' ? ' · NOW' : ''}</text></g></a>`;
}

/**
 * The map as an SVG string. `seen` is the set of part ids that were already done the last time the map
 * was shown on this device; parts done since then get the class "fresh" (a short unlock animation).
 */
export function pipelineMap(progress, { lockOn = true, lockedBy = () => null, seen = null } = {}) {
  const states = partStates(progress, lockOn, lockedBy);
  for (const p of [...PARTS, AIRFLOW]) if (!(p.id in states)) states[p.id] = 'none';
  const fresh = id => !!seen && states[id] === 'done' && !seen.has(id);
  const info = id => progress.sections.find(s => s.id === id);
  const built = [...PARTS, AIRFLOW].filter(p => states[p.id] === 'done').length;
  const total = [...PARTS, AIRFLOW].filter(p => states[p.id] !== 'none').length;
  const height = TOP + 7 * ROW - 8;
  const svg = `<svg class="pm-svg" viewBox="0 0 ${W} ${height}" role="group" aria-label="Your pipeline: ${built} of ${total} parts built" xmlns="http://www.w3.org/2000/svg">
  <defs>${['on', 'off'].map(k => `<marker id="pm-arrow-${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="pm-arrow ${k}" d="M0 0L8 4L0 8z"/></marker>`).join('')}</defs>
  ${EDGES.map(e => edge(e, states)).join('')}
  ${airflow(states, progress, fresh(AIRFLOW.id))}
  ${PARTS.filter(p => states[p.id] !== 'none').map(p => node(p, states[p.id], info(p.id), fresh(p.id))).join('')}
</svg>`;
  return { svg, built, total, states, fresh: [...PARTS, AIRFLOW].filter(p => fresh(p.id)).map(p => p.id) };
}
