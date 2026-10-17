/**
 * Tenant-scoped, non-destructive POS draft repair.
 * Only missing Product__c age metadata and a known retired SaleItem__c writer
 * are repaired. It never activates a Flow, modifies product records, or grants access.
 * Run without approval for a read-only plan; apply through secured Object/Flow APIs.
 */
import {pathToFileURL} from 'node:url';

const ageFields=[
 {apiName:'AgeRestricted',label:'Age Restricted',dataType:'Checkbox',required:false,unique:false},
 {apiName:'MinimumAge',label:'Minimum Age',dataType:'Number(3, 0)',required:false,unique:false}
];
const byName=(objects,name)=>objects.find(o=>o.apiName===name);
const lookup=(obj,field)=>obj?.fields?.find(f=>f.apiName===field)?.relationship?.targetObject
 ??/^(?:Lookup|Master-Detail)\(([^)]+)\)$/.exec(obj?.fields?.find(f=>f.apiName===field)?.dataType??'')?.[1];

export function planPosDraftRepair(objects,flows){
 const product=byName(objects,'Product__c');
 const orderLine=byName(objects,'OrderLine__c');
 const saleLine=byName(objects,'SaleLine__c');
 const sale=byName(objects,'Sale__c');
 if(!product||!orderLine||!saleLine||!sale)throw Error('Current POS objects missing; no legacy Object may be recreated');
 if(product.kind!=='Custom Object')throw Error('Product__c is not a custom Object');
 if(lookup(orderLine,'ProductId')!=='Product__c'||lookup(saleLine,'ProductId')!=='Product__c'
  ||lookup(saleLine,'SaleId')!=='Sale__c')
  throw Error('Order/Sale Product relationships disagree with active SQL metadata');
 const fieldsToAdd=ageFields.filter(required=>{
  const existing=product.fields.find(field=>field.apiName===required.apiName);
  if(existing && existing.dataType.replace(/\s+/g,'')!==required.dataType.replace(/\s+/g,''))
   throw Error('Incompatible existing age field: '+required.apiName);
  return !existing;
 });
 const flow=flows.find(f=>f.apiName==='COPILOT_POS_Cash_Checkout');
 if(!flow)throw Error('Cash checkout Flow is absent');
 if(flow.status!=='Draft'||flow.activeVersion!=null)
  throw Error('Refusing to edit an active checkout Flow');
 const loop=flow.elements.find(e=>e.type==='Loop'&&e.config?.loopVariable==='CurrentOrderLine');
 if(!loop)throw Error('CurrentOrderLine Loop is missing');
 const writer=flow.elements.find(e=>e.type==='Create Records' &&
  (e.config?.object==='SaleItem__c'||e.config?.object==='SaleLine__c'));
 if(!writer)throw Error('Sale Line writer missing');
 const next=structuredClone(flow);
 const create=next.elements.find(e=>e.id===writer.id);
 const existing=new Map((create.config.fieldValues??[]).map(f=>[f.field,f.value]));
 if(create.config.object==='SaleItem__c'){
  for(const k of ['Name','Quantity__c','Unit_Price__c','Sale__c']){
   if(!existing.has(k))throw Error('Retired writer is missing source '+k);
  }
  create.config.object='SaleLine__c';
  create.config.fieldValues=[
   {field:'Name',value:existing.get('Name')},
   {field:'Quantity',value:existing.get('Quantity__c')},
   {field:'UnitPrice',value:existing.get('Unit_Price__c')},
   {field:'SaleId',value:existing.get('Sale__c')},
   {field:'ProductId',value:'{!CurrentOrderLine.ProductId}'}
  ];
 }else{
  if(!existing.has('SaleId')||!existing.has('Quantity')||!existing.has('UnitPrice'))
   throw Error('SaleLine writer is missing required field mapping');
  create.config.fieldValues=(create.config.fieldValues??[]).map(row=>
   row.field==='ProductId'?{...row,value:'{!CurrentOrderLine.ProductId}'}:row);
  if(!existing.has('ProductId'))create.config.fieldValues.push({
   field:'ProductId',value:'{!CurrentOrderLine.ProductId}'});
 }
 // A retained Product query must resolve the same target as the Order Line.
 for(const step of next.elements){
  if(step.type!=='Get Records'||step.config?.object!=='Product')continue;
  if(!/product/i.test(step.label??''))continue;
  step.config.object='Product__c';
  step.config.conditions=[{field:'Id',operator:'Equals',value:'{!CurrentOrderLine.ProductId}'}];
 }
 for(const resource of next.resources??[]){
  if(resource.name==='StandardCatalogProduct'&&resource.dataType==='Product')
   resource.dataType='Product__c';
 }
 return {product:fieldsToAdd.length?{...product,fields:[...product.fields,...fieldsToAdd]}:null,
  flow:JSON.stringify(next.elements)===JSON.stringify(flow.elements)&&
       JSON.stringify(next.resources)===JSON.stringify(flow.resources)?null:next,
  fieldsToAdd:fieldsToAdd.map(f=>f.apiName)};
}

async function main(){
 const origin=String(process.env.METADRIVE_API_URL||'').replace(/\/$/,'').replace(/\/api$/,'');
 if(!/^https:\/\//.test(origin))throw Error('HTTPS METADRIVE_API_URL required');
 const user=process.env.METADRIVE_ADMIN_EMAIL,password=process.env.METADRIVE_ADMIN_PASSWORD;
 const tenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
 if(!user||!password||!tenant)throw Error('Tenant-scoped admin credentials and expected tenant ID required');
 let token='';
 async function api(path,method='GET',body){
  const res=await fetch(origin+'/api'+path,{method,signal:AbortSignal.timeout(60000),
   headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!res.ok)throw Error(method+' '+path+' HTTP '+res.status);
  return res.json();
 }
 const session=await api('/auth/login','POST',{email:user,password});
 if(session.user?.tenantId!==tenant||!session.access_token)throw Error('Tenant identity mismatch');
 token=session.access_token;
 const [o,f]=await Promise.all([api('/metadata/objects'),api('/metadata/flows')]);
 const plan=planPosDraftRepair(o.objects??[],f.flows??[]);
 const apply=process.env.METADRIVE_POS_DRAFT_REPAIR_APPROVED==='true';
 if(apply){
  if(plan.product)await api('/metadata/objects/Product__c','PUT',plan.product);
  if(plan.flow)await api('/metadata/flows/COPILOT_POS_Cash_Checkout','PUT',plan.flow);
  const [objects,flows]=await Promise.all([api('/metadata/objects'),api('/metadata/flows')]);
  const remaining=planPosDraftRepair(objects.objects??[],flows.flows??[]);
  if(remaining.product||remaining.flow)throw Error('Readback mismatch: draft repair did not persist');
 }
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',tenantVerified:true,
  addedAgeFields:plan.fieldsToAdd,flowDraftRequiresUpdate:Boolean(plan.flow),
  checkoutActivated:false,recordsChanged:false}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();
