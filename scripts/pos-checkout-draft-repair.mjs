/**
 * Tenant-scoped, non-destructive POS draft repair.
 * Only missing Product__c age metadata and a known retired SaleItem__c writer
 * are repaired. It never activates a Flow, modifies product records, or grants access.
 * Run without approval for a read-only plan; apply through secured Object/Flow APIs.
 */
import {pathToFileURL} from 'node:url';
import {planCashAgeStockFlow} from './pos-checkout-safety-flow.mjs';

const ageFields=[
 {apiName:'AgeRestricted',label:'Age Restricted',dataType:'Checkbox',required:false,unique:false},
 {apiName:'MinimumAge',label:'Minimum Age',dataType:'Number(3, 0)',required:false,unique:false}
];
const byName=(objects,name)=>objects.find(o=>o.apiName===name);
const lookup=(obj,field)=>obj?.fields?.find(f=>f.apiName===field)?.relationship?.targetObject
 ??/^(?:Lookup|Master-Detail)\(([^)]+)\)$/.exec(obj?.fields?.find(f=>f.apiName===field)?.dataType??'')?.[1];

export function planPosDraftRepair(objects,flows,pages=[]){
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
 const draftOrder=next.elements.find(e=>e.type==='Get Records'&&e.config?.object==='Order__c'&&
   /draft order/i.test(e.label??''));
 if(!draftOrder)throw Error('Draft Order query missing');
 const sessionCondition=(draftOrder.config.conditions??[]).find(c=>c.field==='BasketSessionKey');
 if(!sessionCondition)throw Error('Draft basket session filter missing');
 sessionCondition.value='{!SessionKey}';
 const sessionInput=(next.resources??[]).find(r=>r.name==='SessionKey');
 if(sessionInput && (sessionInput.availableForInput!==true||sessionInput.isCollection))
  throw Error('SessionKey resource exists but is not a usable Flow input');
 if(!sessionInput)(next.resources??=[]).push({name:'SessionKey',label:'Session Key',type:'Variable',dataType:'Text',
  isCollection:false,availableForInput:true,availableForOutput:false});
 // Protect every path to the Sale writer from empty baskets or insufficient cash.
 // No app-specific runtime logic: this is a versioned Flow Decision using shared operators.
 if(!next.elements.some(e=>e.label==='Validate Cash and Basket')){
  const lines=next.elements.find(e=>e.type==='Get Records'&&e.config?.object==='OrderLine__c' &&
    String(e.config?.recordLimit??'1')!=='1');
  const saleWriter=next.elements.find(e=>e.type==='Create Records'&&e.config?.object==='Sale__c');
  const cash=next.elements.find(e=>e.type==='Screen'&&
    (e.config?.fields??[]).some(f=>f.apiName==='CashReceived'&&f.type==='Currency'));
  if(!lines||!saleWriter||!cash)throw Error('Cash/Order validation prerequisites are missing');
  const link=next.connectors.find(edge=>edge.from===lines.id&&edge.to===saleWriter.id&&edge.kind==='normal');
  if(!link)throw Error('Expected Order Lines to Sale path is absent; refusing to rewire unknown Flow');
  const gateId=Math.max(...next.elements.map(e=>e.id))+1;
  const rejectId=gateId+1;
  next.elements.push({id:gateId,type:'Decision',label:'Validate Cash and Basket',config:{
   outcomes:[
    {name:'MissingBasket',label:'MissingBasket',conditions:[
      {field:'{!element3.Id}',operator:'Is Null',value:''}]},
    {name:'MissingCash',label:'MissingCash',conditions:[
      {field:'{!CashReceived}',operator:'Is Null',value:''}]},
    {name:'InsufficientCash',label:'InsufficientCash',conditions:[
      {field:'{!CashReceived}',operator:'Less Than',value:'{!element3.Total}'}]},
    {name:'Default',label:'Default',conditions:[]}
   ]
  }});
  next.elements.push({id:rejectId,type:'End',label:'Cash Checkout Rejected',config:{}});
  next.connectors=next.connectors.filter(edge=>edge!==link);
  next.connectors.push(
   {id:'cash-gate-in',from:lines.id,to:gateId,label:'',kind:'normal'},
   {id:'cash-gate-accepted',from:gateId,to:saleWriter.id,label:'Default',kind:'normal'},
   ...['MissingBasket','MissingCash','InsufficientCash'].map(label=>({
    id:'cash-gate-'+label,from:gateId,to:rejectId,label,kind:'normal'
   }))
  );
 }
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
 const safetyReady=['POS_CashPayment__c','POS_StockBalance__c','POS_StockMovement__c']
  .every(name=>objects.some(object=>object.apiName===name));
 if(process.env.METADRIVE_REQUIRE_POS_SAFETY==='true'&&!safetyReady)
  throw Error('POS safety metadata not installed in this tenant; do not claim checkout repaired');
 if(safetyReady){
  const prepared=planCashAgeStockFlow(next,objects);
  if(prepared){
   next.elements=prepared.elements;
   next.connectors=prepared.connectors;
   next.resources=prepared.resources;
   next.description=prepared.description;
  }
 }
 const cashier=pages.find(page=>page.apiName==='COPILOT_POS_Cashier_Till');
 let updatedPage=null;
 if(cashier){
  if(cashier.status!=='Draft')throw Error('Refusing to change an active cashier Page');
  const candidate=structuredClone(cashier);
  const carts=candidate.components.filter(block=>block.type==='Custom:OneShoppingCart');
  if(carts.length!==1)throw Error('Cashier Page must contain exactly one reusable Shopping Cart component');
  const cart=carts[0],bindings=cart.properties?.actionFlows??{};
  const configured=bindings.checkout;
  if(configured&&configured.flowApiName!=='COPILOT_POS_Cash_Checkout')
   throw Error('Cashier checkout is already bound to another Flow');
  const desired={actionType:'Flow',flowApiName:'COPILOT_POS_Cash_Checkout',
   inputs:{SessionKey:'$event.sessionKey',CheckoutRequestKey:'$event.requestId'}};
  const updated={...bindings,checkout:{...configured,...desired,
   inputs:{...configured?.inputs,...desired.inputs}}};
  if(JSON.stringify(updated)!==JSON.stringify(bindings)){
   cart.properties={...cart.properties,actionFlows:updated};
   updatedPage=candidate;
  }
 }
  return {product:fieldsToAdd.length?{...product,fields:[...product.fields,...fieldsToAdd]}:null,
  flow:JSON.stringify(next.elements)===JSON.stringify(flow.elements)&&
       JSON.stringify(next.resources)===JSON.stringify(flow.resources)&&
       JSON.stringify(next.connectors)===JSON.stringify(flow.connectors)?null:next,
  page:updatedPage,fieldsToAdd:fieldsToAdd.map(f=>f.apiName)};
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
 const readPlan=async()=>{
  const [objects,flows,pages]=await Promise.all([api('/metadata/objects'),api('/metadata/flows'),api('/metadata/pages')]);
  return planPosDraftRepair(objects.objects??[],flows.flows??[],pages.pages??[]);
 };
 const plan=await readPlan();
 const apply=process.env.METADRIVE_POS_DRAFT_REPAIR_APPROVED==='true';
 if(apply){
  // An SQL revision conflict is a rejected commit, never permission to overwrite
  // a stale whole-tenant snapshot. Re-read and re-plan before EVERY attempt.
  let verified=false;
  for(let attempt=0;attempt<8;attempt++){
   const fresh=await readPlan();
   if(!fresh.product&&!fresh.flow&&!fresh.page){verified=true;break}
   try{
    if(fresh.product)await api('/metadata/objects/Product__c','PUT',fresh.product);
    else if(fresh.flow)await api('/metadata/flows/COPILOT_POS_Cash_Checkout','PUT',fresh.flow);
    else await api('/metadata/pages/COPILOT_POS_Cashier_Till','PUT',fresh.page);
   }catch(error){
    if(!/HTTP (409|502|503|504)\b/.test(String(error))||attempt===7)throw error;
   }
   await new Promise(resolve=>setTimeout(resolve,Math.min(12000,1000*2**attempt)));
  }
  if(!verified){
   const latest=await readPlan();
   if(latest.product||latest.flow||latest.page)throw Error('Draft repair not durable after verified retries');
  }
 }
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',tenantVerified:true,
  addedAgeFields:plan.fieldsToAdd,flowDraftRequiresUpdate:Boolean(plan.flow),cashierPageRequiresUpdate:Boolean(plan.page),
  checkoutActivated:false,recordsChanged:false}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
 await main();
