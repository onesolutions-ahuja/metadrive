import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const kind=process.argv[2]==='integration'?'integration':'current';
const dir=resolve('tests',kind);
const files=readdirSync(dir).filter(f=>/\.test\.(?:ts|tsx|mjs)$/.test(f))
 .sort().map(f=>resolve(dir,f));
if(files.length===0)throw Error('No '+kind+' tests found');
const run=spawnSync(process.execPath,['--import','tsx','--test',
 '--test-concurrency=2',...files],{stdio:'inherit',env:process.env});
if(run.error)throw run.error;
process.exit(run.status??1);
