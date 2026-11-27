// Pulls the 20 desk missions (LEVELS) out of Dalal Dojo's trading desk and writes them as JSON.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const start = src.indexOf('const LEVELS = [');
let i = src.indexOf('[', start), depth = 0, q = null, esc = false;
for (; i < src.length; i++) {
  const c = src[i];
  if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = null; continue; }
  if (c === '"' || c === "'" || c === '`') { q = c; continue; }
  if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) break; }
}
const lit = src.slice(src.indexOf('[', start), i + 1);
let L;
try { L = new Function('return ' + lit)(); } catch (e) { console.error('eval failed', e.message); process.exit(1); }
const out = L.map(l => ({ n: l.n, m: l.m.map(m => ({ id: m.id, t: m.t, how: m.how, c: m.c })) }));
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(out.length, 'levels', out.reduce((a, l) => a + l.m.length, 0), 'missions');
