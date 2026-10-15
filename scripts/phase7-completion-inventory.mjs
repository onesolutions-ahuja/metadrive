import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {extname} from 'node:path';
const sourceExtensions=new Set(['.ts','.tsx','.js','.jsx','.mjs','.css']);
export function inventoryTrackedSources({root=process.cwd(),tracked}={}){
 const files=tracked??execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
 const result=[];
 for(const path of files){
  if(!sourceExtensions.has(extname(path))||!path.startsWith('apps/')&&!path.startsWith('scripts/'))continue;
  if(/(^|\/)(node_modules|dist|build|\.next)(\/|$)/.test(path))continue;
  const source=readFileSync(root+'/'+path,'utf8');
  const lines=source.split('\n').length-(source.endsWith('\n')?1:0);
  result.push({path,lines,oversized:lines>4000,
   businessCoreReference:path.startsWith('apps/server/src/')&&/\b(?:Kiosk|POS|Till|KDS)\b/.test(source)});
 }
 return result.sort((a,b)=>a.path.localeCompare(b.path));
}
export function summarizeCompletionInventory(rows){
 return {
  sourceFiles:rows.length,
  oversizedFiles:rows.filter(x=>x.oversized).length,
  oversized:rows.filter(x=>x.oversized).sort((a,b)=>b.lines-a.lines).slice(0,30),
  platformBusinessReferences:rows.filter(x=>x.businessCoreReference).map(x=>x.path)
 };
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const output=summarizeCompletionInventory(inventoryTrackedSources());
 if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(output,null,2)+'\n');
 else process.stdout.write('Tracked source '+output.sourceFiles+', oversized '+output.oversizedFiles+
  ', backend business-specific reference candidates '+output.platformBusinessReferences.length+'\n');
}
