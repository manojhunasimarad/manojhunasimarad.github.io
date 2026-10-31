// Pulls the 24 lessons (MODULES) out of Dalal Dojo: Lessons and Lab and writes them as JSON.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const start = src.indexOf('const MODULES = [');
let i = src.indexOf('[', start), depth = 0, q = null, esc = false;
for (; i < src.length; i++) {
  const c = src[i];
  if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
  if (c === '"' || c === "'" || c === '`') { q = c; continue; }
  if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) break; }
}
const lit = src.slice(src.indexOf('[', start), i + 1);
const MODULES = new Function('return ' + lit)();
fs.writeFileSync(process.argv[3], JSON.stringify(MODULES));
console.log(MODULES.length, 'modules,', MODULES.reduce((n, m) => n + m.lessons.length, 0), 'lessons');
