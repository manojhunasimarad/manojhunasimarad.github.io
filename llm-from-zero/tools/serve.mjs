import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const rootDefault=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.wasm':'application/wasm','.zip':'application/zip','.wav':'audio/wav','.txt':'text/plain; charset=utf-8'};
const rootFiles=new Set(['index.html','studio.html','studio.mjs','studio-core.mjs','learning-engine.mjs','learning-ui.mjs','quiz-core.mjs','quiz-ui.mjs','learning.css','studio.css','studio.webmanifest','config.js','boot.js','app.js','style.css','api-worker.js','run-worker.js','sqlbridge.js','manifest.webmanifest','ml-files.json','sw.js']);
const localModels=j=>(j.models||[]).filter(m=>typeof m.name==='string'&&!m.remote_model&&!m.remote_host&&!/(?:^|[:\-])cloud(?:$|[:\-])/i.test(m.name)).map(m=>m.name);
export function createApp({root=rootDefault,ollamaFetch=fetch}={}) {
  return http.createServer(async(req,res)=>{
    const reply=(status,data)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    const port=req.socket.localPort, allowed=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
    if(!allowed.has(req.headers.host))return reply(403,{error:'Local host required'});
    if(req.headers.origin&&!allowed.has(req.headers.origin.replace(/^http:\/\//,'')))return reply(403,{error:'Same-origin requests only'});
    try {
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(url.pathname.startsWith('/studio-api/')) {
        const abort=new AbortController();res.on('close',()=>abort.abort());
        const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(90000)]);
        const call=async(route,options={})=>{const r=await ollamaFetch('http://127.0.0.1:11434/api/'+route,{...options,signal});if(!r.ok)throw Error('Ollama returned '+r.status);return r.json();};
        if(req.method==='GET'&&url.pathname==='/studio-api/models')return reply(200,{models:localModels(await call('tags'))});
        if(req.method!=='POST'||url.pathname!=='/studio-api/chat')return reply(404,{error:'Unknown endpoint'});
        if(req.headers['x-lfz-studio']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'Studio JSON request required'});
        let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>24000){reply(413,{error:'Request limit is 24 KB'});return;}body+=chunk;}
        let j;try{j=JSON.parse(body);}catch{return reply(400,{error:'Invalid JSON'});}
        if(typeof j.model!=='string'||!Array.isArray(j.messages)||j.messages.length!==2||j.messages.some((m,i)=>m.role!==['system','user'][i]||typeof m.content!=='string'||m.content.length>12000))return reply(400,{error:'Invalid model or messages'});
        if(!localModels(await call('tags')).includes(j.model))return reply(400,{error:'Choose an installed local model; cloud models are disabled'});
        const out=await call('chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:j.model,messages:j.messages,stream:false,options:{temperature:0.2,num_ctx:4096,num_predict:700},keep_alive:'5m'})});
        if(typeof out.message?.content!=='string')throw Error('The model returned no answer');
        return reply(200,{answer:out.message.content});
      }
      if(!['GET','HEAD'].includes(req.method))return reply(405,{error:'Read-only files'});
      let rel;try{rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'studio.html';}catch{return reply(400,{error:'Invalid path'});}
      if(rel.includes('\\')||rel.split('/').some(x=>x==='..'||x.startsWith('.'))||!rootFiles.has(rel)&&! /^(content|vendor|icons|py|audio)\//.test(rel))return reply(404,{error:'Not found'});
      // Only deployed Python source is public; never serve py/data, work files or caches.
      if(rel.startsWith('py/')&&!/^py\/(?:[a-z]+\.py|sqlite3\/__init__\.py)$/.test(rel))return reply(404,{error:'Not found'});
      const full=path.resolve(root,rel);if(!full.startsWith(path.resolve(root)+path.sep))return reply(404,{error:'Not found'});
      let bytes;try{if(!(await stat(full)).isFile())throw Error();bytes=await readFile(full);}catch{return reply(404,{error:'Not found'});}
      res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(e){reply(502,{error:e.name==='TimeoutError'?'The local model timed out. Try a smaller model.':'Local model unavailable. Start Ollama and check that a model is installed.'});}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const port=Number(process.env.LFZ_PORT||8765);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid LFZ_PORT');const server=createApp();server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port busy. Set LFZ_PORT to another port and retry.':e.message);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`Learn & Listen: http://127.0.0.1:${port}/studio.html\nPractice app: http://127.0.0.1:${port}/index.html\nOnly this laptop can connect. Ctrl+C stops the server.`));}
