// Production migration smoke check from a real GitHub Actions network runner.
// Never logs credentials, cookies or user records.
const site='https://unesolutions.co.uk';
const api='https://metadrive-nxd7.onrender.com/api';
const legacy='https://metadrive-production.up.railway.app/api';
const stamp=Date.now();
const htmlResponse=await fetch(site+'/?metadrive_probe='+stamp,{
  cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)
});
if(!htmlResponse.ok)throw new Error('Public site unavailable: HTTP '+htmlResponse.status);
const html=await htmlResponse.text();
const scripts=[...html.matchAll(/src=["'](\/assets\/[^"']+\.js)["']/g)].map(match=>match[1]);
if(!scripts.length)throw new Error('Public homepage has no Vite JavaScript entrypoint');
console.log('Public entrypoint(s):',scripts.join(', '));
let renderFound=false;
let railwayFound=false;
const queue=[...scripts];
const visited=new Set();
while(queue.length&&visited.size<75){
  const path=queue.shift();
  if(!path||visited.has(path))continue;
  visited.add(path);
  const response=await fetch(site+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Public bundle missing: '+path+' HTTP '+response.status);
  const code=await response.text();
  renderFound ||=code.includes(api);
  railwayFound ||=code.includes(legacy);
  // Follow Vite's public relative module imports/chunk preload references.
  for(const match of code.matchAll(/["']\.\/([^"'?#]+\.js)["']/g)){
    const child='/assets/'+match[1];
    if(!visited.has(child)&&!queue.includes(child))queue.push(child);
  }
  if(renderFound)break;
}
console.log('Checked public JS modules:',visited.size);
console.log('Public frontend Render API binding:',renderFound);
console.log('Public frontend legacy Railway API binding:',railwayFound);
if(!renderFound||railwayFound)throw new Error('Live frontend is not exclusively bound to the Render API');
const health=await fetch(api+'/health',{cache:'no-store',signal:AbortSignal.timeout(20000)});
const payload=await health.json();
if(!health.ok||payload?.status!=='ok'||payload?.persistence!=='sql')
  throw new Error('Render SQL health failed: HTTP '+health.status);
// Browser login uses credentials:include and application-specific request headers.
// Both the login preflight and response must allow the real production origin WITH credentials.
const cors=await fetch(api+'/auth/login',{method:'OPTIONS',headers:{
  Origin:site,
  'Access-Control-Request-Method':'POST',
  'Access-Control-Request-Headers':'content-type,x-metadrive-request-source'
},signal:AbortSignal.timeout(20000)});
console.log('Login preflight:',cors.status,'origin:',cors.headers.get('access-control-allow-origin'),
  'credentials:',cors.headers.get('access-control-allow-credentials'));
if(cors.status!==204||cors.headers.get('access-control-allow-origin')!==site||
  cors.headers.get('access-control-allow-credentials')!=='true')
  throw new Error('Credentialed login CORS is not valid: HTTP '+cors.status);
console.log('Public Pages entry, Render SQL, and credentialed login CORS verified');
