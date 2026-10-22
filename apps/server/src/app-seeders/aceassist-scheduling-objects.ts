import type {PoolClient} from 'pg';

/** Generic scheduling Objects. OwnerId is the staff user's tenant-scoped identity.
 * Avoid synthetic User records or duplicate staff credentials. */
export const ACEASSIST_SCHEDULING_OBJECTS=[
 {api:'BookableResource',label:'Bookable Resource',fields:[
  ['Name','Name','text',null],['ResourceType','Resource Type','text',null],
  ['Location','Location','text',null],['Capacity','Capacity','number',null],
  ['Active','Active','boolean',null]]},
 {api:'StaffAvailability',label:'Staff Availability',fields:[
  ['Name','Name','text',null],
  ['Weekday','Weekday','picklist',null],['StartTime','Start Time','time',null],
  ['EndTime','End Time','time',null],['Active','Active','boolean',null]]},
 {api:'AvailabilityException',label:'Availability Exception',fields:[
  ['Name','Name','text',null],
  ['Resource','Resource','reference','BookableResource'],
  ['StartDateTime','Start Date and Time','datetime',null],
  ['EndDateTime','End Date and Time','datetime',null],
  ['Reason','Reason','text',null],['Active','Active','boolean',null]]}
] as const;
export const ACEASSIST_SCHEDULING_FIELD_NAMES:Record<string,string[]>=
 Object.fromEntries(ACEASSIST_SCHEDULING_OBJECTS.map(item=>[item.api,item.fields.map(field=>field[0])]));
/** Rerunnable only for installed, licensed AceAssist tenants; never overwrites metadata. */
export async function seedAceAssistSchedulingObjects(client:PoolClient,tenantId:string):Promise<void>{
 for(const object of ACEASSIST_SCHEDULING_OBJECTS)
  await client.query(`INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
   VALUES($1,$2,$3,false) ON CONFLICT(tenant_id,api_name) DO NOTHING`,
   [tenantId,object.api,object.label]);
 // Referenced objects are registered before any reference field.
 for(const object of ACEASSIST_SCHEDULING_OBJECTS)
  for(const [api,label,type,related] of object.fields){
   if(related){
    const existing=await client.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
     [tenantId,related]);
    if(!existing.rowCount)continue;
   }
   await client.query(`INSERT INTO md_field_definitions
    (tenant_id,object_api,api_name,label,data_type,related_object,required,default_value)
    VALUES($1,$2,$3,$4,$5,$6,false,$7) ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,
    [tenantId,object.api,api,label,type,related,api==='Active'?'true':null]);
  }
 const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 for(const [index,value] of weekdays.entries())
  await client.query(`INSERT INTO md_field_picklist_values
   (tenant_id,object_api,field_api,value,sort_order)
   VALUES($1,'StaffAvailability','Weekday',$2,$3) ON CONFLICT DO NOTHING`,
   [tenantId,value,(index+1)*10]);
}
