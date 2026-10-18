import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const built=new URL('../dist-system/system-files/',import.meta.url);
const support=new URL('../dist-system/system-support/',import.meta.url);
const [{SqlPersistence},{applySystemMigrations},{RbacEngine},{SystemDefinitionService},{AuthenticationService},{MfaService},{totpCodeAt}]=await Promise.all([
 'sql-persistence.js','system-migrations.js','rbac-engine.js','system-definition-service.js',
 'authentication.js','mfa-service.js','mfa-crypto.js'
].map(file=>import(new URL(file,['system-migrations.js','mfa-service.js','mfa-crypto.js'].includes(file)?support:built).href)));

const url=process.env.METADRIVE_SQL_TEST_DATABASE_URL;
if(!url)throw new Error('METADRIVE_SQL_TEST_DATABASE_URL is required');
const db=new SqlPersistence(url);
try{
 const core=readFileSync(fileURLToPath(new URL('../src/system-files/schema.sql',import.meta.url)),'utf8');
 await db.query(core);
 await applySystemMigrations(db);
 await applySystemMigrations(db);
 await db.verifySchema();
 const tenant=await db.query('INSERT INTO md_tenants(slug,name) VALUES ($1,$2) RETURNING id',['ci-isolated-tenant','CI tenant']);
 const tenantId=tenant.rows[0].id;
 const user=await db.query('INSERT INTO md_users(tenant_id,email,password_hash) VALUES($1,$2,$3) RETURNING id',
  [tenantId,'ci-user@example.invalid','ci-placeholder-hash']);
 const userId=user.rows[0].id;
 const set=await db.query('INSERT INTO md_permission_sets(tenant_id,api_name) VALUES($1,$2) RETURNING id',[tenantId,'CI']);
 await db.query('INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id) VALUES($1,$2,$3)',
  [tenantId,userId,set.rows[0].id]);
 await db.query('INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,$5)',
  [tenantId,set.rows[0].id,'SystemDefinition:reports','manage','allow']);
 const svc=new SystemDefinitionService(db,new RbacEngine(db));
 const saved=await svc.save(tenantId,userId,'reports',{apiName:'DailySales',label:'Daily Sales'});
 assert.equal(saved.revision,1);
 const updated=await svc.save(tenantId,userId,'reports',{apiName:'DailySales',label:'Daily Sales Updated',revision:1});
 assert.equal(updated.revision,2);
 await assert.rejects(()=>svc.save(tenantId,userId,'reports',{apiName:'DailySales',label:'Stale Update',revision:1}),/revision conflict/);
 await assert.rejects(()=>svc.list(tenantId,userId,'reports'),/Permission denied/);
 await db.query('INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,$3,$4,$5)',
  [tenantId,set.rows[0].id,'SystemDefinition:reports','read','allow']);
 assert.equal((await svc.list(tenantId,userId,'reports')).length,1);
 // Exercise the real SQL MFA challenge, TOTP enrollment, replay and session gates.
 process.env.METADRIVE_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 const auth=new AuthenticationService(db);
 const password='ci-authentication-password-123';
 await db.query('UPDATE md_users SET password_hash=$3 WHERE tenant_id=$1 AND id=$2',
   [tenantId,userId,await auth.hashPassword(password)]);
 await db.query("INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect) VALUES($1,$2,'Security','manage','allow')",
   [tenantId,set.rows[0].id]);
 const mfa=new MfaService(db,new RbacEngine(db),auth);
 const actor={tenant_id:tenantId,user_id:userId};
 assert.equal((await mfa.status(actor)).mode,'Off');
 await mfa.setPolicy(actor,{mode:'Required'});
 const pending=await mfa.beginLogin(tenantId,'ci-user@example.invalid',password);
 assert.equal(pending.mfa_required,true);
 assert.equal(pending.enrollment_required,true);
 assert.ok(pending.setup_secret);
 await assert.rejects(()=>mfa.verifyLogin(pending.challenge_token,'000000'),/Invalid MFA code/);
 const counter=Math.floor(Date.now()/30000);
 const code=totpCodeAt(pending.setup_secret,counter);
 const session=await mfa.verifyLogin(pending.challenge_token,code);
 assert.ok(session.accessToken);
 assert.equal((await auth.authenticate(session.accessToken)).user_id,userId);
 await assert.rejects(()=>mfa.verifyLogin(pending.challenge_token,code),/Invalid MFA challenge/);
 assert.equal((await mfa.status(actor)).enrolled,true);
 const next=await mfa.beginLogin(tenantId,'ci-user@example.invalid',password);
 assert.equal(next.enrollment_required,false);
 const verified=await mfa.verifyLogin(next.challenge_token,totpCodeAt(pending.setup_secret,counter+1));
 assert.ok(verified.accessToken);
 await mfa.setPolicy(actor,{mode:'Off'});
 await assert.rejects(()=>auth.authenticate(verified.accessToken),/Invalid session/);
 console.info('MFA tenant policy, SQL challenge, TOTP replay defense and revocation: passed');
 console.info('SQL system migrations, RBAC and metadata revision smoke: passed');
}finally{await db.close();}
