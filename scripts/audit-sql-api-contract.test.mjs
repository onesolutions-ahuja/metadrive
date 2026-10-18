import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('SQL API audit scans all TypeScript frontend sources and SQL route modules',()=>{
 const output=execFileSync(process.execPath,['scripts/audit-sql-api-contract.mjs'],{encoding:'utf8'});
 const report=JSON.parse(output);
 assert.ok(report.frontendFiles>0);
 assert.ok(report.backendRouteFiles>1);
 assert.ok(report.frontendCalls>0);
 assert.ok(report.routeContracts>0);
 assert.equal(report.gaps.length,report.confirmedStaticGaps);
 assert.equal(Object.values(report.byArea).reduce((a,b)=>a+b,0),report.gaps.length);
 const seen=new Set();
 for(const gap of report.gaps){
  assert.match(gap.path,/^\//);
  assert.ok(['GET','PUT','POST','PATCH','DELETE'].includes(gap.method));
  const key=gap.method+' '+gap.path;
  assert.ok(!seen.has(key),'duplicate API contract: '+key);
  seen.add(key);
  assert.ok(gap.file&&gap.line>0);
 }
});
