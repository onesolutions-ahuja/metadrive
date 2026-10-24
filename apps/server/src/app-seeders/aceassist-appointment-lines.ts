import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';
import {ACEASSIST_BOOKING_OVERLAP,ACEASSIST_BOOKING_AVAILABILITY} from './aceassist-booking-guards.js';

export const APPOINTMENT_LINE_CREATE_FLOW='AceAssistCreateAppointmentWithLinesV1';
export const APPOINTMENT_LINE_LOAD_FLOW='AceAssistLoadAppointmentLine';
const fields=[
 ['Name','Service Name','text',null],
 ['Appointment','Appointment','reference','Appointment'],
 ['Product','Product / Service','reference','Product'],
 ['Quantity','Quantity','number',null],
 ['UnitPrice','Unit Price','number',null],
 ['DurationMinutes','Duration Minutes','number',null]
] as const;
const link=(from:number,to:number,label='Next')=>({from,to,kind:'normal',label});
const node=(id:number,type:string,label:string,config:Record<string,unknown>={})=>({id,type,label,config});
const resource=(name:string,type='Text')=>({name,type:'Variable',dataType:type,availableForInput:true});
function booking(){
 const header=['Name','StartDateTime','EndDateTime','Status','Customer','Service','ServiceProduct',
 'Location','AssignedTo','Notes','TimeZone'];
 return {
  apiName:APPOINTMENT_LINE_CREATE_FLOW,label:'Ace Assist - Create appointment with all service lines',
  appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
  startConfig:{businessCalendarGuard:{startInput:'StartDateTime',endInput:'EndDateTime'}},
  resources:[
   ...header.map(x=>resource(x)),
   {name:'lineInputs',type:'Record Collection',dataType:'AppointmentLine',isCollection:true,availableForInput:true},
   {name:'lineInput',type:'Record',dataType:'AppointmentLine'},
   {name:'appointmentId',type:'Variable',dataType:'Text',availableForOutput:true}
  ],
  elements:[
   node(1,'Start','Start',{executionContext:'User'}),
   node(2,'Create Records','Create guarded appointment',{
    object:'Appointment',recordSource:'fields',
    overlapGuard:ACEASSIST_BOOKING_OVERLAP,availabilityGuard:ACEASSIST_BOOKING_AVAILABILITY,
    fieldValues:header.map(field=>({field,value:'{!'+field+'}'}))
   }),
   node(3,'Loop','For each selected service',{collection:'lineInputs',loopVariable:'lineInput',direction:'First to last'}),
   node(4,'Create Records','Create appointment service line',{
    object:'AppointmentLine',recordSource:'fields',fieldValues:[
     {field:'Name',value:'{!lineInput.Name}'},
     {field:'Appointment',value:'{!record2.Id}'},
     {field:'Product',value:'{!lineInput.Product}'},
     {field:'Quantity',value:'{!lineInput.Quantity}'},
     {field:'UnitPrice',value:'{!lineInput.UnitPrice}'},
     {field:'DurationMinutes',value:'{!lineInput.DurationMinutes}'}
    ]
   }),
   node(5,'Assignment','Return appointment ID',{variable:'appointmentId',operator:'Assign',value:'{!record2.Id}'}),
   node(6,'End','Done')
  ],
  connectors:[link(1,2),link(2,3),link(3,4,'For Each'),link(4,3),link(3,5,'After Last'),link(5,6)]
 };
}
function loader(){
 return {
  apiName:APPOINTMENT_LINE_LOAD_FLOW,label:'Ace Assist - Load appointment service lines',
  appApiName:'AceAssist',flowType:'Autolaunched Flow',status:'Active',version:1,tests:[],
  resources:[{name:'appointmentLineRecords',type:'Record Collection',dataType:'AppointmentLine',availableForOutput:true}],
  elements:[
   node(1,'Start','Start',{executionContext:'User'}),
   node(2,'Get Records','Load authorised appointment service lines',{
    object:'AppointmentLine',recordLimit:'all',outputVariable:'appointmentLineRecords'}),
   node(3,'End','Done')
  ],connectors:[link(1,2),link(2,3)]
 };
}
export async function seedAppointmentLines(client:PoolClient,tenantId:string):Promise<number>{
 await client.query(`INSERT INTO md_object_definitions(tenant_id,api_name,label,is_system)
 VALUES($1,'AppointmentLine','Appointment Service Line',false)
 ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
 for(const [api,label,type,related] of fields)await client.query(`
 INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,related_object,required)
 VALUES($1,'AppointmentLine',$2,$3,$4,$5,false)
 ON CONFLICT(tenant_id,object_api,api_name) DO NOTHING`,[tenantId,api,label,type,related]);
 let created=0;
 for(const graph of [booking(),loader()]){
  const existing=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2',
   [tenantId,graph.apiName]);
  if(!existing.rowCount){
   const {rows}=await client.query<{id:string}>(`INSERT INTO md_flow_definitions
   (tenant_id,api_name,label,flow_type,version,active)
   VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
   [tenantId,graph.apiName,graph.label]);
   const entries:Array<{path:string;kind:string;text:string|null}>=[];
   encodeMetadataValue(graph,'/builder',entries);
   for(const e of entries)await client.query(`INSERT INTO md_flow_editor_values
    (tenant_id,flow_id,property_path,value_kind,value_text)
    VALUES($1,$2,$3,$4,$5)`,[tenantId,rows[0].id,e.path,e.kind,e.text]);
   created++;
  }
 }
 const permissions=[
  ['AppointmentLine','read'],['AppointmentLine','create'],
  ...fields.flatMap(([api])=>[['AppointmentLine.'+api,'read'],['AppointmentLine.'+api,'create']]),
  ['Flow:'+APPOINTMENT_LINE_CREATE_FLOW,'execute'],['Flow:'+APPOINTMENT_LINE_LOAD_FLOW,'execute']
 ];
 for(const [resource,action] of permissions)await client.query(`
 INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
 SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
 WHERE p.tenant_id=$1 AND p.api_name='AceAssistUser' ON CONFLICT DO NOTHING`,
 [tenantId,resource,action]);
 return created;
}
