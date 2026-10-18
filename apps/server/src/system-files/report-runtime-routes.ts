import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {RecordEngine} from './record-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(f:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void f(r as Req,s).catch(n);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
type Filter={fieldApiName:string;operator:string;value?:string;values?:string[]};
type Report={apiName:string;label:string;objectApiName:string;fieldApiNames:string[];format:string;
 filters?:Filter[];groupByFieldApiNames?:string[];filterLogic?:string;sortFieldApiName?:string|null;
 sortDirection?:string;rowLimit?:{limit:number|null};summaryOperations?:Record<string,string[]>;
 standardFilters?:{showMe?:string;dateRange?:string;dateFieldApiName?:string|null};
 crossFilters?:unknown[]};
const cmp=(a:unknown,b:unknown)=>a==null?-1:b==null?1:
 typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b),undefined,{numeric:true});
function matches(row:Record<string,unknown>,f:Filter){
 const value=row[f.fieldApiName],test=f.value??'',set=f.values??[];
 switch(f.operator){
  case 'Equals':case 'eq':return String(value??'')===test;
  case 'Not Equals':case 'ne':return String(value??'')!==test;
  case 'Contains':return String(value??'').toLowerCase().includes(test.toLowerCase());
  case 'Does Not Contain':return !String(value??'').toLowerCase().includes(test.toLowerCase());
  case 'Starts With':return String(value??'').toLowerCase().startsWith(test.toLowerCase());
  case 'Greater Than':return cmp(value,Number(test))>0;
  case 'Greater Than or Equal To':return cmp(value,Number(test))>=0;
  case 'Less Than':return cmp(value,Number(test))<0;
  case 'Less Than or Equal To':return cmp(value,Number(test))<=0;
  case 'Is Null':return value===null||value===undefined||value==='';
  case 'Is Not Null':return value!==null&&value!==undefined&&value!=='';
  case 'Includes':return set.includes(String(value??''));
  case 'Excludes':return !set.includes(String(value??''));
  default:throw Error('Unsupported report filter operator: '+f.operator);
 }
}
export function registerReportRuntimeRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,records:RecordEngine){
 const run=async(req:Req,report:Report)=>{
  const a=req.actor!;
  if(!report||!safe.test(report.apiName)||!safe.test(report.objectApiName)
    ||!Array.isArray(report.fieldApiNames)||report.fieldApiNames.some(x=>!safe.test(x))
    ||!['Tabular','Summary','Matrix'].includes(report.format))
    throw Error('Invalid report metadata');
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:reports','read');
  const offset=req.body?.offset??0,limit=req.body?.limit??100;
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
   throw Error('Invalid report pagination');
  const filters=report.filters??[];
  if(!Array.isArray(filters)||filters.length>100||filters.some(x=>!x||!safe.test(x.fieldApiName)))
   throw Error('Invalid report filters');
  if(report.crossFilters?.length)throw Error('Cross-filtered reporting requires a published relation query');
  if(report.filterLogic&&report.filterLogic!=='All'&&report.filterLogic!=='AND')
   throw Error('Unsupported report filter logic');
  const standard=report.standardFilters;
  if(standard?.dateRange&&standard.dateRange!=='All Time')
   throw Error('Date range report filters are not enabled in this runtime');
  const filtered:Record<string,unknown>[]=[];
  const maxScan=5000;
  let scanned=0,more=true;
  while(more&&scanned<maxScan){
   const page=await records.list(a.tenant_id,a.user_id,report.objectApiName,100,scanned);
   if(!page.records.length)break;
   scanned+=page.records.length;
   for(const record of page.records){
    if(standard?.showMe==='My'&&record.OwnerId!==a.user_id)continue;
    if(filters.every(f=>matches(record,f)))filtered.push(record);
   }
   more=scanned<page.total;
  }
  if(report.sortFieldApiName){
   const key=report.sortFieldApiName;
   if(!safe.test(key))throw Error('Invalid sort field');
   filtered.sort((x,y)=>cmp(x[key],y[key])*(report.sortDirection==='Descending'?-1:1));
  }
  const totalRows=filtered.length;
  const bounded=report.rowLimit?.limit;
  if(bounded!=null&&(!Number.isSafeInteger(bounded)||bounded<1))throw Error('Invalid report row limit');
  const limited=bounded?filtered.slice(0,bounded):filtered;
  const display=limited.slice(offset,offset+limit).map(record=>{
    const o:Record<string,unknown>={Id:record.Id};
    for(const field of report.fieldApiNames)if(field in record)o[field]=record[field];
    return o;
  });
  const totals:Record<string,number>={};const counts:Record<string,number>={};
  const minimums:Record<string,number>={};const maximums:Record<string,number>={};
  for(const row of limited)for(const [name,ops] of Object.entries(report.summaryOperations??{})){
   if(!Array.isArray(ops)||!safe.test(name))continue;
   const v=row[name];
   if(typeof v!=='number'||!Number.isFinite(v))continue;
   totals[name]=(totals[name]??0)+v;counts[name]=(counts[name]??0)+1;
   minimums[name]=Math.min(minimums[name]??v,v);maximums[name]=Math.max(maximums[name]??v,v);
  }
  const summaryTotals={rowCount:limited.length,sums:totals,counts,minimums,maximums};
  const groups=new Map<string,{groupValues:Record<string,unknown>;rows:Record<string,unknown>[]}>();
  if(report.groupByFieldApiNames?.length){
   if(report.groupByFieldApiNames.some(x=>!safe.test(x)))throw Error('Invalid grouping field');
   for(const row of limited){
    const values=Object.fromEntries(report.groupByFieldApiNames.map(k=>[k,row[k]??null]));
    const key=JSON.stringify(values),group=groups.get(key)??{groupValues:values,rows:[]};
    group.rows.push(row);groups.set(key,group);
   }
  }
  const summaryRows=[...groups.values()].map(g=>({
   groupValues:g.groupValues,rowCount:g.rows.length,
   sums:Object.fromEntries(Object.keys(totals).map(k=>[k,g.rows.reduce((n,row)=>n+(typeof row[k]==='number'?row[k] as number:0),0)])),
   counts:Object.fromEntries(Object.keys(counts).map(k=>[k,g.rows.filter(r=>typeof r[k]==='number').length])),
   minimums:{},maximums:{}
  }));
  return {report,rows:display,summaryRows,subtotalRows:[],summaryTotals,totalRows:limited.length,
   offset,pageSize:limit,truncated:more||totalRows>limited.length,generatedAt:new Date().toISOString()};
 };
 app.post('/api/reports/preview',wrap(async(req,res)=>{
  const a=req.actor!;
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:reports','read');
  res.json(await run(req,req.body?.report));
 }));
 app.post('/api/reports/:apiName/run',wrap(async(req,res)=>{
  const a=req.actor!,name=req.params.apiName;if(!safe.test(name))throw Error('Invalid report');
  await rbac.require(a.tenant_id,a.user_id,'SystemDefinition:reports','read');
  const {rows}=await db.query<{label:string;properties:Record<string,unknown>}>(`
   SELECT label,properties FROM md_system_definitions WHERE tenant_id=$1 AND kind='reports'
   AND api_name=$2 AND enabled=true`,[a.tenant_id,name]);
  if(!rows[0])throw Error('Report not found');
  res.json(await run(req,{...rows[0].properties,label:rows[0].label,apiName:name} as Report));
 }));
}
