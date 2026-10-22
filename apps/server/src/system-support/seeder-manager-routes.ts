import type {Express} from 'express';
import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {PlatformTenantService} from '../system-files/platform-tenant-service.js';
import {FRESH_CORE_OBJECTS} from '../app-seeders/fresh-core-objects.js';
import {FRESH_STANDARD_FIELDS} from '../app-seeders/fresh-standard-fields.js';
import {CART_OBJECTS} from '../app-seeders/cart-objects.js';
import {APPOINTMENT_OBJECTS,seedAppointmentObjects,grantAceAssistAppointmentAccess} from '../app-seeders/core-appointment-objects.js';
import {PRODUCT_IMAGE_FIELD} from '../app-seeders/product-image-field.js';

type SeedField={apiName:string;label:string;dataType:string;relatedObject?:string;maxLength?:number};
type SeedObject={apiName:string;label:string;fields:SeedField[]};
type Seed={id:string;label:string;description:string;objects:SeedObject[]};
const coreObjects:SeedObject[]=FRESH_CORE_OBJECTS.map(o=>({
  apiName:o.apiName,label:o.label,
  fields:[...o.fields,...('category' in o && o.category==='standard'
    ? (FRESH_STANDARD_FIELDS as Record<string,readonly SeedField[]>)[o.apiName]??[]:[])]
    .map(f=>({...f}))
}));
const cartObjects:SeedObject[]=CART_OBJECTS.map(o=>({apiName:o.apiName,label:o.label,fields:o.fields.map(f=>({...f}))}));
const appointmentObjects:SeedObject[]=APPOINTMENT_OBJECTS.map(o=>({
 apiName:o.apiName,label:o.label,fields:o.fields.map(f=>({...f}))
}));
const seeds:Seed[]=[
 {id:'appointment-objects',label:'Appointment standard object',description:'Appointment fields and scheduling metadata',objects:appointmentObjects},
 {id:'core-objects',label:'Core object catalog',description:'Standard and system object definitions and fields',objects:coreObjects},
 {id:'cart-objects',label:'Cart objects',description:'Cart and Cart Line',objects:cartObjects},
 {id:'product-image',label:'Product image field',description:'Adds Product.ImageUrl where missing',objects:[{apiName:'Product',label:'Product',fields:[{...PRODUCT_IMAGE_FIELD,apiName:PRODUCT_IMAGE_FIELD.apiName,label:PRODUCT_IMAGE_FIELD.label,dataType:PRODUCT_IMAGE_FIELD.dataType}]}]},
];

async function diff(client:PoolClient,tenantId:string,seed:Seed){
 const {rows:objects}=await client.query<{api_name:string}>(
  'SELECT api_name FROM md_object_definitions WHERE tenant_id=$1',[tenantId]);
 const {rows:fields}=await client.query<{object_api:string;api_name:string}>(
  'SELECT object_api,api_name FROM md_field_definitions WHERE tenant_id=$1 AND deleted_at IS NULL',[tenantId]);
 const objectSet=new Set(objects.map(x=>x.api_name));
 const fieldSet=new Set(fields.map(x=>x.object_api+'.'+x.api_name));
 const missingObjects=seed.objects.filter(o=>!objectSet.has(o.apiName)).map(o=>o.apiName);
 const missingFields=seed.objects.flatMap(o=>o.fields.filter(f=>!fieldSet.has(o.apiName+'.'+f.apiName)).map(f=>o.apiName+'.'+f.apiName));
 const targets=new Set([...objectSet,...seed.objects.map(o=>o.apiName)]);
 const unresolvedReferences=seed.objects.flatMap(o=>o.fields.filter(f=>f.relatedObject&&!targets.has(f.relatedObject)).map(f=>o.apiName+'.'+f.apiName+' → '+f.relatedObject));
 return {missingObjects,missingFields,unresolvedReferences,upToDate:missingObjects.length===0&&missingFields.length===0};
}

export function registerSeederManagerRoutes(app:Express,db:SqlPersistence,platformTenants:PlatformTenantService){
 async function context(req:any){
  const actor=req.actor;
  if(!actor)throw new Error('Authentication required');
  await platformTenants.requirePlatform(actor.tenant_id,actor.user_id);
  const slug=req.params.slug;
  if(typeof slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw Error('Invalid tenant');
  const {rows}=await db.query<{id:string}>('SELECT id FROM md_tenants WHERE slug=$1',[slug]);
  if(!rows[0])throw Error('Tenant not found');
  const seed=seeds.find(s=>s.id===req.params.seedId);
  if(!seed)throw Error('Seeder not found');
  return {tenantId:rows[0].id,seed};
 }
 app.get('/api/platform/seeders',async(req:any,res,next)=>{
  try {
   await platformTenants.requirePlatform(req.actor.tenant_id,req.actor.user_id);
   res.json({seeders:seeds.map(({id,label,description,objects})=>({id,label,description,objectCount:objects.length}))});
  }catch(e){next(e);}
 });
 app.get('/api/platform/tenants/:slug/seeders/:seedId/preview',async(req:any,res,next)=>{
  try {
   const {tenantId,seed}=await context(req);
   const result=await db.transaction(client=>diff(client,tenantId,seed));
   res.json({seedId:seed.id,...result});
  }catch(e){next(e);}
 });
 app.post('/api/platform/tenants/:slug/seeders/:seedId/apply',async(req:any,res,next)=>{
  try {
   const {tenantId,seed}=await context(req);
   const result=await db.transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['metadrive:seed-manager:'+tenantId]);
    const before=await diff(client,tenantId,seed);
    if(before.unresolvedReferences.length)throw Error('Missing referenced objects: '+before.unresolvedReferences.join(', '));
    const missingObjects=new Set(before.missingObjects);
    const missingFields=new Set(before.missingFields);
    for(const o of seed.objects)if(missingObjects.has(o.apiName))
      await client.query('INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,api_name) DO NOTHING',
       [tenantId,o.apiName,o.label,seed.id==='core-objects'&&FRESH_CORE_OBJECTS.some(core=>core.apiName===o.apiName&&core.category==='system')]);
    for(const o of seed.objects)for(const f of o.fields)if(missingFields.has(o.apiName+'.'+f.apiName))
      await client.query('INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object,max_length,required) VALUES($1,$2,$3,$4,$5,$6,$7,false) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING',
       [tenantId,o.apiName,f.apiName,f.label,f.dataType,f.relatedObject??null,f.maxLength??null]);
    if(seed.id==='appointment-objects'){
      await seedAppointmentObjects(client,tenantId);
      await grantAceAssistAppointmentAccess(client,tenantId);
    }
    const after=await diff(client,tenantId,seed);
    return {seedId:seed.id,createdObjects:before.missingObjects.filter(x=>!after.missingObjects.includes(x)),createdFields:before.missingFields.filter(x=>!after.missingFields.includes(x)),...after};
   });
   res.json(result);
  }catch(e){next(e);}
 });
}
