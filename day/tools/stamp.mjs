// Sets the service worker's VERSION from the contents of every file it saves, so any change reaches
// installed copies on the next visit. Run after editing Dinachari:  node day/tools/stamp.mjs
// (day/tests/stamp.test.mjs fails when it was forgotten).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const VERSION_LINE = /const VERSION = '([^']*)';/;
export function computeVersion() {
  const sw = readFileSync(new URL('sw.js', root), 'utf8');
  const list = /const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
  const app = readFileSync(new URL('day/app.mjs', root), 'utf8');
  const release = /export const VERSION = '([^']+)'/.exec(app)[1];
  const h = createHash('sha256');
  h.update(sw.replace(VERSION_LINE, ''));
  for (const p of list) h.update(p + '\0').update(readFileSync(new URL(p === '/' ? 'index.html' : p.slice(1), root)));
  return `day-${release}-${h.digest('hex').slice(0, 12)}`;
}
export const currentVersion = () => VERSION_LINE.exec(readFileSync(new URL('sw.js', root), 'utf8'))[1];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = computeVersion(), file = new URL('sw.js', root);
  writeFileSync(file, readFileSync(file, 'utf8').replace(VERSION_LINE, `const VERSION = '${v}';`));
  console.log('sw.js VERSION', v);
}
