import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root='apps/web/src',backend='apps/server/src/system-files';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):/\.[cm]?[jt]sx?$/.test(e.name)?[p]:[];});
const read=p=>fs.readFileSync(p,'utf8');
const ast=p=>ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,p.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
const literal=n=>ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)?n.text:null;
function textPath(n){
 const s=literal(n);if(s!==null)return {path:s,dynamic:false};
 if(ts.isTemplateExpression(n))return {path:n.head.text+n.templateSpans.map(s=>':dynamic'+s.literal.text).join(''),dynamic:false};
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken){
  const l=textPath(n.left),r=textPath(n.right);
  if(l&&r)return {path:l.path+r.path,dynamic:l.dynamic||r.dynamic};
  if(l)return {path:l.path+':dynamic',dynamic:true};
 }
 return null;
}
const visit=(node,fn)=>{fn(node);ts.forEachChild(node,n=>visit(n,fn));};
const routes=[],routeFiles=walk(backend).filter(p=>p.endsWith('server.ts')||p.endsWith('-routes.ts'));
for(const file of routeFiles){const a=ast(file);visit(a,n=>{
 if(!ts.isCallExpression(n)||!ts.isPropertyAccessExpression(n.expression))return;
 const method=n.expression.name.text.toUpperCase();
 if(!['GET','POST','PUT','PATCH','DELETE'].includes(method)||n.expression.expression.getText(a)!=='app')return;
 const p=n.arguments[0]&&textPath(n.arguments[0]);
 if(p?.path.startsWith('/api')&&!p.dynamic)routes.push({file,method,path:p.path.slice(4)});
});}
// Shared SQL metadata definition loop and Builder routes are generated rather than written as literals.
for(const name of ['platform-events','email-alerts','approval-processes','dashboards','dashboard-folders','dashboard-territories','report-folders','reports','connector-providers','integration-connections']){
 const prefix=['connector-providers','integration-connections'].includes(name)?'/':'/metadata/';
 for(const method of ['GET','POST'])routes.push({file:'system-definitions',method,path:prefix+name});
 for(const method of ['PUT','DELETE'])routes.push({file:'system-definitions',method,path:prefix+name+'/:apiName'});
}
for(const kind of ['flows','pages']){
 routes.push({file:'builder-sql-routes',method:'PUT',path:'/metadata/'+kind+'/:apiName'});
 routes.push({file:'builder-sql-routes',method:'POST',path:'/metadata/'+kind+'/:apiName/validate'});
 routes.push({file:'builder-sql-routes',method:'DELETE',path:'/metadata/'+kind+'/:apiName'});
}
const calls=[],dynamic=[],frontendFiles=walk(root);
for(const file of frontendFiles){const a=ast(file);visit(a,n=>{
 if(!ts.isCallExpression(n))return;
 const name=ts.isIdentifier(n.expression)?n.expression.text:ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:'';
 if(!['apiRequest','request','fetch'].includes(name))return;
 const first=n.arguments[0];if(!first)return;
 const p=textPath(first),line=a.getLineAndCharacterOfPosition(n.getStart(a)).line+1;
 if(!p){if(name!=='fetch')dynamic.push({file,line,expression:first.getText(a).slice(0,120)});return;}
 if(name==='fetch'&&!p.path.startsWith('/api/'))return;
 const pathname=(p.path.startsWith('/api/')?p.path.slice(4):p.path).split('?')[0];
 if(!pathname.startsWith('/'))return;
 let method='GET',options=n.arguments[1];
 if(options&&ts.isObjectLiteralExpression(options))for(const prop of options.properties){
  if(!ts.isPropertyAssignment(prop)||prop.name.getText(a).replace(/["']/g,'')!=='method')continue;
  method=literal(prop.initializer)?.toUpperCase()??'UNKNOWN';
 }
 const item={file,line,method,path:pathname};
 if(p.dynamic||method==='UNKNOWN')dynamic.push(item);else calls.push(item);
});}
const matches=(r,c)=>{
 if(r.method!==c.method)return false;
 const a=r.path.split('/'),b=c.path.split('/');
 return a.length===b.length&&a.every((part,i)=>part===b[i]||part.startsWith(':'));
};
const gaps=[...new Map(calls.filter(c=>!routes.some(r=>matches(r,c))).map(c=>[c.method+' '+c.path,c])).values()];
const byArea={};for(const c of gaps){const area=c.path.split('/')[1]??'root';byArea[area]=(byArea[area]??0)+1;}
const report={frontendFiles:frontendFiles.length,backendRouteFiles:routeFiles.length,routeContracts:routes.length,frontendCalls:calls.length,unresolvedDynamic:dynamic.length,confirmedStaticGaps:gaps.length,byArea,gaps,dynamic};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--strict')&&(gaps.length||dynamic.length))process.exitCode=1;
else if(process.argv.includes('--fail-new')){
 const baseline=JSON.parse(read('scripts/sql-api-compatibility-gaps.json')).unmatchedPaths;
 const added=gaps.filter(c=>!baseline.includes(c.path));
 if(added.length){console.error('New frontend SQL API gaps:',added);process.exitCode=1;}
}
