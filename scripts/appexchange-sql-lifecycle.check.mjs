import assert from 'node:assert/strict';
import pg from 'pg';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:false});
try {
 const result=await pool.query('SELECT current_database() AS database_name');
 assert.equal(result.rowCount,1);
 console.log('SQL lifecycle test database available');
} finally {await pool.end();}
