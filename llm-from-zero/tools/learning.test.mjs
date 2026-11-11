import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {validateGraph,emptyState,trackNodes,plan,saveEvidence,reviewTopic,logSession,activity,dayKey,shiftDay,mergeLearning} from '../learning-engine.mjs';
import {createApp} from './serve.mjs';
const root=new URL('../',import.meta.url);
const graph=JSON.parse(await fs.readFile(new URL('content/learning-graph.json',root),'utf8'));
const now=new Date(2026,10,11,12).getTime();
const prove=(s,id)=>saveEvidence(s,id,{answer:'I explained the principle and its limitation.',evidence:'project.py; ran test command; all assertions passed.',complete:true},now);
test('Curriculum: complete IDs, acyclic graph, valid resources, primary path distinctions',async()=>{
  assert.equal(validateGraph(graph),true);assert.equal(graph.nodes.length,36);
  const course=JSON.parse(await fs.readFile(new URL('content/lessons.json',root),'utf8'));
  const studio=JSON.parse(await fs.readFile(new URL('content/studio.json',root),'utf8'));
  const lessons=new Set([...course.lessons,...studio.episodes].map(x=>x.id));
  for(const n of graph.nodes){assert(n.hours>0);for(const k of ['summary','question','answer','project','outcome','source','difficulty'])assert(n[k]?.length>3,n.id+' '+k);assert(n.source.startsWith('https://'));n.lessons.forEach(l=>assert(lessons.has(l),l));assert.equal(new Set(n.needs).size,n.needs.length);}
  const apps=new Set(trackNodes(graph,'apps').map(n=>n.id)),build=new Set(trackNodes(graph,'build').map(n=>n.id));
  for(const id of ['rag','agents','evaluation','safety'])assert(apps.has(id));
  for(const id of ['pytorch','tensorflow','pretraining','word2vec','transformer'])assert(!apps.has(id));
  for(const id of ['linear','calculus','attention','position','transformer','pytorch','pretraining'])assert(build.has(id));
  assert(!build.has('tensorflow'));assert(!build.has('word2vec'));
  const bad=structuredClone(graph);bad.nodes[0].needs=['agents'];assert.throws(()=>validateGraph(bad),/cycle/);
  const unknown=structuredClone(graph);unknown.nodes[0].needs=['missing'];assert.throws(()=>validateGraph(unknown),/Missing/);
});
test('Planner: explains readiness, routes apps to text before optional maths, never bypasses prerequisites',()=>{
  let s=emptyState();assert.equal(plan(graph,s).next.id,'python');
  s=prove(s,'python');assert.equal(plan(graph,s).next.id,'text');
  const n=graph.nodes.find(n=>n.id==='rag');s=prove(s,'llm-use');s=prove(s,'text');assert(!plan(graph,s).ready.includes(n));
  s=prove(s,'evaluation');s=prove(s,'safety');assert(plan(graph,s).ready.includes(n));
  assert.equal(plan(graph,s).learn+plan(graph,s).build+plan(graph,s).review,s.settings.minutes);
  let complete=emptyState();for(const n of trackNodes(graph,'apps'))complete=prove(complete,n.id);assert.equal(plan(graph,complete).next,null);
});
test('A read or an incomplete evidence record never establishes demonstration',()=>{
  const s=emptyState();assert.throws(()=>saveEvidence(s,'python',{answer:'yes',evidence:'done',complete:true},now));
  const attempt=saveEvidence(s,'python',{answer:'Learning this now',evidence:''},now);
  assert.equal(attempt.topics.python.status,'learning');assert.equal(attempt.topics.python.due,'2026-11-12');assert.equal(plan(graph,attempt).next.id,'python');
});
test('Original practice map stays acyclic and no longer gates RAG on transformer implementation',async()=>{
  const skills=JSON.parse(await fs.readFile(new URL('content/skills.json',root),'utf8')).skills;
  const byId=new Map(skills.map(s=>[s.id,s])),seen=new Set(),active=new Set();
  function visit(id){assert(byId.has(id));assert(!active.has(id),'cycle: '+id);if(seen.has(id))return;active.add(id);byId.get(id).needs.forEach(visit);active.delete(id);seen.add(id);}
  skills.forEach(s=>visit(s.id));
  const ancestors=id=>byId.get(id).needs.flatMap(p=>[p,...ancestors(p)]);
  assert(!ancestors('gen-rag').includes('ml-attention'));assert(!ancestors('gen-apps').includes('ml-attention'));
  assert(!byId.get('num-linear').needs.includes('num-calc'));
});
test('Recall: due queue, reset, expanding intervals, repeat-click protection and no automatic mastery',()=>{
  let s=saveEvidence(emptyState(),'python',{answer:'My remembered explanation',evidence:'A saved work in progress'},now);
  assert.equal(plan(graph,s,'2026-11-11').due.length,0);assert.equal(plan(graph,s,'2026-11-12').due.length,1);
  const later=new Date(2026,10,12,12).getTime();s=reviewTopic(s,'python','good',later);
  assert.equal(s.topics.python.due,'2026-11-15');assert.equal(s.topics.python.status,'learning');
  assert.throws(()=>reviewTopic(s,'python','easy',later),/already logged/);
  s=reviewTopic(s,'python','again',new Date(2026,10,15,12).getTime());assert.equal(s.topics.python.due,'2026-11-16');assert.equal(s.topics.python.step,0);
});
test('Calendar dates handle local midnight, leap days, DST and streak grace for today',()=>{
  assert.equal(shiftDay('2024-02-28',1),'2024-02-29');assert.equal(shiftDay('2024-02-29',1),'2024-03-01');assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
  assert.equal(shiftDay('2026-03-08',1),'2026-03-09');assert.equal(dayKey(new Date(2026,10,11,0,5)),'2026-11-11');
  let s=emptyState();for(const d of [9,10])s=logSession(s,{id:'day'+d,topic:'python',minutes:20,note:'Tested a word counter'},new Date(2026,10,d,12).getTime());
  assert.equal(activity(s,'2026-11-11').streak,2);assert.equal(activity(s,'2026-11-12').streak,0);assert.equal(activity(s,'2026-11-11').minutes,40);
});
test('Backups are idempotent, preserve newer evidence, reject forged/malformed records and future stamps',()=>{
  let original=prove(emptyState(),'python');original=logSession(original,{id:'session-1',topic:'python',minutes:20,note:'Built a counter and tests'},now);
  const merged=mergeLearning(emptyState(),JSON.parse(JSON.stringify(original)),graph,now);
  assert.deepEqual(mergeLearning(merged,original,graph,now),merged);assert.equal(Object.keys(merged.sessions).length,1);
  const older=structuredClone(original);older.topics.python.updated--;older.topics.python.evidence='An older saved artifact and tests';assert.equal(mergeLearning(merged,older,graph,now).topics.python.evidence,original.topics.python.evidence);
  const bad=structuredClone(original);bad.topics.python.answer='yes';bad.sessions['bad-date']={...bad.sessions['session-1'],day:'2026-02-31'};bad.sessions.future={...bad.sessions['session-1'],updated:now+999999};bad.topics.unknown=bad.topics.python;
  const clean=mergeLearning(emptyState(),bad,graph,now);assert.equal(Object.keys(clean.topics).length,0);assert.equal(Object.keys(clean.sessions).length,1);
  assert.throws(()=>mergeLearning(emptyState(),{app:'lfz-studio',version:1},graph));
});
test('Static serving and offline manifest cover every new module and curriculum',async()=>{
  const server=createApp();server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try{for(const file of ['learning-ui.mjs','learning-engine.mjs','learning.css','content/learning-graph.json'])assert.equal((await fetch(base+'/'+file)).status,200,file);}finally{server.close();server.closeAllConnections();}
  const config=await fs.readFile(new URL('config.js',root),'utf8'),sw=await fs.readFile(new URL('sw.js',root),'utf8');
  for(const file of ['learning-ui.mjs','learning-engine.mjs','learning.css','content/learning-graph.json']){assert(config.includes(file));assert(sw.includes(file));}
});
