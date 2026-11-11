// Export with installed Windows voices using direct PowerShell commands.
// No policy settings are changed and no network voice service is contacted.
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {plain} from '../studio-core.mjs';
if(process.platform!=='win32')throw Error('This exporter uses installed Windows speech voices. On other systems use browser narration or transcripts.');
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'audio');await mkdir(out,{recursive:true});
const studio=JSON.parse(await readFile(path.join(root,'content/studio.json'),'utf8')),course=JSON.parse(await readFile(path.join(root,'content/lessons.json'),'utf8'));
const all=[...studio.episodes,...course.lessons.map(x=>({...x,text:`${x.title}. ${plain(x.html)}. Pause and recall the main idea. Review code, equations and tables on your laptop.`}))];
const chosen=process.argv[2]?all.filter(x=>x.id===process.argv[2]):all;if(!chosen.length)throw Error('Unknown episode ID');
const command=`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$lfzSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($lfzSynth.GetInstalledVoices().Count -eq 0) { throw 'No installed Windows speech voice is available' }
  Write-Output ('Voice: ' + $lfzSynth.Voice.Name)
  $lfzText = [System.IO.File]::ReadAllText($env:LFZ_TRANSCRIPT)
  $lfzSynth.SetOutputToWaveFile($env:LFZ_WAVE)
  $lfzSynth.Speak($lfzText)
  $lfzSynth.SetOutputToNull()
} finally { $lfzSynth.Dispose() }`;
for(const x of chosen){
  if(!/^[a-z0-9-]+$/.test(x.id))throw Error('Invalid episode ID');
  const transcript=path.join(out,x.id+'.txt'),wave=path.join(out,x.id+'.wav');await writeFile(transcript,x.text,'utf8');
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{env:{...process.env,LFZ_TRANSCRIPT:transcript,LFZ_WAVE:wave},encoding:'utf8',windowsHide:true,timeout:120000});
  if(r.error||r.status!==0)throw Error((r.error?.message||r.stderr||'Windows speech export failed').trim());
  const bytes=await readFile(wave);if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.length<1000)throw Error('Invalid audio file');
  console.log(`Created ${x.id}.wav (${Math.round(bytes.length/1024)} KB)`);
}
const files=new Set(await readdir(out)),existing=all.filter(x=>files.has(x.id+'.wav'));
await writeFile(path.join(out,'playlist.m3u'),'#EXTM3U\n'+existing.map(x=>`#EXTINF:-1,${x.title}\n${x.id}.wav`).join('\n'),'utf8');
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your audio library</title><body style="font:18px system-ui;max-width:800px;margin:40px auto;padding:20px"><h1>Your offline audio library</h1><p>Copy this folder to Android and open playlist.m3u in your media player. Prepare playback while parked. Course narrations omit code blocks; inspect code, equations and tables on your laptop.</p>${existing.map(x=>`<article><h2>${escape(x.title)}</h2><audio controls preload="none" src="${x.id}.wav"></audio><p><a href="${x.id}.wav" download>Download WAV</a> · <a href="${x.id}.txt">Transcript</a></p></article>`).join('')}</body></html>`,'utf8');
