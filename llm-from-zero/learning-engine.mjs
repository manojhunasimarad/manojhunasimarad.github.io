// Pure learning rules. No model, network, or implicit completion from page views.
export const intervals = [1, 3, 7, 14, 30, 60];
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function shiftDay(day, count) {
  const [y,m,d]=day.split('-').map(Number);
  return dayKey(new Date(y,m-1,d+count,12)); // local calendar arithmetic survives DST
}
const validDay = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && shiftDay(d,0)===d;
export function validateGraph(graph) {
  const ids=new Map(graph.nodes.map(n=>[n.id,n]));
  if(ids.size!==graph.nodes.length)throw Error('Duplicate topic ID');
  const seen=new Set(),active=new Set();
  function visit(id){
    if(!ids.has(id))throw Error('Missing prerequisite: '+id);
    if(active.has(id))throw Error('Prerequisite cycle: '+id);
    if(seen.has(id))return;
    active.add(id);for(const p of ids.get(id).needs)visit(p);active.delete(id);seen.add(id);
  }
  graph.nodes.forEach(n=>visit(n.id));
  for(const t of graph.tracks)for(const id of t.targets)if(!ids.has(id))throw Error('Unknown track target');
  for(const p of graph.projects)for(const id of p.needs)if(!ids.has(id))throw Error('Unknown project prerequisite');
  return true;
}
export function emptyState(){return {app:'lfz-learning',version:1,topics:{},projects:{},sessions:{},quizAttempts:{},settings:{track:'apps',minutes:20,weeklyDays:3,updated:0}};}
export function trackNodes(graph,track='apps') {
  const ids=new Set(),ordered=[],byId=new Map(graph.nodes.map(n=>[n.id,n]));
  function visit(id){if(ids.has(id))return;ids.add(id);byId.get(id).needs.forEach(visit);ordered.push(byId.get(id));}
  (graph.tracks.find(t=>t.id===track)||graph.tracks[0]).targets.forEach(visit);
  return ordered;
}
export const demonstrated=(state,id)=>state.topics[id]?.status==='demonstrated';
export const missing=(node,state)=>node.needs.filter(id=>!demonstrated(state,id));
export function plan(graph,state,today=dayKey()) {
  const nodes=trackNodes(graph,state.settings.track);
  const due=graph.nodes.filter(n=>state.topics[n.id]?.due && state.topics[n.id].due<=today)
    .sort((a,b)=>state.topics[a.id].due.localeCompare(state.topics[b.id].due)||a.id.localeCompare(b.id));
  const ready=nodes.filter(n=>!demonstrated(state,n.id)&&missing(n,state).length===0);
  const next=ready.find(n=>state.topics[n.id]?.status==='learning')||ready[0]||null;
  const minutes=state.settings.minutes,review=due.length?Math.min(5,Math.floor(minutes/3)):0;
  const build=next?Math.max(3,Math.floor((minutes-review)/3)):0;
  return {nodes,due,ready,next,minutes,review,build,learn:next?minutes-review-build:0,done:nodes.filter(n=>demonstrated(state,n.id)).length};
}
export function saveEvidence(state,id,{answer,evidence,complete=false},now=Date.now()) {
  if(typeof answer!=='string'||typeof evidence!=='string')throw Error('Add your recall answer and evidence.');
  if(complete&&(answer.trim().length<20||evidence.trim().length<20))throw Error('Write at least 20 characters in both your answer and artifact evidence before self-assessing a demonstration.');
  const old=state.topics[id]||{};
  const status=complete||old.status==='demonstrated'&&answer.trim().length>=20&&evidence.trim().length>=20?'demonstrated':'learning';
  return {...state,topics:{...state.topics,[id]:{...old,status,answer:answer.slice(0,6000),evidence:evidence.slice(0,6000),updated:now,due:old.due||shiftDay(dayKey(new Date(now)),1),step:old.step||0}}};
}
export function reviewTopic(state,id,grade,now=Date.now()) {
  const old=state.topics[id],today=dayKey(new Date(now));
  if(!old)throw Error('Save a first attempt before scheduling a review.');
  if(!['again','good','easy'].includes(grade))throw Error('Invalid recall rating');
  if(old.reviewed===today)throw Error('Recall already logged today. Revisit tomorrow; extra clicks do not increase the interval.');
  const step=grade==='again'?0:Math.min(intervals.length-1,(old.step||0)+(grade==='easy'?2:1));
  return {...state,topics:{...state.topics,[id]:{...old,step,due:shiftDay(today,intervals[step]),reviewed:today,grade,updated:now}}};
}
export function logSession(state,{id,topic,minutes,note},now=Date.now()) {
  if(!id||!Number.isInteger(minutes)||minutes<1||minutes>180)throw Error('Choose 1 to 180 actual study minutes.');
  if(typeof note!=='string'||note.trim().length<10)throw Error('Add a short note on what you actually did (at least 10 characters).');
  if(state.sessions[id])return state;
  return {...state,sessions:{...state.sessions,[id]:{topic,minutes,note:note.slice(0,1000),day:dayKey(new Date(now)),updated:now}}};
}
export function activity(state,today=dayKey()) {
  const sessions=Object.values(state.sessions),days=new Set(sessions.map(s=>s.day));
  let cursor=days.has(today)?today:shiftDay(today,-1),streak=0;
  while(days.has(cursor)){streak++;cursor=shiftDay(cursor,-1);}
  const week=Array.from({length:7},(_,i)=>shiftDay(today,i-6));
  const recent=sessions.filter(s=>week.includes(s.day));
  return {streak,week,days,minutes:recent.reduce((n,s)=>n+s.minutes,0),activeDays:week.filter(d=>days.has(d)).length};
}
export function mergeLearning(current,incoming,graph,now=Date.now()) {
  if(incoming?.app!=='lfz-learning'||incoming.version!==1||!incoming.topics||!incoming.projects||!incoming.sessions)throw Error('Choose a Learning plan v1 backup. Notebook and practice backups use their own import buttons.');
  const out=structuredClone(current),ids=new Set(graph.nodes.map(n=>n.id)),projectIds=new Set(graph.projects.map(p=>p.id));
  const stamp=r=>r&&Number.isFinite(r.updated)&&r.updated>=0&&r.updated<=now+300000;
  const newer=(old,r)=>!old||r.updated>old.updated;
  for(const [id,r] of Object.entries(incoming.topics)) {
    if(!ids.has(id)||!stamp(r)||!newer(out.topics[id],r)||!['learning','demonstrated'].includes(r.status)||typeof r.answer!=='string'||typeof r.evidence!=='string'||r.answer.length>6000||r.evidence.length>6000||!validDay(r.due)||!Number.isInteger(r.step)||r.step<0||r.step>=intervals.length||r.reviewed&&!validDay(r.reviewed))continue;
    if(r.status==='demonstrated'&&(r.answer.trim().length<20||r.evidence.trim().length<20))continue;
    out.topics[id]={status:r.status,answer:r.answer,evidence:r.evidence,due:r.due,step:r.step,updated:r.updated,...(r.reviewed?{reviewed:r.reviewed}:{}),...(['again','good','easy'].includes(r.grade)?{grade:r.grade}:{})};
  }
  for(const [id,r] of Object.entries(incoming.projects))if(projectIds.has(id)&&stamp(r)&&newer(out.projects[id],r)&&typeof r.evidence==='string'&&r.evidence.length<=6000&&['planned','building','demonstrated'].includes(r.status)&&!(r.status==='demonstrated'&&r.evidence.trim().length<20))out.projects[id]={status:r.status,evidence:r.evidence,updated:r.updated};
  for(const [id,r] of Object.entries(incoming.sessions))if(/^[a-zA-Z0-9_-]{1,80}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id)&&stamp(r)&&newer(out.sessions[id],r)&&(ids.has(r.topic)||r.topic==='review')&&Number.isInteger(r.minutes)&&r.minutes>=1&&r.minutes<=180&&validDay(r.day)&&typeof r.note==='string'&&r.note.length<=1000)out.sessions[id]={topic:r.topic,minutes:r.minutes,note:r.note,day:r.day,updated:r.updated};
  const s=incoming.settings;
  out.quizAttempts ||= {};
  for(const [id,r] of Object.entries(incoming.quizAttempts||{}))if(/^[a-zA-Z0-9_-]{1,80}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id)&&stamp(r)&&newer(out.quizAttempts[id],r)&&Number.isInteger(r.total)&&r.total>0&&r.total<=30&&Number.isInteger(r.correct)&&r.correct>=0&&r.correct<=r.total&&Array.isArray(r.missed)&&r.missed.length<=30&&r.missed.every(x=>ids.has(x)))out.quizAttempts[id]={correct:r.correct,total:r.total,missed:[...new Set(r.missed)],updated:r.updated};
  if(stamp(s)&&s.updated>out.settings.updated&&graph.tracks.some(t=>t.id===s.track)&&[10,20,40,60].includes(s.minutes)&&Number.isInteger(s.weeklyDays)&&s.weeklyDays>=1&&s.weeklyDays<=7)out.settings={track:s.track,minutes:s.minutes,weeklyDays:s.weeklyDays,updated:s.updated};
  return out;
}
