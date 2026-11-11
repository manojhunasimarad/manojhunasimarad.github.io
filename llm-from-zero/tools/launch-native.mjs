import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundled=path.join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
const candidates=[...(process.env.LFZ_PYTHON?[[process.env.LFZ_PYTHON,[]]]:[]),['py',['-3']],['python',[]],...(existsSync(bundled)?[[bundled,[]]]:[])];
let found;for(const [cmd,args] of candidates){const r=spawnSync(cmd,[...args,'-c','import sys; assert sys.version_info >= (3,10)'],{windowsHide:true,stdio:'ignore'});if(r.status===0){found=[cmd,args];break;}}
if(!found){console.error('Python 3.10+ was not found. Install Python from python.org, or set LFZ_PYTHON to its executable. The studio still works with START-STUDIO.cmd.');process.exitCode=1;}
else{const child=spawn(found[0],[...found[1],path.join(root,'py','server.py'),...process.argv.slice(2)],{stdio:'inherit',cwd:root,windowsHide:true});child.on('exit',code=>process.exitCode=code||0);child.on('error',e=>{console.error(e.message);process.exitCode=1;});}
