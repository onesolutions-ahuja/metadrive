/** Phase 2 operator command: read-only verification against the target PostgreSQL database.
 * This intentionally does not mutate live tenant components or activate a
 * registry when its source revision/payload cannot be reconstructed.
 */
import pg from 'pg';
import {inspectRegistrySource} from '../src/modules/metadata/registry-activation-preflight.mjs';
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw Error('DATABASE_URL is required for verified SQL preflight');
const db=new pg.Client({connectionString});
try{
 await db.connect();
 const report=await inspectRegistrySource(db);
 console.log(JSON.stringify(report,null,2));
 if(!report.ready)process.exitCode=1;
}finally{await db.end();}
