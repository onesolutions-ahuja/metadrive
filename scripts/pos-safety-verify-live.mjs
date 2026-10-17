/** Read-only contract check; do not fetch payment/customer/product records. */
const origin=String(process.env.METADRIVE_API_URL||'').replace(/\/$/,'').replace(/\/api$/,'');
if(!/^https:\/\//.test(origin))throw Error('HTTPS API required');
const email=process.env.METADRIVE_ADMIN_EMAIL,password=process.env.METADRIVE_ADMIN_PASSWORD;
const tenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
if(!email||!password||!tenant)throw Error('Expected tenant and credentials are required');
async function request(path,token,body){
 const response=await fetch(origin+'/api'+path,{
  method:body?'POST':'GET',headers:{accept:'application/json',
   ...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error(path+' HTTP '+response.status);
 return response.json();
}
const session=await request('/auth/login','',{email,password});
if(session.user?.tenantId!==tenant||!session.access_token)throw Error('Tenant identity mismatch');
const token=session.access_token;
const [data,flowList,pages]=await Promise.all([
 request('/metadata/objects',token),request('/metadata/flows',token),request('/metadata/pages',token)
]);
const names=new Set((data.objects??[]).map(o=>o.apiName));
const expected=['Product__c','Order__c','OrderLine__c','Sale__c','SaleLine__c',
 'POS_CashPayment__c','POS_StockBalance__c','POS_StockMovement__c'];
const missing=expected.filter(n=>!names.has(n));
const checkout=(flowList.flows??[]).find(f=>f.apiName==='COPILOT_POS_Cash_Checkout');
const cashier=(pages.pages??[]).find(p=>p.apiName==='COPILOT_POS_Cashier_Till');
const payload={readOnly:true,tenantVerified:true,missingObjects:missing,
 draftFlowExists:Boolean(checkout),flowStatus:checkout?.status??'Missing',
 safetyGateInstalled:Boolean(checkout?.elements?.some(e=>e.label==='POS Safety - Challenge 25')),
 cashGateInstalled:Boolean(checkout?.elements?.some(e=>e.label==='Validate Cash and Basket')),
 checkoutSessionInput:Boolean(checkout?.resources?.some(r=>r.name==='CheckoutRequestKey'&&r.availableForInput)),
 cashierSessionBound:Boolean(cashier?.components?.some(c=>c.properties?.actionFlows?.checkout?.inputs?.SessionKey==='$event.sessionKey')),
 recordsRead:0,recordsChanged:0};
console.log(JSON.stringify(payload));
if(missing.length||!checkout||checkout.status!=='Draft')process.exitCode=1;
