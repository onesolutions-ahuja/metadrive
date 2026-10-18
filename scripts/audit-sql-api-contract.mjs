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
// Required visual Builder contracts are method-sensitive. The generic path-only
// compatibility baseline must never hide a missing operational save/edit route.
const dynamic=fs.readFileSync('apps/server/src/system-support/dynamic-api-routes.ts','utf8');
for(const m of dynamic.matchAll(/app\.(get|post|put|patch|delete)\(\s*['\"]\/api([^'\"]+)['\"]/g))routes.push({method:m[1].toUpperCase(),path:m[2]});
const builderRoutes=[
 ['GET','/metadata/apps'],['POST','/metadata/apps'],['PUT','/metadata/apps/:apiName'],
 ['DELETE','/metadata/apps/:apiName'],
 ['GET','/metadata/offline-publication'],
 ['POST','/named-credentials/:id/test'],['POST','/named-credentials/:id/rotate'],
 ['GET','/metadata/pages'],['GET','/metadata/pages/:apiName'],
 ['PUT','/metadata/pages/:apiName'],['DELETE','/metadata/pages/:apiName'],
 ['GET','/metadata/flows'],['GET','/metadata/flows/list'],
 ['GET','/metadata/flows/:apiName'],['PUT','/metadata/flows/:apiName'],
 ['DELETE','/metadata/flows/:apiName'],['POST','/metadata/flows/:apiName/validate']
];
for(const [method,route] of builderRoutes){
 const signature="app."+method.toLowerCase()+"('/api"+route+"'";
 if(!server.includes(signature)&&!dynamic.includes(signature))
  throw new Error('Missing required Builder API contract: '+method+' /api'+route);
}
if(!server.includes("'GET,POST,PUT,PATCH,DELETE,OPTIONS'"))
 throw new Error('Builder PUT methods must be allowed by tenant-scoped CORS preflight');
const calls=[];
for(const file of files){const txt=fs.readFileSync(file,'utf8');for(const m of txt.matchAll(/(?:apiRequest|request)\s*(?:<[^\n]*?>)?\s*\(\s*(['"`])(\/[^'"`\n]+)\1/g))calls.push({file,path:m[2].split('?')[0]});}
const matches=(route,target)=>{if(target==='/auth/users/')return ['/auth/users/:id/lock','/auth/users/:id/unlock'].every(path=>routes.some(r=>r.method==='POST'&&r.path===path));if(target.endsWith('/')&&route.startsWith(target)){const rest=route.slice(target.length);if(rest&&rest.split('/').every(part=>part.startsWith(':')))return true;}const a=route.split('/'),b=target.split('/');return a.length===b.length&&a.every((p,i)=>p===b[i]||p.startsWith(':')||b[i].includes('${'));};
const missed=[...new Map(calls.filter(x=>!routes.some(r=>matches(r.path,x.path))).map(x=>[x.path,x])).values()].sort((a,b)=>a.path.localeCompare(b.path));
const baseline=JSON.parse(fs.readFileSync('scripts/sql-api-compatibility-gaps.json','utf8')).unmatchedPaths;
const unexpected=missed.filter(x=>!baseline.includes(x.path));
const stale=baseline.filter(target=>!missed.some(x=>x.path===target));
if(stale.length){
 console.warn('SQL API compatibility baseline candidates for review:',stale);
}
if(unexpected.length){
 console.error('New frontend endpoints without matching SQL routes:',unexpected);
 process.exitCode=1;
}
console.log(JSON.stringify({frontendFiles:files.length,staticCalls:calls.length,serverRoutes:routes.length,unmatched:missed},null,2));
if(process.argv.includes('--strict')&&missed.length)process.exitCode=1;
