// Proof rules for the ETL step guide (no DOM, no network: tested in tools/proof.test.mjs).
// A tick box with a proof in content/etl-proofs.json cannot be ticked by hand. It ticks itself when
//   paste:  the output of the learner's own run contains every expected line (the generator is seeded,
//           so a real run prints exactly the numbers in the guide), and/or
//   github: the learner's repository on GitHub shows the work (a story written, a results row filled,
//           the "your turn" function pushed, CI green on main, the laptop on the same commit as main).
// Pasted text is never stored: only which proof passed and when.

export const PROOF_KEY = 'lfz-etl-proof-v1', REPO_KEY = 'lfz-etl-repo-v1';
export const DEFAULT_REPO = { owner: 'manojhunasimarad', repo: 'ETL', branch: 'main' };

/** Keys, tokens and passwords that must never be pasted into a web page. */
const SECRETS = [
  [/AIza[0-9A-Za-z_-]{30,}/, 'a Google (Gemini) API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, 'a GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{30,}/, 'an API key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\b(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[=:]\s*["']?[^\s"'<>]{6,}/i, 'a password or key'],
];
export function secretIn(text) {
  for (const [re, what] of SECRETS) if (re.test(String(text || ''))) return what;
  return null;
}

/** Proof spec for one tick box, or null. */
export const proofFor = (proofs, id) => (proofs && proofs.proofs && Object.hasOwn(proofs.proofs, id) ? proofs.proofs[id] : null);
export const kindsOf = spec => (spec ? [spec.paste ? 'paste' : null, spec.github ? 'github' : null].filter(Boolean) : []);

const fill = (s, ctx) => String(s).replace(/\{owner\}/g, (ctx.owner || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const fillSay = (s, ctx) => String(s).replace(/\{owner\}/g, ctx.owner || '');
const rx = (rule, ctx, g = false) => new RegExp(fill(rule.re, ctx), [...new Set(('m' + (rule.flags || '') + (g ? 'g' : '')).split(''))].join(''));
const norm = t => String(t || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');

const PYTEST = {
  need: [{ re: '\\b\\d+ passed\\b', say: 'pytest ran and tests passed' }],
  forbid: [{ re: '\\b[1-9]\\d* (failed|errors?)\\b', say: 'Some tests failed. Read the first failure from the top, fix it, and run pytest again.' },
    { re: '^(ImportError|ModuleNotFoundError)\\b|No module named', say: 'Python could not import the project: is (.venv) active and the package installed?' }],
};

/**
 * Check pasted terminal output against a paste rule.
 * Returns { ok, items: [{ok, say}], problems: [say], hints: [say], secret, sha }.
 */
export function checkPaste(rule, text, ctx = DEFAULT_REPO) {
  const t = norm(text).trim();
  const out = { ok: false, items: [], problems: [], hints: [], secret: null, sha: null };
  if (!t) { out.problems.push('Paste what your terminal printed first.'); return out; }
  out.secret = secretIn(t);
  if (out.secret) { out.problems.push(`This looks like it contains ${out.secret}. Nothing was checked or saved. Remove that line and paste again: a key never goes into a web page.`); return out; }
  const need = [...(rule.pytest ? PYTEST.need : []), ...(rule.need || [])];
  const forbid = [...(rule.pytest ? PYTEST.forbid : []), ...(rule.forbid || [])];
  for (const r of need) {
    const n = (t.match(rx(r, ctx, true)) || []).length;
    out.items.push({ ok: n >= (r.min || 1), say: fillSay(r.say, ctx) + (r.min > 1 ? ` (${Math.min(n, r.min)} of ${r.min} found)` : '') });
  }
  for (const r of forbid) if (rx(r, ctx).test(t)) out.problems.push(fillSay(r.say, ctx));
  if (out.items.some(i => !i.ok)) for (const r of rule.hints || []) if (rx(r, ctx).test(t)) out.hints.push(fillSay(r.say, ctx));
  if (rule.sha) { const m = t.match(/^\s*([0-9a-f]{7,40})\b/m); out.sha = m ? m[1] : null; }
  out.ok = !out.problems.length && out.items.every(i => i.ok);
  return out;
}

/* ------------------------------------------------------------------ GitHub files */

/** The text of "## Step N: ..." in STORIES.md up to the next "## ", or null. */
export function storySection(md, n) {
  const lines = norm(md).split('\n'), head = new RegExp(`^##\\s+Step\\s+${Number(n)}\\b`, 'i');
  const i = lines.findIndex(l => head.test(l));
  if (i < 0) return null;
  let j = i + 1; while (j < lines.length && !/^##\s/.test(lines[j])) j++;
  return lines.slice(i, j).join('\n');
}

/** Rows of the first Markdown table in RESULTS.md as arrays of trimmed cells (header and rule rows dropped). */
export function resultsRows(md) {
  const rows = norm(md).split('\n').filter(l => /^\s*\|/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  return rows.filter((r, i) => i > 0 && !r.every(c => /^:?-{3,}:?$/.test(c)));
}
const filled = v => !!v && !/^pending\b/i.test(v) && !/^\(?fill in/i.test(v) && v !== '-' && v !== '…';

/** One GitHub check against the files already fetched: { ok, say }. */
export function checkGithub(c, files, ctx = {}) {
  switch (c.check) {
    case 'story': {
      const sec = storySection(files.stories, c.step);
      if (sec == null) return { ok: false, say: `docs/STORIES.md has no "## Step ${c.step}" section.` };
      const gaps = (sec.match(/\(fill in/gi) || []).length;
      const stale = (c.forbid || []).find(f => sec.toLowerCase().includes(f.toLowerCase()));
      if (gaps) return { ok: false, say: `Step ${c.step} in docs/STORIES.md still has ${gaps} "(fill in)" gap${gaps > 1 ? 's' : ''}. Write ${gaps > 1 ? 'them' : 'it'} in your own words, commit, push, then check again.` };
      if (stale) return { ok: false, say: `Step ${c.step} in docs/STORIES.md still says "${stale}": put a real number from your run there.` };
      return { ok: true, say: `Step ${c.step} story is written and pushed.` };
    }
    case 'results': {
      const row = resultsRows(files.results).find(r => r[0] && r[0].toLowerCase().startsWith(c.row.toLowerCase()));
      if (!row) return { ok: false, say: `docs/RESULTS.md has no row "${c.row}".` };
      return filled(row[1]) ? { ok: true, say: c.say || `"${c.row}" is filled in.` }
        : { ok: false, say: `"${c.row}" in docs/RESULTS.md still says "${row[1] || 'empty'}". Put your measured number there (with data, command, machine and date), commit, push, then check again.` };
    }
    case 'resultsAny': {
      const ok = resultsRows(files.results).some(r => {
        const line = r.join(' | '), low = line.toLowerCase();
        return (c.all || []).every(w => low.includes(w.toLowerCase())) && !(c.not || []).some(w => low.includes(w.toLowerCase())) && (!c.re || new RegExp(c.re, 'i').test(line)) && filled(r[1]);
      });
      return ok ? { ok: true, say: c.say || 'The row is in RESULTS.md.' } : { ok: false, say: `Not yet: ${c.say || 'the row is not in RESULTS.md'}. Add the row, commit, push, then check again.` };
    }
    case 'fileLacks': {
      const text = files[c.file];
      if (text == null) return { ok: false, say: `${c.file} could not be read from GitHub.` };
      return text.includes(c.text) ? { ok: false, say: `Not on GitHub yet: main still has the "${c.text}" placeholder. Commit and push your function, then check again.` } : { ok: true, say: c.say || 'Pushed.' };
    }
    case 'ci': return ciVerdict(files.runs, files.sha);
    case 'head': {
      const mine = ctx.sha;
      if (!mine) return { ok: false, say: 'Paste the output of git log -1 --oneline first.' };
      return files.sha && files.sha.startsWith(mine.toLowerCase())
        ? { ok: true, say: `Your laptop is on ${mine}, the newest commit on main.` }
        : { ok: false, say: `Your laptop is on ${mine}, but main on GitHub is at ${(files.sha || '?').slice(0, 7)}. Run git switch main and git pull, then paste again.` };
    }
    default: return { ok: false, say: 'Unknown check: ' + c.check };
  }
}

/** CI on the newest commit of main: every finished push run succeeded, none still running. */
export function ciVerdict(runs, sha) {
  const list = (runs && runs.workflow_runs || []).filter(r => r.head_sha === sha && r.event !== 'workflow_dispatch' && r.event !== 'schedule');
  if (!list.length) return { ok: false, say: `No CI run found for the newest commit on main (${(sha || '?').slice(0, 7)}). Push to main, wait for the Actions tab, then check again.` };
  const busy = list.filter(r => r.status !== 'completed');
  if (busy.length) return { ok: false, say: `CI is still running on ${sha.slice(0, 7)} (${busy.map(r => r.name).join(', ')}). Check again in a few minutes.` };
  const bad = list.filter(r => !['success', 'skipped', 'neutral'].includes(r.conclusion));
  return bad.length ? { ok: false, say: `CI failed on ${sha.slice(0, 7)}: ${bad.map(r => `${r.name} (${r.conclusion})`).join(', ')}. Open the run on GitHub, fix the first error, push again.` }
    : { ok: true, say: `CI is green on the newest commit of main (${sha.slice(0, 7)}): ${list.map(r => r.name).join(', ')}.` };
}

/** Which repository files a set of checks needs. */
export function filesNeeded(checks) {
  const need = new Set(['sha']);
  for (const c of checks || []) {
    if (c.check === 'story') need.add('stories');
    if (c.check === 'results' || c.check === 'resultsAny') need.add('results');
    if (c.check === 'fileLacks') need.add(c.file);
    if (c.check === 'ci') need.add('runs');
  }
  return need;
}

/* ------------------------------------------------------------------ proof record (this device) */
export const emptyProofs = () => ({ app: 'lfz-etl-proof', version: 1, items: {} });
/** Record one passed part ('paste' or 'github') of a box's proof; returns a new record. */
export function recordPass(rec, id, part, extra = {}, now = Date.now()) {
  const base = rec && rec.app === 'lfz-etl-proof' ? rec : emptyProofs();
  return { ...base, items: { ...base.items, [id]: { ...(base.items[id] || {}), [part]: now, ...extra } } };
}
export function clearProof(rec, id) {
  const base = rec && rec.app === 'lfz-etl-proof' ? rec : emptyProofs();
  const items = { ...base.items }; delete items[id];
  return { ...base, items };
}
/** True when every part the spec asks for has passed. */
export function proofComplete(spec, item) {
  return !!spec && !!item && kindsOf(spec).every(k => Number.isFinite(item[k]));
}

/** Repository setting: "owner/repo" or a github.com URL; null when it is not one. */
export function parseRepo(text) {
  const m = String(text || '').trim().replace(/\.git$/, '').match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})\/?$/);
  return m ? { owner: m[1], repo: m[2], branch: 'main' } : null;
}
