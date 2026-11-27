// Reads the learner's ETL repository on GitHub for the guide's proof checks (etl-proof-core.mjs).
// Public repositories need no sign-in: one GitHub API call for the newest commit of main (and one for
// its CI runs when asked), then the files at exactly that commit from raw.githubusercontent.com, so a
// push is seen at once (no cache of "main"). GitHub allows 60 API calls an hour without sign-in.
import { DEFAULT_REPO, REPO_KEY, parseRepo, filesNeeded, checkGithub } from './etl-proof-core.mjs';

const API = 'https://api.github.com', RAW = 'https://raw.githubusercontent.com';
let memo = null; // { key, at, sha, files }

export function repoSetting() {
  try { const r = parseRepo(JSON.parse(localStorage.getItem(REPO_KEY) || 'null')); return r || { ...DEFAULT_REPO }; } catch { return { ...DEFAULT_REPO }; }
}
export function saveRepo(text) {
  const r = parseRepo(text);
  if (!r) return null;
  try { localStorage.setItem(REPO_KEY, JSON.stringify(`${r.owner}/${r.repo}`)); } catch { return null; }
  memo = null;
  return r;
}

async function api(path) {
  let res;
  try { res = await fetch(API + path, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }); }
  catch { throw Error(navigator.onLine === false ? 'You are offline. This check reads your repository on GitHub, so it needs the internet.' : 'GitHub could not be reached. Check your connection and try again.'); }
  if (res.status === 404) throw Error('GitHub says this repository does not exist or is private. Check the repository name above (it must be public).');
  if (res.status === 403 || res.status === 429) throw Error('GitHub allows 60 checks an hour without sign-in, and that is used up. Try again later.');
  if (!res.ok) throw Error(`GitHub answered ${res.status}. Try again in a minute.`);
  return res.json();
}
async function raw(repo, sha, path) {
  let res;
  try { res = await fetch(`${RAW}/${repo.owner}/${repo.repo}/${sha}/${path}`, { cache: 'no-store' }); } catch { throw Error('GitHub could not be reached. Check your connection and try again.'); }
  if (res.status === 404) return null;
  if (!res.ok) throw Error(`GitHub answered ${res.status} for ${path}.`);
  return res.text();
}

/** Fetch what `checks` need. `paths` maps file keys (stories, results, profiling) to repository paths. */
export async function fetchRepoFiles(checks, paths, repo = repoSetting(), now = Date.now()) {
  const key = `${repo.owner}/${repo.repo}`;
  if (!memo || memo.key !== key || now - memo.at > 30000) {
    const head = await api(`/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(repo.branch || 'main')}`);
    memo = { key, at: now, sha: head.sha, files: {} };
  }
  const files = { sha: memo.sha };
  for (const k of filesNeeded(checks)) {
    if (k === 'sha') continue;
    if (!(k in memo.files)) memo.files[k] = k === 'runs' ? await api(`/repos/${repo.owner}/${repo.repo}/actions/runs?head_sha=${memo.sha}&per_page=30`) : await raw(repo, memo.sha, paths[k] || k);
    files[k] = memo.files[k];
  }
  return files;
}

/** Run the GitHub checks of one box: { ok, results: [{ok, say}], sha }. Throws with a message a learner can act on. */
export async function runGithubChecks(checks, paths, ctx = {}) {
  const repo = repoSetting();
  const files = await fetchRepoFiles(checks, paths, repo);
  const results = checks.map(c => checkGithub(c, files, ctx));
  return { ok: results.every(r => r.ok), results, sha: files.sha, repo };
}
export const forgetRepoCache = () => { memo = null; };
