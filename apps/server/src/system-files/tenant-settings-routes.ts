import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import {AuthenticationService} from './authentication.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const companyColumns={
 logoUrl:'logo_url',legalName:'legal_name',tradingName:'trading_name',website:'website',
 phone:'phone',email:'email',addressLine1:'address_line1',addressLine2:'address_line2',
 city:'city',postcode:'postcode',country:'country',timezone:'timezone',
 locale:'locale',description:'description'
} as const;
type CompanyKey=keyof typeof companyColumns;
const companyKeys=Object.keys(companyColumns) as CompanyKey[];
const defaults:Record<CompanyKey,string>=Object.fromEntries(
 companyKeys.map(key=>[key,key==='timezone'?'Europe/London':key==='locale'?'en-GB':''])
) as Record<CompanyKey,string>;
const code=/^[A-Z]{3}$/;
export function registerTenantSettingsRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 app.get('/api/tenant/developer-account',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'Tenant','read');
  const {rows}=await db.query<{id:string;email:string;enabled:boolean}>(`
    SELECT u.id,u.email,u.enabled FROM md_users u JOIN md_user_roles ur
      ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
    JOIN md_roles role ON role.tenant_id=ur.tenant_id AND role.id=ur.role_id
    WHERE u.tenant_id=$1 AND role.api_name='TenantDeveloper' ORDER BY u.id LIMIT 1`,
    [a.tenant_id]);
  const developer=rows[0];
  res.json(developer?{seeded:true,userId:developer.id,email:developer.email,active:developer.enabled,
    activated:developer.enabled,tenantControlled:true,initialPermissions:'OneEngineDeveloper'}:{seeded:false});
 }));
 app.post('/api/tenant/developer-account/activate',wrap(async(req,res)=>{
  const a=req.actor!,password=req.body?.password;
  await rbac.require(a.tenant_id,a.user_id,'Tenant','manage');
  if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Invalid developer password');
  const hash=await new AuthenticationService(db).hashPassword(password);
  await db.transaction(async client=>{
   const {rows}=await client.query<{id:string;enabled:boolean}>(`
    SELECT u.id,u.enabled FROM md_users u JOIN md_user_roles ur
      ON ur.tenant_id=u.tenant_id AND ur.user_id=u.id
    JOIN md_roles role ON role.tenant_id=ur.tenant_id AND role.id=ur.role_id
    WHERE u.tenant_id=$1 AND role.api_name='TenantDeveloper' FOR UPDATE OF u`,[a.tenant_id]);
   if(rows.length!==1)throw Error('Tenant developer identity is missing or ambiguous');
   if(rows[0].enabled)throw Error('Developer account is already active');
   await client.query('UPDATE md_users SET enabled=true,password_hash=$3 WHERE tenant_id=$1 AND id=$2',
    [a.tenant_id,rows[0].id,hash]);
   await client.query('INSERT INTO md_tenant_security_events(tenant_id,actor_id,target_user_id,event_type) VALUES($1,$2,$3,$4)',
    [a.tenant_id,a.user_id,rows[0].id,'developer_account_activation']);
  });
  res.json({activated:true});
 }));
 app.get('/api/tenant/recovery/contacts',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'Tenant','read');
  const {rows}=await db.query<{email:string;enrolled_at:Date;verified_at:Date|null}>(`
   SELECT email,enrolled_at,verified_at FROM md_tenant_recovery_contacts
    WHERE tenant_id=$1 ORDER BY enrolled_at`,[a.tenant_id]);
  res.json({contacts:rows.map(r=>({email:r.email,verified:Boolean(r.verified_at),enrolledAt:r.enrolled_at}))});
 }));
 app.get('/api/tenant/company-profile',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'Tenant','read');
  const {rows}=await db.query<Record<string,string>>(
   'SELECT * FROM md_tenant_company_settings WHERE tenant_id=$1',[a.tenant_id]);
  const profile={...defaults};
  if(rows[0])for(const key of companyKeys)profile[key]=rows[0][companyColumns[key]];
  res.json({profile});
 }));
 app.put('/api/tenant/company-profile',wrap(async(req,res)=>{
  const a=req.actor!,body=req.body;
  await rbac.require(a.tenant_id,a.user_id,'Tenant','edit');
  if(!body||typeof body!=='object'||Array.isArray(body)
   ||Object.keys(body).some(key=>!companyKeys.includes(key as CompanyKey)))
   throw Error('Invalid company profile');
  const profile={...defaults};
  for(const key of companyKeys){
   const value=body[key]??profile[key];
   if(typeof value!=='string'||value.length>4000)throw Error('Invalid company profile property');
   profile[key]=value.trim();
  }
  if(profile.logoUrl&&(!/^https:\/\//i.test(profile.logoUrl)||profile.logoUrl.length>2048))
   throw Error('Company logo must use HTTPS');
  if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
   throw Error('Invalid company email');
  const columns=companyKeys.map(key=>companyColumns[key]);
  const args=companyKeys.map(key=>profile[key]);
  await db.query(`INSERT INTO md_tenant_company_settings(tenant_id,${columns.join(',')})
   VALUES($1,${columns.map((_,i)=>'$'+(i+2)).join(',')})
   ON CONFLICT(tenant_id) DO UPDATE SET ${columns.map(x=>x+'=EXCLUDED.'+x).join(',')},updated_at=now()`,
   [a.tenant_id,...args]);
  res.json({profile});
 }));
 app.get('/api/metadata/currencies',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'Tenant','read');
  const [base,rates]=await Promise.all([
   db.query<{corporate_currency:string;standard_vat_rate:string}>(
    'SELECT corporate_currency,standard_vat_rate FROM md_tenant_currency_settings WHERE tenant_id=$1',[a.tenant_id]),
   db.query<{currency_code:string;conversion_rate:string}>(
    'SELECT currency_code,conversion_rate FROM md_tenant_currency_rates WHERE tenant_id=$1 ORDER BY currency_code',[a.tenant_id])
  ]);
  const corporateCurrency=base.rows[0]?.corporate_currency??'USD';
  res.json({corporateCurrency,standardVatRate:Number(base.rows[0]?.standard_vat_rate??20),
   currencies:rates.rows.length?rates.rows.map(r=>({currencyIsoCode:r.currency_code,conversionRate:Number(r.conversion_rate)}))
    :[{currencyIsoCode:corporateCurrency,conversionRate:1}]});
 }));
 app.put('/api/metadata/currencies',wrap(async(req,res)=>{
  const a=req.actor!,body=req.body;
  await rbac.require(a.tenant_id,a.user_id,'Tenant','edit');
  if(!body||!code.test(body.corporateCurrency)||typeof body.standardVatRate!=='number'
   ||!Number.isFinite(body.standardVatRate)||body.standardVatRate<0||body.standardVatRate>100
   ||!Array.isArray(body.currencies)||!body.currencies.length||body.currencies.length>100)
   throw Error('Invalid currency configuration');
  const used=new Set<string>();
  for(const value of body.currencies){
   if(!value||typeof value!=='object'||!code.test(value.currencyIsoCode)
    ||used.has(value.currencyIsoCode)||typeof value.conversionRate!=='number'
    ||!Number.isFinite(value.conversionRate)||value.conversionRate<=0||value.conversionRate>1e9)
    throw Error('Invalid currency conversion rate');
   used.add(value.currencyIsoCode);
  }
  if(!used.has(body.corporateCurrency))throw Error('Corporate currency must be included');
  await db.transaction(async client=>{
   await client.query(`INSERT INTO md_tenant_currency_settings(tenant_id,corporate_currency,standard_vat_rate)
    VALUES($1,$2,$3) ON CONFLICT(tenant_id) DO UPDATE SET
    corporate_currency=EXCLUDED.corporate_currency,standard_vat_rate=EXCLUDED.standard_vat_rate`,
    [a.tenant_id,body.corporateCurrency,body.standardVatRate]);
   for(const item of body.currencies)await client.query(`
    INSERT INTO md_tenant_currency_rates(tenant_id,currency_code,conversion_rate)
    VALUES($1,$2,$3) ON CONFLICT(tenant_id,currency_code)
    DO UPDATE SET conversion_rate=EXCLUDED.conversion_rate`,
    [a.tenant_id,item.currencyIsoCode,item.conversionRate]);
   await client.query('DELETE FROM md_tenant_currency_rates WHERE tenant_id=$1 AND NOT(currency_code=ANY($2::text[]))',
    [a.tenant_id,[...used]]);
  });
  res.json({corporateCurrency:body.corporateCurrency,standardVatRate:body.standardVatRate,
   currencies:body.currencies});
 }));
 app.get('/api/metadata/automation-settings',wrap(async(req,res)=>{
  const a=req.actor!;await rbac.require(a.tenant_id,a.user_id,'Tenant','read');
  const {rows}=await db.query<{auto_retry_failed_flows:boolean;max_retry_attempts:number;conversation_idle_minutes:number}>(
   'SELECT auto_retry_failed_flows,max_retry_attempts,conversation_idle_minutes FROM md_tenant_automation_settings WHERE tenant_id=$1',
   [a.tenant_id]);
  const s=rows[0];
  res.json({autoRetryFailedFlows:s?.auto_retry_failed_flows??false,
   maxRetryAttempts:s?.max_retry_attempts??10,conversationIdleMinutes:s?.conversation_idle_minutes??15});
 }));
 app.put('/api/metadata/automation-settings',wrap(async(req,res)=>{
  const a=req.actor!,body=req.body;
  await rbac.require(a.tenant_id,a.user_id,'Tenant','edit');
  if(!body||typeof body.autoRetryFailedFlows!=='boolean'
   ||!Number.isInteger(body.maxRetryAttempts)||body.maxRetryAttempts<0||body.maxRetryAttempts>100
   ||!Number.isInteger(body.conversationIdleMinutes)||body.conversationIdleMinutes<1
   ||body.conversationIdleMinutes>1440)
   throw Error('Invalid automation settings');
  await db.query(`INSERT INTO md_tenant_automation_settings
   (tenant_id,auto_retry_failed_flows,max_retry_attempts,conversation_idle_minutes)
   VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id) DO UPDATE SET
   auto_retry_failed_flows=EXCLUDED.auto_retry_failed_flows,
   max_retry_attempts=EXCLUDED.max_retry_attempts,
   conversation_idle_minutes=EXCLUDED.conversation_idle_minutes`,
   [a.tenant_id,body.autoRetryFailedFlows,body.maxRetryAttempts,body.conversationIdleMinutes]);
  res.json({autoRetryFailedFlows:body.autoRetryFailedFlows,
   maxRetryAttempts:body.maxRetryAttempts,conversationIdleMinutes:body.conversationIdleMinutes});
 }));
}
