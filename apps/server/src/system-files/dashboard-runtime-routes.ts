import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {RecordEngine} from './record-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Component={id:string;title:string;type:string;objectApiName:string;aggregation:string;measureFieldApiName?:string|null;groupByFieldApiName?:string|null;displayFieldApiNames?:string[];[key:string]:unknown};
type Dashboard={apiName:string;label:string;components:Component[];status:string;filters?:unknown[];runningUserId?:string|null};
export function registerDashboardRuntimeRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,records:RecordEngine){
 const lookup=async(req:Req,name:string)=>{
  const a=req.actor!;
  if(!safe.test(name))throw Error('Invalid dashboard');
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:dashboards','read');
  const {rows}=await db.query<{label:string;properties:Record<string,unknown>}>(`
    SELECT label,properties FROM md_system_definitions
    WHERE tenant_id=$1 AND kind='dashboards' AND api_name=$2 AND enabled=true`,[a.tenant_id,name]);
  if(!rows[0])throw Error('Dashboard not found');
  const dashboard={...rows[0].properties,label:rows[0].label,apiName:name} as Dashboard;
  if(!Array.isArray(dashboard.components)||dashboard.components.length>100)throw Error('Invalid dashboard definition');
  return dashboard;
 };
 const load=async(req:Req,object:string,limit=100)=>{
  const a=req.actor!;
  if(!safe.test(object))throw Error('Invalid Object');
  const out:Record<string,unknown>[]=[];
  for(let offset=0;offset<Math.min(5000,limit);offset+=100){
   const page=await records.list(a.tenant_id,a.user_id,object,Math.min(100,limit-offset),offset);
   out.push(...page.records);
   if(out.length>=limit||offset+page.records.length>=page.total||!page.records.length)break;
  }
  return out;
 };
 const checkUser=(req:Req,requested:unknown)=>{
  if(requested!==undefined&&requested!==null&&requested!==''&&requested!==req.actor!.user_id)
   throw Error('Running as another user requires an authorised execution context');
 };
 app.get('/api/metadata/dashboards/:apiName/data/:objectApi',wrap(async(req,res)=>{
  const a=req.actor!,dashboard=await lookup(req,req.params.apiName),object=req.params.objectApi;
  checkUser(req,req.query.runningUserId);
  if(!dashboard.components.some(x=>x.objectApiName===object))throw Error('Object not included in dashboard');
  const data=await load(req,object,100);
  res.json({records:data});
 }));
 app.get('/api/metadata/dashboards/:apiName/snapshots',wrap(async(req,res)=>{
  const a=req.actor!;await lookup(req,req.params.apiName);
  const {rows}=await db.query<{id:string;label:string;created_at:Date;created_by:string;snapshot:Record<string,unknown>}>(`
    SELECT id,label,created_at,created_by,snapshot FROM md_dashboard_snapshots
    WHERE tenant_id=$1 AND dashboard_api=$2 ORDER BY created_at DESC LIMIT 100`,
    [a.tenant_id,req.params.apiName]);
  res.json({snapshots:rows.map(r=>({...r.snapshot,id:r.id,label:r.label,createdAt:r.created_at,createdBy:r.created_by}))});
 }));
 app.post('/api/metadata/dashboards/:apiName/snapshots',wrap(async(req,res)=>{
  const a=req.actor!,dashboard=await lookup(req,req.params.apiName),body=req.body??{};
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:dashboards','manage');
  checkUser(req,body.runningUserId);
  if(typeof body.label!=='string'||!body.label.trim()||body.label.length>200||
   !Array.isArray(body.filters)||body.filters.length>100||!Array.isArray(body.crossFilters)||
   body.crossFilters.length||body.filters.length||Array.isArray(body.customComponents)&&body.customComponents.length)
   throw Error('Unsupported or invalid snapshot filters or custom components');
  const components=[];
  for(const comp of dashboard.components){
   if(!comp||typeof comp.id!=='string'||!safe.test(comp.objectApiName||'')&& !['Rich Text','Image'].includes(comp.type))
    throw Error('Invalid dashboard component');
   const data=['Rich Text','Image','Custom'].includes(comp.type)?[]:await load(req,comp.objectApiName,5000);
   const measure=comp.measureFieldApiName;
   if(measure&&!safe.test(measure))throw Error('Invalid dashboard measure');
   if(measure&&data.length)await rbac.require(a.tenant_id,a.user_id,comp.objectApiName+'.'+measure,'read');
   const vals=measure?data.map(x=>x[measure]).filter(x=>typeof x==='number'&&Number.isFinite(x)) as number[]:[];
   const n=vals.reduce((s,x)=>s+x,0);
   const metric=comp.aggregation==='Count'?data.length:comp.aggregation==='Sum'?n:
    comp.aggregation==='Average'?(vals.length?n/vals.length:0):
    comp.aggregation==='Minimum'?(vals.length?Math.min(...vals):0):
    comp.aggregation==='Maximum'?(vals.length?Math.max(...vals):0):null;
   const group=comp.groupByFieldApiName;
   if(group&&data.length)await rbac.require(a.tenant_id,a.user_id,comp.objectApiName+'.'+group,'read');
   const counts=new Map<string,number>();
   for(const r of data)if(group){
    const key=String(r[group]??'Unspecified');
    counts.set(key,(counts.get(key)??0)+1);
   }
   const columns=(comp.displayFieldApiNames??[]).filter(safe).map(apiName=>({apiName,label:apiName}));
   components.push({...comp,componentId:comp.id,totalRows:data.length,metricValue:metric,
     groupByLabel:group??null,chartDataLabelPosition:comp.chartDataLabelPosition??'Auto',
     chartType:comp.chartType??null,chartSortOrder:comp.chartSortOrder??'Ascending',
     chartLimit:comp.chartLimit??20,gaugeMin:comp.gaugeMin??0,gaugeMax:comp.gaugeMax??100,
     gaugeRange1EndPercent:comp.gaugeRange1EndPercent??30,gaugeRange2EndPercent:comp.gaugeRange2EndPercent??70,
     showLegend:comp.showLegend??false,showValues:comp.showValues??true,
     columns,rows:data.slice(0,100).map(x=>Object.fromEntries(columns.map(y=>[y.apiName,x[y.apiName]??null]))),
     buckets:[...counts].map(([label,value])=>({label,value}))});
  }
  const snapshot={dashboardApiName:dashboard.apiName,filters:[],crossFilters:[],components,runningUserId:a.user_id};
  if(JSON.stringify(snapshot).length>1000000)throw Error('Snapshot data too large');
  const {rows}=await db.query<{id:string;created_at:Date}>(`
    INSERT INTO md_dashboard_snapshots(tenant_id,dashboard_api,label,snapshot,created_by)
    VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id,created_at`,
    [a.tenant_id,dashboard.apiName,body.label.trim(),JSON.stringify(snapshot),a.user_id]);
  res.status(201).json({snapshot:{...snapshot,id:rows[0].id,label:body.label.trim(),
   createdBy:a.user_id,createdAt:rows[0].created_at}});
 }));
 app.delete('/api/metadata/dashboards/:apiName/snapshots/:id',wrap(async(req,res)=>{
  const a=req.actor!;await lookup(req,req.params.apiName);
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:dashboards','manage');
  if(!uuid.test(req.params.id))throw Error('Invalid snapshot');
  const result=await db.query('DELETE FROM md_dashboard_snapshots WHERE tenant_id=$1 AND dashboard_api=$2 AND id=$3',
   [a.tenant_id,req.params.apiName,req.params.id]);
  if(!result.rowCount)throw Error('Snapshot not found');
  res.status(204).end();
 }));
}
