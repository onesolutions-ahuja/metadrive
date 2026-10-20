import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {AuthenticationService} from '../../src/system-files/authentication.js';

test('refresh preserves MFA verification in both newly minted session families',async()=>{
 let inserts=0;
 const db={transaction:async<T>(run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<T>)=>
  run({query:async(sql:string,args:unknown[])=>{
   if(sql.startsWith('UPDATE md_refresh_sessions'))return {rows:[{tenant_id:'tenant',user_id:'user',mfa_verified:true,absolute_expires_at:new Date(Date.now()+86400000),last_seen_at:new Date(),family_id:'family'}],rowCount:1};
   if(sql.includes('md_session_policies'))return {rows:[]};
   if(sql.includes('md_login_boundary_allowed'))return {rows:[{allowed:true,trusted:false}]};
   if(sql.startsWith('SELECT u.id'))return {rows:[{id:'user'}],rowCount:1};
   if(sql.startsWith('INSERT INTO md_sessions')||sql.startsWith('INSERT INTO md_refresh_sessions')){
    assert.match(sql,/mfa_verified/);
    assert.ok(args.length>=7);
    assert.equal(args.at(-1),'family');
    assert.equal(args[4],true);
    inserts++;
    return {rows:[],rowCount:1};
   }
   throw Error('Unexpected SQL query: '+sql);
  }})} as unknown as SqlPersistence;
 const session=await new AuthenticationService(db).refresh('A'.repeat(43));
 assert.ok(session.accessToken);
 assert.equal(inserts,2);
});
