/**
 * Safe live preflight using the existing tenant-scoped API and CI test identity.
 * No record values, tokens, credentials or tenant identifiers are printed.
 * No metadata or business records are written.
 */
import { assessCheckoutReadiness } from './pos-checkout-readiness.mjs';

const base=(process.env.METADRIVE_API_BASE||'https://metadrive-production.up.railway.app').replace(/\/$/,'');
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('Test-tenant credentials not connected; live preflight was not run.');
async function request(path,token,body){
 const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',
  signal:AbortSignal.timeout(30000),
  headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
    ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error('Authenticated preflight '+path+' HTTP '+response.status);
 return response.json();
}
const auth=await request('/auth/login',undefined,{email,password});
if(typeof auth.access_token!=='string')throw Error('Test identity could not authenticate.');
const token=auth.access_token;
const [o,f,p]=await Promise.all([
 request('/metadata/objects',token),
 request('/metadata/flows',token),
 request('/metadata/pages',token)
]);
const result=assessCheckoutReadiness({objects:o.objects??[],flows:f.flows??[],pages:p.pages??[]});
async function aggregateRecords(objectName){
 try{
  let rows=[],total=0;
  for(let offset=0;offset<2000;offset+=200){
   const data=await request('/records/'+encodeURIComponent(objectName)+'?limit=200&offset='+offset,token);
   total=Number(data.total??0);
   rows.push(...(data.records??[]));
   if(rows.length>=total||!(data.records??[]).length)break;
  }
  const populated=fieldNames=>Object.fromEntries(fieldNames.map(name=>[name,rows.filter(record=>record[name]!==null
    &&record[name]!==undefined&&record[name]!=='').length]));
  return {total,scanned:rows.length,complete:rows.length===total,
   populated:populated(objectName==='Product'?['Type','UnitId','TaxId','AgeRestricted','MinimumAge']
    :objectName==='Invoice'?['OrderId','BillingAddressId','Direction','Status']:['BasketSessionKey','Status']),
   ...(objectName==='Product'?{ageRestrictedTrue:rows.filter(x=>x.AgeRestricted===true).length,
      demoLagerMatches:rows.filter(x=>/demo lager/i.test(String(x.Name??''))).length,
      demoLagerAgeRestricted:rows.filter(x=>/demo lager/i.test(String(x.Name??''))&&x.AgeRestricted===true).length}: {})
  };
 }catch{return {accessible:false};}
}
const recordAggregates=Object.fromEntries(await Promise.all(['Product','Invoice','Order__c']
 .map(async key=>[key,await aggregateRecords(key)])));

const empty=!result.checkoutFlow.found||!result.checks.find(c=>c.id==='product:available')?.pass;
const relevantObjects=(o.objects??[]).filter(item=>/product|order|invoice|payment|stock|inventory|sale|unit|tax|address|age|location/i.test(item.apiName));
const checkout=(f.flows??[]).find(item=>/COPILOT POS - Cash Checkout/i.test(item.label));
const inspect={
 objectInventory:relevantObjects.map(item=>({
   apiName:item.apiName,
   kind:item.kind,
   fieldSummary:(item.fields??[]).map(field=>({
     apiName:field.apiName,dataType:field.dataType,
     target:field.relationship?.targetObject??null,
     picklistCount:field.picklistValues?.length??null,
     required:field.required
   }))
 })),
 checkoutSteps:(checkout?.elements??[]).map(step=>({
   type:step.type,label:step.label,
   object:typeof step.config?.object==='string'?step.config.object:null,
   resource:typeof step.config?.outputVariable==='string'?step.config.outputVariable:null,
   filterFields:Array.isArray(step.config?.conditions)
     ?step.config.conditions.map(x=>({field:x.field,operator:x.operator,valueKind:
         typeof x.value==='string'&&/^\{!?[A-Za-z_$]/.test(x.value)?'reference':'literal'})):[],
   screenFieldTypes:Array.isArray(step.config?.fields)?step.config.fields.map(x=>({type:x.type,label:x.label})):[],
 })),
 checkoutResources:(checkout?.resources??[]).map(x=>({name:x.name,type:x.type,dataType:x.dataType,isInput:x.availableForInput,isOutput:x.availableForOutput})),
 relevantPages:(p.pages??[]).filter(x=>/cashier|till|customer.*display/i.test(x.apiName+' '+x.label))
   .map(x=>({apiName:x.apiName,label:x.label,status:x.status,
     components:(x.components??[]).map(k=>({type:k.type,
       flowNames:typeof k.properties?.actionFlows==='object'
         ?Object.values(k.properties.actionFlows).map(v=>v?.flowApiName).filter(Boolean):[],
       stateSyncEnabled:k.properties?.stateSyncEnabled===true
     }))}))
};
console.log(JSON.stringify({status:empty?'TEST_IDENTITY_IS_NOT_CHECKOUT_TENANT':'READ_ONLY_CHECKOUT_PREFLIGHT',
  readOnly:true,source:'authenticated tenant-scoped API',checks:result.checks,issues:result.issues,
  checkoutFlow:result.checkoutFlow,tillPage:result.tillPage,customerPage:result.customerPage,
  runtimeAssertionsPending:result.runtimeAssertions,inspection:inspect,recordAggregates},null,2));
// Distinguish an absent production test tenant from a complete POS.
if(empty)process.exitCode=2;
else if(result.issues.length)process.exitCode=1;
