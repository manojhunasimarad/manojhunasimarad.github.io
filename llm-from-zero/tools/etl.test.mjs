// The ETL project page: graph rules (etl-core.mjs) and the consistency of its content.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {requiredFor,closure,layers,studyOrder,criticalPath,readyNow,knownTopics,planFor} from '../etl-core.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8'),json=async n=>JSON.parse(await read('content/'+n+'.json'));
const [graph,etl,course,exercises,quiz,skills]=await Promise.all(['learning-graph','etl','lessons','exercises','quiz','skills'].map(json));

// a small map:  a -> b -> d -> e,  a -> c -> d,  x is unrelated
const node=(id,needs,hours=1,extra={})=>({id,title:id.toUpperCase(),needs,hours,...extra});
const toy={nodes:[node('a',[],2),node('b',['a'],3),node('c',['a'],1,{checkpoint:'c-ex',practice:['c-ex']}),node('d',['b','c'],2,{practice:['d1','d2']}),node('e',['d'],1),node('x',[],5)]};

test('Walking back from a goal keeps only what it reaches, and stops at known topics',()=>{
  assert.deepEqual([...closure(toy,['e'])].sort(),['a','b','c','d','e']);
  assert(!closure(toy,['e']).has('x'));
  const {study,knownOnPath}=requiredFor(toy,['e'],new Set(['b']));
  assert.deepEqual([...study].sort(),['a','c','d','e']);   // a stays: c still needs it
  assert.deepEqual([...knownOnPath],['b']);
  const pruned=requiredFor(toy,['e'],new Set(['d']));
  assert.deepEqual([...pruned.study],['e']);                // d covers a, b and c
  assert.deepEqual(requiredFor(toy,['e'],new Set(['e'])).study.size,0);
  assert.throws(()=>requiredFor(toy,['missing']),/Unknown topic/);
});

test('Layers, topological order, the longest chain and what is ready',()=>{
  const all=closure(toy,['e']),layer=layers(toy,all);
  assert.deepEqual(Object.fromEntries(layer),{a:0,b:1,c:1,d:2,e:3});
  const order=studyOrder(toy,all);
  assert.deepEqual(order,['a','c','b','d','e']);             // same layer: fewer hours first
  for(const [i,id] of order.entries())for(const p of toy.nodes.find(n=>n.id===id).needs)assert(order.indexOf(p)<i,id+' after '+p);
  assert.deepEqual(criticalPath(toy,all),{ids:['a','b','d','e'],hours:8});
  assert.deepEqual(readyNow(toy,all,new Set()),['a']);
  assert.deepEqual(readyNow(toy,all,new Set(['a'])),['c','b']);
  const cyclic={nodes:[node('p',['q']),node('q',['p'])]};
  assert.throws(()=>studyOrder(cyclic,new Set(['p','q'])),/cycle/);
  assert.deepEqual(criticalPath(toy,new Set()),{ids:[],hours:0});
});

test('Known means marked, demonstrated, checkpoint solved or all practice solved',()=>{
  const why=knownTopics(toy,{marked:new Set(['a']),solved:new Set(['c-ex','d1']),demonstrated:new Set(['e'])});
  assert.deepEqual(Object.fromEntries(why),{a:'marked known',c:'checkpoint solved',e:'demonstrated in the learning desk'});
  assert.equal(knownTopics(toy,{solved:new Set(['d1','d2'])}).get('d'),'all practice solved');
  const p=planFor(toy,['e'],knownTopics(toy,{solved:new Set(['d1','d2'])}));
  assert.deepEqual(p.order,['e']);assert.deepEqual([...p.knownOnPath],['d']);assert.deepEqual(p.coveredByKnown.sort(),['a','b','c']);
  assert.equal(p.hours,1);assert.equal(p.fullHours,9);assert.deepEqual(p.next,['e']);
});

const byId=new Map(graph.nodes.map(n=>[n.id,n])),de=graph.nodes.filter(n=>n.group==='Data engineering');
const exIds=new Set(exercises.exercises.map(e=>e.id)),lessonIds=new Set(course.lessons.map(l=>l.id));

