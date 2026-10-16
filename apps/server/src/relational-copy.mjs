// Shared transaction-friendly, fixed-schema row insert and verification helpers.
// Caller owns transaction, source/target safety checks and migration marker.
import assert from 'node:assert/strict';
import { relationalTables,readRelationalRows } from './relational-tables.mjs';
import { restoreState,stateDigest,verifyProjection } from './relational-projection.mjs';
export async function insertProjectedRows(client,rows) {
  for(const [key,table,columnList,toValues] of relationalTables) {
    const columns=columnList.split(',');
    const input=rows[key];
    const size=Math.min(150,Math.floor(60000/columns.length));
    for(let start=0;start<input.length;start+=size) {
      const batch=input.slice(start,start+size);
      const placeholders=batch.map((_,i)=>'('+columns.map((_,j)=>'$'+(i*columns.length+j+1)).join(',')+')').join(',');
      await client.query('INSERT INTO '+table+' ('+columnList+') VALUES '+placeholders,batch.flatMap(toValues));
    }
  }
}
export async function verifyRelationalCopy(client,sourceState,expectedRows) {
  const actual=await readRelationalRows(client);
  const restored=restoreState(actual);
  // Strict structural identity plus canonical checksum: no metadata or values can vanish.
  assert.deepStrictEqual(restored,sourceState);
  const expected=verifyProjection(sourceState,expectedRows).digest;
  assert.equal(stateDigest(restored),expected);
  return {sha256:expected,counts:Object.fromEntries(Object.entries(actual).map(([name,items])=>[name,items.length]))};
}
