import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {selectQuestions,gradeQuiz,recommendedTopic} from '../quiz-core.mjs';
import {emptyState,mergeLearning} from '../learning-engine.mjs';
const json=async n=>JSON.parse(await fs.readFile(new URL('../content/'+n+'.json',import.meta.url),'utf8'));
const [bank,graph]=await Promise.all(['quiz','learning-graph'].map(json));
test('Quiz samples are bounded, topic filtered, distinct and do not mutate the bank',()=>{
  const before=JSON.stringify(bank.questions),q=selectQuestions(bank.questions,{topic:'py',count:5,random:()=>0.4});
  assert.equal(q.length,5);assert(q.every(q=>q.topic==='py'));assert.equal(new Set(q.map(q=>q.id)).size,5);
  assert.equal(selectQuestions(bank.questions,{count:100}).length,30);assert.equal(selectQuestions(bank.questions,{topic:'unknown'}).length,0);assert.equal(JSON.stringify(bank.questions),before);
});
test('Quiz grading counts unanswered questions as wrong, explains misses and maps every item to a valid topic',()=>{
  const q=bank.questions.slice(0,3);const result=gradeQuiz(q,{[q[0].id]:q[0].answer,[q[1].id]:(q[1].answer+1)%4});
  assert.equal(result.correct,1);assert.equal(result.total,3);assert.equal(result.results[2].chosen,null);
  const ids=new Set(graph.nodes.map(n=>n.id));for(const item of bank.questions){assert(ids.has(recommendedTopic(item)),item.id);assert(item.explain.length>10);}
});
test('Quiz history survives backup merges without duplicate attempts or mastery promotion',()=>{
  const state=emptyState();state.quizAttempts['quiz-1']={correct:3,total:5,missed:['python'],updated:Date.now()};
  const merged=mergeLearning(emptyState(),state,graph);assert.equal(Object.keys(merged.quizAttempts).length,1);assert.deepEqual(merged.topics,{});
  assert.deepEqual(mergeLearning(merged,state,graph),merged);state.quizAttempts.bad={correct:6,total:5,missed:['python'],updated:Date.now()};assert(!mergeLearning(merged,state,graph).quizAttempts.bad);
});
