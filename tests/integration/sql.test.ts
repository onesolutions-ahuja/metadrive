import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
if(!process.env.METADRIVE_TEST_DATABASE_URL)
 throw Error('METADRIVE_TEST_DATABASE_URL is required for isolated integration testing');
if(process.env.METADRIVE_TEST_ALLOW_WRITES!=='true')
 throw Error('METADRIVE_TEST_ALLOW_WRITES=true required (disposable DB only)');
test('disposable SQL transactions roll back cleanly',async()=>{
 const db=new pg.Client({connectionString:process.env.METADRIVE_TEST_DATABASE_URL,
  connectionTimeoutMillis:8000});
 await db.connect();
 try {
  await db.query('BEGIN');
  await db.query('CREATE TEMP TABLE md_test_probe (id text primary key)');
  await db.query('INSERT INTO md_test_probe(id) VALUES($1)',['probe']);
  const result=await db.query('SELECT id FROM md_test_probe');
  assert.deepEqual(result.rows,[{id:'probe'}]);
  await db.query('ROLLBACK');
 } finally {await db.end();}
});
