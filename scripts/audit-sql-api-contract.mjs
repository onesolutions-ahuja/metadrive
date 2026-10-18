import fs from 'node:fs';
import path from 'node:path';
const root='apps/web/src';
const server=fs.readFileSync('apps/server/src/system-support/server.ts','utf8');
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(p))files.push(p);}}
walk(root);
const routes=[...server.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"]\/api([^'"]+)['"]/g)].map(m=>({method:m[1].toUpperCase(),path:m[2]}));
const kinds=['platform-events','email-alerts','approval-processes','dashboards','dashboard-folders','dashboard-territories','reports','report-folders','connector-providers','integration-connections'];
for(const name of kinds)for(const method of ['GET','POST','PUT','DELETE'])routes.push({method,path:(name.startsWith('connector')||name.startsWith('integration')?'':'/metadata')+'/'+name+(method==='PUT'||method==='DELETE'?'/:apiName':'')});
const calls=[];
for(const file of files){const txt=fs.readFileSync(file,'utf8');for(const m of txt.matchAll(/(?:apiRequest|request)\s*(?:<[^\n]*?>)?\s*\(\s*(['"`])(\/[^'"`\n]+)\1/g))calls.push({file,path:m[2].split('?')[0]});}
const matches=(route,target)=>{if(target.endsWith('/')&&route.startsWith(target)){const tail=route.slice(target.length).split('/');return tail.length>0&&tail.every(p=>p.startsWith(':'));}const a=route.split('/'),b=target.split('/');return a.length===b.length&&a.every((p,i)=>p===b[i]||p.startsWith(':')||b[i].includes('${'));};
const missed=[...new Map(calls.filter(x=>!routes.some(r=>matches(r.path,x.path))).map(x=>[x.path,x])).values()].sort((a,b)=>a.path.localeCompare(b.path));
const baseline=JSON.parse(fs.readFileSync('scripts/sql-api-compatibility-gaps.json','utf8')).unmatchedPaths;
const unexpected=missed.filter(x=>!baseline.includes(x.path));
if(unexpected.length){
 console.error('New frontend endpoints without matching SQL routes:',unexpected);
 process.exitCode=1;
}
console.log(JSON.stringify({frontendFiles:files.length,staticCalls:calls.length,serverRoutes:routes.length,unmatched:missed},null,2));
if(process.argv.includes('--strict')&&missed.length)process.exitCode=1;
