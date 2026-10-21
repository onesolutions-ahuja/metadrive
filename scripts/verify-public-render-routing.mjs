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
for(const path of scripts.slice(0,5)){
  const response=await fetch(site+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Public bundle missing: '+path+' HTTP '+response.status);
  const code=await response.text();
  renderFound ||=code.includes(api);
  railwayFound ||=code.includes(legacy);
}
console.log('Public entrypoint Render API binding found:',renderFound);
console.log('Public entrypoint legacy Railway API binding found:',railwayFound);
const health=await fetch(api+'/health',{cache:'no-store',signal:AbortSignal.timeout(20000)});
const payload=await health.json();
if(!health.ok||payload?.status!=='ok'||payload?.persistence!=='sql')
  throw new Error('Render SQL health failed: HTTP '+health.status);
const cors=await fetch(api+'/health',{method:'OPTIONS',headers:{
  Origin:site,'Access-Control-Request-Method':'GET'
},signal:AbortSignal.timeout(20000)});
if(cors.status!==204||cors.headers.get('access-control-allow-origin')!==site)
  throw new Error('Production origin CORS failed: HTTP '+cors.status);
if(railwayFound&&!renderFound)throw new Error('Live frontend still targets the deactivated Railway API');
console.log('Public Pages endpoint and Render SQL/CORS verified');
