// Rendering smoke tests against an inert DOM sink. Browser interaction is checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createLearning} from '../learning-ui.mjs';
const json=async n=>JSON.parse(await fs.readFile(new URL('../content/'+n+'.json',import.meta.url),'utf8'));
const [graph,course,studio]=await Promise.all(['learning-graph','lessons','studio'].map(json));
test('Every learning route renders all 36 topic connections, unknown-topic fallback and source corpus',async()=>{
  const originals={fetch:globalThis.fetch,document:globalThis.document,localStorage:globalThis.localStorage};
  const screen={innerHTML:''},sink={};
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>graph});
    globalThis.localStorage={getItem:()=>null};
    globalThis.document={querySelector:s=>s==='#screen'?screen:sink,querySelectorAll:()=>[]};
    const ui=await createLearning({notice:()=>{},download:()=>{},listen:()=>{},items:[...studio.episodes,...course.lessons]});
    for(const route of ['today','roadmap','projects','progress',...graph.nodes.map(n=>'topic/'+n.id),...graph.nodes.map(n=>'topic/'+n.id+'?review')]){assert.equal(ui.render(route),true,route);assert(screen.innerHTML.includes('<h1>'),route);assert(!screen.innerHTML.includes('undefined'),route);}
    ui.render('topic/missing');assert(screen.innerHTML.includes('Topic not found'));
    assert.equal(ui.render('library'),false);assert.equal(ui.documents().length,36);
    ui.render('topic/python');assert(screen.innerHTML.includes('#topic/text'));assert(screen.innerHTML.includes('#topic/probability'));
  }finally{Object.assign(globalThis,originals);}
});
