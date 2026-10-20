import {readdirSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';

const groups=['unit','integration','tenant-isolation','app-lifecycle'];
const discovery=[
 ['apps/server/test/system',(name)=>name.endsWith('.test.ts')],
 ['apps/web/test',(name)=>name.endsWith('.test.ts')||name.endsWith('.test.mjs')]
];
function discover(root,eligible){
 const found=[];
 function scan(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   const filepath=path.posix.join(dir,entry.name);
   if(entry.isDirectory())scan(filepath);
   else if(entry.isFile()&&eligible(entry.name))found.push(filepath);
  }
 }
 scan(root);
 return found;
}
const canonical=new Set(discovery.flatMap(([root,predicate])=>discover(root,predicate)));
const assigned=new Set();
for(const group of groups){
 const suite=JSON.parse(readFileSync('tests/'+group+'/suite.json','utf8'));
 if(suite.category!==group||!Array.isArray(suite.tests)||suite.tests.length===0)
  throw new Error('Invalid test suite: '+group);
 for(const filepath of suite.tests){
  if(typeof filepath!=='string'||!canonical.has(filepath))
   throw new Error('Missing or invalid '+group+' test: '+String(filepath));
  if(assigned.has(filepath))throw new Error('Test assigned to two suites: '+filepath);
  assigned.add(filepath);
 }
}
const missing=[...canonical].filter(filepath=>!assigned.has(filepath));
if(missing.length)throw new Error('Tests missing from suite manifests: '+missing.join(', '));
const browser=JSON.parse(readFileSync('tests/browser-e2e/suite.json','utf8'));
if(browser.category!=='browser-e2e'||!existsSync('apps/server/scripts/builder-browser-smoke.mjs'))
 throw new Error('Browser E2E suite must retain real SQL browser smoke');
console.log('Verified '+assigned.size+' test files across four suites and SQL browser E2E entrypoint.');
