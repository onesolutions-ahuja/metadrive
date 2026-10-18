import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const roots=['apps/server/src','apps/web/src'];
const files=[];
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(/\.(ts|tsx)$/.test(p))files.push(p);}}
roots.forEach(scan);
const windows=new Map();
for(const file of files){
 const content=fs.readFileSync(file,'utf8');
 const lines=content.split('\n').map((raw,i)=>({content:raw.trim().replace(/\s+/g,' '),line:i+1})).filter(x=>x.content && !x.content.startsWith('//') && !x.content.startsWith('*'));
 const size=16;
 for(let i=0;i+size<=lines.length;i++){
  const block=lines.slice(i,i+size);
  const text=block.map(x=>x.content).join('\n');
  if(text.length<220)continue;
  const hash=createHash('sha256').update(text).digest('hex');
  if(!windows.has(hash))windows.set(hash,[]);
  const arr=windows.get(hash);
  if(arr.length<30)arr.push({file,line:block[0].line,preview:block[0].content.slice(0,100)});
 }
}
const groups=[];
for(const sites of windows.values()){
 const unique=[...new Map(sites.map(s=>[s.file,s])).values()];
 if(unique.length>1)groups.push(unique);
}
const ranks=groups.sort((a,b)=>b.length-a.length).slice(0,30);
console.log(JSON.stringify({scannedFiles:files.length,repeatedCodeWindowsAcrossFiles:groups.length,topDuplicates:ranks},null,2));