test('ETL content: topics, practice, checkpoints, lessons, steps and quiz all connect',()=>{
  assert.equal(de.length,19);
  for(const n of de){
    for(const id of n.practice)assert(exIds.has(id),n.id+': '+id);
    if(n.checkpoint)assert(n.practice.includes(n.checkpoint),n.id);
    for(const l of n.lessons)assert(lessonIds.has(l),l);
  }
  const practised=new Set(de.flatMap(n=>n.practice));
  for(const e of exercises.exercises.filter(e=>e.set==='de'))assert(practised.has(e.id),'no topic practises '+e.id);
  const taught=new Set(de.flatMap(n=>n.lessons));
  for(const id of course.courses.find(c=>c.id==='de').lessons)assert(taught.has(id),'no topic teaches '+id);
  assert.equal(etl.steps.length,10);assert.deepEqual(etl.steps.map(s=>s.n),[1,2,3,4,5,6,7,8,9,10]);
  for(const s of etl.steps){assert(s.targets.length&&s.targets.every(t=>byId.get(t)?.group==='Data engineering'),s.title);assert(s.note.startsWith('docs/'));}
  const whole=closure(graph,etl.whole.targets);
  for(const n of de)assert(whole.has(n.id),'the whole project does not need '+n.id);
  assert.deepEqual(graph.tracks.find(t=>t.id==='etl').targets,etl.whole.targets);
  for(const q of quiz.questions.filter(q=>q.topic==='de'))assert(byId.get(q.node)?.group==='Data engineering',q.id);
  const ladder=new Set(skills.skills.filter(s=>s.group==='de').flatMap(s=>s.ladder.map(x=>x[0])));
  for(const e of exercises.exercises.filter(e=>e.set==='de'))assert(ladder.has(e.id),'no practice-map skill for '+e.id);
});

test('Every step goal prunes: knowing its prerequisites leaves only the step, knowing the step leaves nothing',()=>{
  for(const s of [...etl.steps,etl.whole]){
    const full=closure(graph,s.targets),order=studyOrder(graph,full);
    for(const [i,id] of order.entries())for(const p of byId.get(id).needs)if(full.has(p))assert(order.indexOf(p)<i);
    const known=new Map([...full].filter(id=>!s.targets.includes(id)).map(id=>[id,'marked known']));
    assert.deepEqual([...planFor(graph,s.targets,known).study].sort(),[...s.targets].sort(),s.title);
    assert.equal(planFor(graph,s.targets,new Map(s.targets.map(t=>[t,'marked known']))).study.size,0);
    const p=planFor(graph,s.targets,new Map());
    assert(p.critical.hours<=p.hours&&p.critical.ids.length>0);
    assert.equal(p.critical.ids.at(-1),p.order.filter(id=>p.critical.ids.includes(id)).at(-1));
  }
  const step1=planFor(graph,['de-profiling'],new Map());
  assert.deepEqual(step1.order,['python','de-profiling']);       // step 1 needs Python, nothing else
  const known=planFor(graph,['de-capstone'],new Map([['de-cleaning','marked known']]));
  assert(known.coveredByKnown.includes('de-profiling'));          // only cleaning needed profiling
  assert(known.study.has('de-spark'));                            // streaming still needs Spark
});

test('The page is routed, linked and served',async()=>{
  const [app,index,server,serve]=await Promise.all(['app.js','index.html','py/server.py','tools/serve.mjs'].map(read));
  assert(app.includes('[/^\\/etl(?:\\?(.*))?$/, etlPage, "etl"]'));assert(app.includes('import("./etl-core.mjs")'));
  const nav=await read('site-nav.mjs');assert(nav.includes("{ name: 'ETL project', to: 'p:#/etl?goal=whole'"));assert(index.includes('site-nav.mjs'));
  assert(server.includes('"etl-core.mjs"'));assert(serve.includes("'etl-core.mjs'"));
});

test('Check what you know: every topic of the whole project is listed in study order, every ETL topic has two questions, and the suggestion follows the answers',async()=>{
  const {checkTopics,suggest}=await import('../etl-check.mjs');
  const E=await import('../etl-core.mjs');const {recommendedTopic}=await import('../quiz-core.mjs');
  const etl=JSON.parse(await fs.readFile(new URL('../content/etl.json',import.meta.url)));
  const topics=checkTopics(graph,etl,quiz,E,recommendedTopic);
  const ids=topics.map(t=>t.id);
  assert.deepEqual(new Set(ids),closure(graph,etl.whole.targets));
  for(const [i,id] of ids.entries())for(const p of byId.get(id).needs)if(ids.includes(p))assert(ids.indexOf(p)<i,id+' before '+p);
  for(const t of topics.filter(t=>t.node.group==='Data engineering')){assert(t.questions.length>=2,t.id);for(const q of t.questions){assert.equal(q.options.length,4,q.id);assert(q.answer>=0&&q.answer<4,q.id);}}
  assert.equal(topics.find(t=>t.id==='de-profiling').step,1);
  const t={questions:[{id:'a',answer:1},{id:'b',answer:2}]};
  assert.equal(suggest(t,{}).kind,null);
  assert.equal(suggest(t,{answers:{a:1}}).kind,null);
  assert.equal(suggest(t,{answers:{a:1,b:2}}).kind,'skip');
  assert.equal(suggest(t,{answers:{a:1,b:0}}).kind,'study');
  assert.equal(suggest(t,{answers:{a:1,b:2},rate:'new'}).kind,'study');
  assert.equal(suggest({questions:[]},{rate:'knew'}).kind,'skip');
  assert.equal(suggest({questions:[]},{rate:'partly'}).kind,'study');
});
