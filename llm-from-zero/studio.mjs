import {plain, segments, chunkDocuments, retrieve, ragMessages, mergeProgress} from './studio-core.mjs';
import {createLearning} from './learning-ui.mjs';
import {createQuiz} from './quiz-ui.mjs';
let quiz;
let learning;
const $ = s => document.querySelector(s), esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeRead = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { notice('This browser could not save your changes. Export a backup before leaving.'); return false; } }
function notice(text) { $('#notice').textContent = text; }
function download(name, text, type='application/json') { const u = URL.createObjectURL(new Blob([text], {type})), a = document.createElement('a'); a.href=u; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
let data, course, items=[], progress=safeRead('lfz-studio-progress', {}), positions=safeRead('lfz-studio-audio', {}), imports=[], active=null, part=0, parts=[], playing=false, generation=0, query='', filter='all', routeGeneration=0, request=null;
document.querySelector('.skip').onclick=e=>{e.preventDefault();document.querySelector('#main').focus();};
const player = window.speechSynthesis;
function narration(item) { return item.text || `${item.title}. ${plain(item.html)}. Pause and recall: what was the main idea, and how would you use it?`; }
function voices() {
  const list = player ? player.getVoices().filter(v => v.localService && /^en\b/i.test(v.lang)) : [];
  $('#voice').replaceChildren(...list.map(v => new Option(`${v.name} (${v.lang})`, v.voiceURI)));
  if (!list.length) $('#voice').append(new Option('No local English voice available', ''));
  const preferred=safeRead('lfz-studio-voice',''); if(list.some(v=>v.voiceURI===preferred)) $('#voice').value=preferred;
  return list;
}
function audioStatus(text) { $('#audio-status').textContent=text; $('#play').textContent=playing?'Pause':'Play'; }
function persistPosition() { if(active) { positions[active.id]=part; save('lfz-studio-audio', positions); } }
function halt() { generation++; if(player) player.cancel(); playing=false; persistPosition(); audioStatus(active ? `Paused · paragraph ${Math.min(part+1,parts.length)} of ${parts.length}` : 'Choose a lesson'); }
function speak() {
  if (!active) choose(items[0].id, false);
  if (!player) return audioStatus('Narration is unavailable. Download the transcript or use exported audio.');
  const voice=player.getVoices().find(v=>v.localService && v.voiceURI===$('#voice').value);
  if(!voice) return audioStatus('Install an English device voice, then reload; or use exported audio.');
  if(part >= parts.length) part=0;
  const turn=++generation; player.cancel(); playing=true;
  const utterance=new SpeechSynthesisUtterance(parts[part]); utterance.voice=voice; utterance.lang=voice.lang; utterance.rate=Number($('#rate').value);
  utterance.onend=()=>{
    if(turn!==generation) return;
    part++; persistPosition(); $('#audio-progress').value=part;
    if(part < parts.length) speak();
    else { playing=false; audioStatus('Finished · listening does not verify mastery');
      if($('#autoplay').checked) { const idx=items.findIndex(x=>x.id===active.id); if(items[idx+1]) choose(items[idx+1].id,true); }
    }
  };
  utterance.onerror=e=>{ if(turn===generation) { playing=false; audioStatus(`Audio stopped (${e.error}). Try Play or use exported audio.`); } };
  $('#audio-progress').max=parts.length; $('#audio-progress').value=part; audioStatus(`Paragraph ${part+1} of ${parts.length} · keep the browser open`); player.speak(utterance);
}
function choose(id, start=true) { halt(); active=items.find(x=>x.id===id); if(!active) return; parts=segments(narration(active)); part=Math.max(0,Math.min(Number(positions[id])||0,parts.length)); $('#now-title').textContent=active.title; $('#audio-progress').max=parts.length; $('#audio-progress').value=part; audioStatus(`Ready · ${parts.length} short paragraphs`); if(start) speak(); }
$('#play').onclick=()=>playing?halt():speak(); $('#stop').onclick=halt;
$('#previous').onclick=()=>{ if(!active) return; halt(); part=Math.max(0,part-1); speak(); };
$('#next').onclick=()=>{ if(!active) return; halt(); part=Math.min(parts.length-1,part+1); speak(); };
$('#rate').value=String(safeRead('lfz-studio-rate',1));
$('#rate').onchange=()=>{save('lfz-studio-rate',Number($('#rate').value));if(playing){halt();speak();}};
$('#voice').onchange=()=>{save('lfz-studio-voice',$('#voice').value);if(playing){halt();speak();}};
if(player) player.addEventListener('voiceschanged',voices); voices();
window.addEventListener('pagehide',halt);
function docFor(x) { return {id:x.id,title:x.title,text:x.text||plain(x.html),url:`studio.html#lesson/${x.id}`}; }
function corpus() { return [...items.map(docFor), ...(learning?.documents()||[]), ...data.concepts.filter(c=>progress[c.id]?.note).map(c=>({id:'note-'+c.id,title:'Your note: '+c.title,text:progress[c.id].note,url:'studio.html#notebook'})), ...imports]; }
function routeTo(hash) { location.hash=hash; }
function bindActions() {
  document.querySelectorAll('[data-listen]').forEach(b=>b.onclick=()=>choose(b.dataset.listen));
  document.querySelectorAll('[data-transcript]').forEach(b=>b.onclick=()=>{const x=items.find(x=>x.id===b.dataset.transcript);download(x.id+'.txt',narration(x),'text/plain');});
}
function lessonCard(x) { return `<article class="lesson-card"><div class="topline"><span class="meta">${x.text?'AUDIO BRIEFING':'COURSE LESSON'} · ~${Math.max(1,Math.round(narration(x).split(/\s+/).length/150))} MIN AUDIO</span><span class="badge">${esc(x.concept||'foundations')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.summary || plain(x.html).slice(0,145)+'…')}</p><div class="actions"><button class="primary" data-listen="${x.id}">▶ Listen</button><a class="button" href="#lesson/${x.id}">Read lesson</a><button data-transcript="${x.id}" aria-label="Download transcript for ${esc(x.title)}">↓ Text</button></div></article>`; }
function library() {
  const featured=items.find(x=>x.id==='listen-session')||items[0];
  $('#screen').innerHTML=`<p class="eyebrow">LEARN A LITTLE. CONNECT THE DOTS.</p><h1>A good idea travels<br>with you.</h1><p class="intro">Your AI learning library, from the first line of Python to grounded agents. Listen on the move. Put it into practice when you’re back.</p>
  <div class="hero"><div><p class="eyebrow">A RHYTHM FOR EVERYDAY LEARNING</p><h2>${esc(featured.title)}</h2><p>${esc(featured.summary||'Listen, recall, build and reuse.')}</p><div class="hero-actions"><button class="primary" data-listen="${featured.id}">▶ Start listening</button><a class="button" href="#roadmap">Explore your roadmap ↗</a></div></div><div class="orb" aria-hidden="true">≋</div></div>
  <div class="section-head"><h2>Your listening shelf <span class="badge">${items.length} lessons</span></h2><label class="search"><input id="search" type="search" aria-label="Search lessons" placeholder="Find an idea, tool or lesson…" value="${esc(query)}"></label></div><div class="filters" aria-label="Lesson filters">${[['all','All lessons'],['briefing','Audio briefings'],['course','Course library'],['rag','RAG'],['agents','Agents'],['llm','LLMs']].map(([id,title])=>`<button data-filter="${id}" aria-pressed="${filter===id}">${title}</button>`).join('')}</div><p class="muted small">Prepare playback while parked. For driving or a locked screen, use exported audio files; browser speech may stop in the background.</p><div class="lesson-grid" id="cards"></div>`;
  const draw=()=>{const q=query.toLowerCase();const list=items.filter(x=>(filter==='all'||filter==='briefing'&&x.text||filter==='course'&&!x.text||x.concept===filter) && `${x.title} ${narration(x)}`.toLowerCase().includes(q));$('#cards').innerHTML=list.length?list.map(lessonCard).join(''):'<p class="empty">No lessons match. Try a broader term.</p>';bindActions();};
  $('#search').oninput=e=>{query=e.target.value;draw();}; document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;library();});draw();
}
function sanitizedLesson(html) {
  const doc=new DOMParser().parseFromString(html,'text/html'), allowed=new Set('P H2 H3 H4 H5 UL OL LI STRONG EM B I CODE PRE BLOCKQUOTE HR TABLE THEAD TBODY TR TH TD DIV SPAN A BR'.split(' '));
  for(const el of [...doc.body.querySelectorAll('*')]) {
    if(!allowed.has(el.tagName)){el.remove();continue;}
    for(const a of [...el.attributes]) if(!['href','class'].includes(a.name)) el.removeAttribute(a.name);
    if(el.hasAttribute('href')) {const href=el.getAttribute('href');if(!/^https?:\/\//i.test(href))el.removeAttribute('href');else{el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}}
  } return doc.body.innerHTML;
}
function lesson(id) {
  const x=items.find(x=>x.id===id); if(!x){$('#screen').innerHTML='<h1>Lesson not found</h1><a href="#library">Back to library</a>';return;}
  const concept=data.concepts.find(c=>c.id===x.concept);
  $('#screen').innerHTML=`<p class="eyebrow">YOUR LISTENING SHELF</p><h1>${esc(x.title)}</h1><p class="intro">${esc(x.summary||'Read the complete lesson, then practise the idea on your laptop.')}</p><div class="actions"><button class="primary" data-listen="${x.id}">▶ Listen to this lesson</button><button data-transcript="${x.id}">Download transcript</button><a class="button" href="#library">Back to shelf</a>${!x.text?`<a class="button" href="index.html#/lesson/${x.id}">Open practice & recall ↗</a>`:''}</div><article class="reader">${x.text?x.text.split(/(?<=\.) (?=[A-Z])/).reduce((a,s,i)=>(i%4===0?a+'<p>':a)+esc(s)+' '+(i%4===3?'</p>':''),'')+'</p>':sanitizedLesson(x.html)}</article>${concept?`<div class="info"><strong>Prove your understanding:</strong> ${esc(concept.prove)} <a href="#notebook">Save your evidence →</a></div>`:''}`; bindActions();
}
function notebook() {
  $('#screen').innerHTML=`<p class="eyebrow">LEAVE A TRAIL YOUR FUTURE SELF CAN USE</p><h1>Don’t start from zero twice.</h1><p class="intro">Keep your interface, artifact path, test result and next step together. Notes stay in this browser. Export and merge them to continue on Android.</p><div class="actions"><button id="export" class="primary">↓ Export studio backup</button><label class="button">↑ Merge studio backup<input id="import" type="file" accept="application/json,.json" hidden></label><label class="button">↑ Import practice progress<input id="practice-import" type="file" accept="application/json,.json" hidden></label></div><p class="small muted">The learning plan has its own backup in Progress & reviews. Studio notebook backups and the original practice app’s “Your devices” backups are separate. Importing practice progress records evidence here; it never marks a concept verified.</p><div class="road">${data.concepts.map(c=>`<article class="lesson-card"><h2>${esc(c.title)}</h2><label class="fields">Your status<select data-status="${c.id}">${['new','learning','verified'].map(s=>`<option ${progress[c.id]?.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label class="fields">Evidence and reusable artifact<textarea data-note="${c.id}" maxlength="8000" placeholder="Artifact / file path:\nInput → output:\nTest and result:\nLimits / next step:">${esc(progress[c.id]?.note||'')}</textarea></label><div class="actions"><button data-save="${c.id}">Save evidence</button></div><p class="small muted">${esc(c.prove)}</p></article>`).join('')}</div>`;
  document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>{const id=b.dataset.save;progress[id]={status:$(`[data-status="${id}"]`).value,note:$(`[data-note="${id}"]`).value,updated:Date.now()};if(save('lfz-studio-progress',progress))notice('Evidence saved on this device.');});
  $('#export').onclick=()=>download('lfz-studio-backup.json',JSON.stringify({app:'lfz-studio',version:1,items:progress},null,2));
  $('#import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1000000)throw Error('Backup limit is 1 MB.');progress=mergeProgress(progress,JSON.parse(await f.text()),new Set(data.concepts.map(c=>c.id)));save('lfz-studio-progress',progress);notebook();notice('Studio backup merged; newer saved notes win.');}catch(err){notice(err.message);}};
  $('#practice-import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>80000000)throw Error('Practice backup is too large.');const doc=JSON.parse(await f.text());if(doc.app!=='llm-from-zero'||!Array.isArray(doc.tables?.lessons)||!Array.isArray(doc.tables?.solved))throw Error('Choose an export from the practice app’s Your devices section.');const read=new Set(doc.tables.lessons.map(x=>x.id));let count=0;for(const c of data.concepts){const matched=c.lessons.filter(id=>read.has(id));if(!matched.length)continue;const old=progress[c.id]||{status:'new',note:''};const evidence='Imported practice lessons: '+matched.join(', ')+'.';if(old.note.includes(evidence))continue;progress[c.id]={status:old.status==='new'?'learning':old.status,note:(old.note+'\n'+evidence).trim().slice(0,8000),updated:Date.now()};count++;}save('lfz-studio-progress',progress);notebook();notice(`${count} concept notes updated from practice progress; mastery remains your decision.`);}catch(err){notice(err.message);}};
}
function lab() {
  $('#screen').innerHTML=`<p class="eyebrow">RETRIEVAL FIRST. GENERATION WHEN YOU NEED IT.</p><h1>Ask the sources you have.</h1><p class="intro">Search lessons, briefings, saved notebook notes and optional text files. Inspect the evidence, then ask a model already installed on your laptop to explain it.</p><div class="info">This is a small BM25 retrieval baseline with overlapping chunks. It has no embeddings or autonomous tool execution. The optional model can still make mistakes; inspect its citations.</div><label class="fields">Add your own .txt or .md notes (up to 200 KB total; held only until reload)<input type="file" id="docs" accept=".txt,.md,text/plain" multiple></label><p id="doc-state" class="muted small">${imports.length} imported documents · ${corpus().length} sources total</p><label class="fields">Your question<input type="text" id="question" maxlength="1000" placeholder="How do I evaluate retrieval in RAG?"></label><div class="actions"><button id="find" class="primary">Find evidence</button><button id="models">Find local models</button><label>Model <select id="model"><option value="">Connect the laptop server first</option></select></label><button id="generate" disabled>Explain with local model</button><button id="cancel" disabled>Cancel</button></div><p class="muted small">Model calls work only through the included laptop server. No API key or paid service is required. Only a model listed locally can be used; cloud model tags are excluded.</p><div id="evidence"></div><div class="answer" id="answer" role="status" aria-live="polite"></div>`;
  let selected=[], evidenceQuestion=''; const ticket=routeGeneration;
  $('#docs').onchange=async e=>{try{const files=[...e.target.files];if(files.some(f=>! /\.(txt|md)$/i.test(f.name)))throw Error('Choose .txt or .md files.');if(files.reduce((n,f)=>n+f.size,0)+imports.reduce((n,d)=>n+new TextEncoder().encode(d.text).length,0)>200000)throw Error('Keep imported text under 200 KB total.');for(const f of files){const text=await f.text();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');if(!imports.some(x=>x.id===hash))imports.push({id:hash,title:f.name,text,url:''});}if(ticket!==routeGeneration)return;$('#doc-state').textContent=`${imports.length} unique imported documents · ${corpus().length} sources total`;selected=[];$('#generate').disabled=true;}catch(err){notice(err.message);}};
  $('#question').oninput=()=>{selected=[];$('#generate').disabled=true;};
  $('#find').onclick=()=>{evidenceQuestion=$('#question').value.trim();selected=retrieve(chunkDocuments(corpus()),evidenceQuestion,4);$('#answer').textContent='';$('#evidence').innerHTML=selected.length?`<h2 style="margin-top:24px">Retrieved evidence</h2>${selected.map((c,i)=>`<article class="reference"><strong>[${i+1}] ${esc(c.title)}</strong><p>${esc(c.text)}</p>${c.url?`<a href="${esc(c.url)}">Open source →</a>`:'<span class="muted small">Imported text · '+esc(c.id.slice(0,18))+'</span>'}</article>`).join('')}`:'<p class="empty">No matching evidence found. Try different terms or add a relevant document. No model request will be sent.</p>';$('#generate').disabled=!selected.length||!$('#model').value;};
  $('#models').onclick=async()=>{try{const r=await fetch('/studio-api/models',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Start the included Node laptop server and Ollama, then retry.');const j=await r.json();if(ticket!==routeGeneration)return;$('#model').replaceChildren(...j.models.map(x=>new Option(x,x)));if(!j.models.length)throw Error('No local models found. Install a model in Ollama first; none are downloaded automatically.');$('#generate').disabled=!selected.length;notice('Local models found. Inspect evidence before generating.');}catch(err){if(ticket===routeGeneration)notice(err.message);}};
  $('#model').onchange=()=>$('#generate').disabled=!selected.length||!$('#model').value;
  $('#cancel').onclick=()=>request?.abort();
  $('#generate').onclick=async()=>{if(!selected.length||evidenceQuestion!==$('#question').value.trim())return;request=new AbortController();$('#cancel').disabled=false;$('#generate').disabled=true;$('#answer').textContent='Asking your local model…';try{const r=await fetch('/studio-api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-LFZ-Studio':'1'},body:JSON.stringify({model:$('#model').value,messages:ragMessages(evidenceQuestion,selected)}),signal:request.signal});const j=await r.json();if(!r.ok)throw Error(j.error||'Model request failed');if(ticket===routeGeneration)$('#answer').textContent='Model draft — verify every citation.\n\n'+j.answer;}catch(err){if(ticket===routeGeneration)$('#answer').textContent=err.name==='AbortError'?'Request cancelled.':err.message;}finally{if(ticket===routeGeneration){$('#cancel').disabled=true;$('#generate').disabled=!selected.length||evidenceQuestion!==$('#question').value.trim();}request=null;}};
}
function setup() {
  $('#screen').innerHTML=`<p class="eyebrow">A SMALL STACK THAT CAN GROW WITH YOU</p><h1>Your free learning setup.</h1><p class="intro">ThinkPad for building and local inference. Android for reading and audio. An optional Pi for lightweight file serving. No subscriptions are required by these additions.</p><div class="setup-grid"><article><h2>01 · Laptop</h2><p>Install Node.js 22 or newer from its official website. In this folder run:</p><pre><code>node tools/serve.mjs</code></pre><p>Open <a href="http://127.0.0.1:8765/studio.html">the local studio</a>. Reading, search and notebook features need no model. For the optional tutor, install Ollama and a suitable local model. Check RAM and GPU memory first; “i7 gaming” alone does not tell us what fits.</p><a href="https://docs.ollama.com/" target="_blank" rel="noopener">Ollama documentation ↗</a></article><article><h2>02 · Android</h2><p>Open studio.html on your personal GitHub Pages site in Android Chrome, visit it online once, then use Add to home screen. Wait for “Studio saved for offline reading”. Test in airplane mode before relying on it.</p><p>Export the studio backup on the laptop and merge it on Android. Use the practice app’s separate Your devices backup for exercises and recall. Your phone’s localhost address does not point to the laptop.</p></article><article><h2>03 · Journey audio</h2><p>${location.hostname.endsWith(".github.io")?"Generate the audio on your laptop using the command below, then copy the files to Android.":'<a href="audio/index.html">Open the generated audio library ↗</a>'}</p><p>On Windows, run the free audio exporter:</p><pre><code>node tools/export-audio.mjs</code></pre><p>It makes WAV files and transcripts from the briefings and all 24 lessons using an installed Windows voice. Copy the audio folder to Android by USB and play it in your media player. WAV files are larger than compressed audio.</p><p>Browser Play uses only local English voices. It needs an installed device voice and can stop when the phone locks. Prepare audio before driving; use files for background playback.</p></article><article><h2>04 · Raspberry Pi</h2><p>The official Pi 2 Model B has 1 GB RAM. If you have 2 or 4 GB, confirm the model on Raspberry Pi OS:</p><pre><code>cat /proc/device-tree/model\nfree -h</code></pre><p>Use it for a small static library or audio files. Run local LLM inference on the ThinkPad if its hardware fits. The included laptop model bridge stays on loopback and is not a phone-accessible server.</p></article><article><h2>05 · Add tools with a reason</h2><p>BM25 → embeddings → hybrid retrieval → reranking, measured against the same question set. Reuse source IDs, document hashes and metrics at each step.</p><p>Use <a href="https://qdrant.tech/documentation/">Qdrant</a> if a larger vector index helps; <a href="https://docs.langchain.com/oss/python/langgraph/overview">LangGraph</a> if stateful orchestration helps; <a href="https://modelcontextprotocol.io/docs/getting-started/intro">MCP</a> when tools must work across clients. These are learning extensions, not integrations already installed here. Check model and component licenses before reuse.</p></article><article><h2>06 · A repeatable session</h2><ol><li>Choose one short audio briefing while parked.</li><li>After the journey, explain it from memory.</li><li>Build one small component on the laptop.</li><li>Record its interface, test and next step.</li><li>Use the original recall system to revisit it.</li></ol><p>Free software still uses storage, electricity and download bandwidth. There is no automatic cloud sync or paid API fallback.</p></article></div>`;
}
function render() {routeGeneration++;if(request)request.abort();const hash=location.hash.slice(1)||'today';document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+(hash.startsWith('topic/')?'roadmap':hash.split('/')[0]))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});if(learning?.render(hash)||quiz?.render(hash)){}else if(hash.startsWith('lesson/'))lesson(hash.slice(7));else({library,notebook,lab,setup}[hash]||library)();window.scrollTo(0,0);$('#main').focus({preventScroll:true});}
async function start() {
  try {
    [data,course]=await Promise.all(['content/studio.json','content/lessons.json'].map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('Could not load '+p);return r.json();}));
    const order=course.courses.flatMap(c=>c.lessons), byId=new Map(course.lessons.map(x=>[x.id,x]));
    items=[...data.episodes,...[...new Set([...order,...byId.keys()])].map(id=>({...byId.get(id),concept:data.concepts.find(c=>c.lessons.includes(id))?.id||'foundations'}))];
    // Validate stored state through the same allowlist used for imports.
    progress=mergeProgress({}, {app:'lfz-studio',version:1,items:progress},new Set(data.concepts.map(c=>c.id)));
    learning=await createLearning({notice,download,items,listen:choose});
    quiz=await createQuiz({learning,notice});
    window.addEventListener('hashchange',render);render();
    if('serviceWorker' in navigator && (location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))) {
      const reg=await navigator.serviceWorker.register('sw.js').catch(()=>null);
      if(!reg){$('#offline').textContent='Offline install unavailable on this server';return;}
      const check=()=>reg.active?.postMessage({type:'studio-ready'});
      navigator.serviceWorker.addEventListener('controllerchange',()=>navigator.serviceWorker.controller?.postMessage({type:'studio-ready'}));
      navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='studio-ready')$('#offline').textContent=e.data.ok?'Studio saved for offline reading':'Offline save incomplete; revisit online';});
      if(reg.active)check();else reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',()=>{if(reg.active)check();}));
      navigator.serviceWorker.ready.then(check);$('#offline').textContent='Saving studio for offline reading…';
    }else $('#offline').textContent='Offline install needs HTTPS or localhost';
  }catch(err){notice(err.message);$('#screen').innerHTML='<h1>The library could not open.</h1><p>Start the included server and reload. For offline use, open the studio online once and wait for its saved status.</p>';}
}
start();
