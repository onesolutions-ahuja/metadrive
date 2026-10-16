import fs from 'node:fs/promises';
const token=process.env.GITHUB_TOKEN;
const repo=process.env.GITHUB_REPOSITORY;
let result={login:'unverified',providers:{},report:'No execution artifact was produced'};
try{result=JSON.parse(await fs.readFile('module11-live-smoke-result.json','utf8'));}catch{}
const publicResult={login:String(result.login||'unknown').slice(0,60),providers:Object.fromEntries(Object.entries(result.providers||{}).map(([name,x])=>[name,{status:String(x.status||'unknown').slice(0,80),executeHttpStatus:x.executeHttpStatus??null,flowStatus:String(x.flowStatus||'unknown').slice(0,60)}]))};
const response=await fetch('https://api.github.com/repos/'+repo+'/issues/236/comments',{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({body:'MD11 live smoke workflow (run '+String(process.env.GITHUB_RUN_ID||'')+') result: \\n\\n```json\\n'+JSON.stringify(publicResult,null,2)+'\\n```'})});
if(!response.ok)throw Error('Could not publish masked result: HTTP '+response.status);
console.log('Masked test result published to PR #236');
