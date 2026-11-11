export function selectQuestions(bank,{topic='all',count=10,random=Math.random}={}){
  const pool=bank.filter(q=>topic==='all'||q.topic===topic).slice();
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,Math.min(Math.max(1,count),30));
}
export function gradeQuiz(questions,answers){
  const results=questions.map(q=>({id:q.id,topic:q.topic,chosen:Number.isInteger(answers[q.id])?answers[q.id]:null,correct:answers[q.id]===q.answer}));
  return {correct:results.filter(r=>r.correct).length,total:results.length,results};
}
export function recommendedTopic(q){
  if(q.topic==='gen'||q.topic==='ag'){
    const text=(q.q+' '+q.explain).toLowerCase();
    if(/recall@|ndcg|mrr|faithful|evaluat/.test(text))return 'evaluation';
    if(/lora|fine.tun|dpo|rlhf/.test(text))return 'finetuning';
    if(/quant|kv cache|memory/.test(text))return 'quantization';
    if(/agent|tool|mcp/.test(text))return 'agents';
    if(/retriev|chunk|rag|bm25|embedding/.test(text))return 'rag';
    return 'llm-use';
  }
  return {py:'python',la:'linear',pr:'probability',ml:'supervised',dl:'neural',tf:'transformer',rl:'rl',ros:'edge',cx:'python',ops:'evaluation',fl:'distributed',edge:'edge',par:'optimization',num:'calculus',sto:'probability',ab:'statistics'}[q.topic]||'python';
}
