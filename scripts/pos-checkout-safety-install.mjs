/** One-time, versioned POS safety metadata installation via tenant-scoped Object Manager. 
 * No customer records, active flows or SQL tables are dropped/replaced.
 */
import {pathToFileURL} from 'node:url';
import {checkoutSafetyVersion,planCheckoutSafetyMetadata} from './pos-checkout-safety-definitions.mjs';
const base=String(process.env.METADRIVE_API_URL||'').replace(/\/$/,'').replace(/\/api$/,'');
const apply=process.env.METADRIVE_POS_SAFETY_INSTALL_APPROVED==='true';
async function main(){
 if(!/^https:\/\//.test(base))throw Error('HTTPS MetaDrive API URL required');
 const email=process.env.METADRIVE_ADMIN_EMAIL,password=process.env.METADRIVE_ADMIN_PASSWORD;
 const tenant=process.env.METADRIVE_EXPECTED_TENANT_ID;
 if(!email||!password||!tenant)throw Error('Tenant-scoped approved metadata credentials required');
 let token='';
 async function api(path,method='GET',body){
  const result=await fetch(base+'/api'+path,{method,signal:AbortSignal.timeout(90000),
   headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!result.ok)throw Error(method+' '+path+' HTTP '+result.status);
  return result.json();
 }
 const identity=await api('/auth/login','POST',{email,password});
 if(identity.user?.tenantId!==tenant||!identity.access_token)
  throw Error('Tenant mismatch; no installation allowed');
 token=identity.access_token;
 const pages=(await api('/metadata/pages')).pages??[];
 const draft=pages.find(x=>x.apiName==='COPILOT_POS_Cashier_Till');
 if(!draft||draft.status!=='Draft')throw Error('No inactive cashier Page; installation requires POS owner draft');
 const read=async()=>planCheckoutSafetyMetadata((await api('/metadata/objects')).objects??[]);
 const initial=await read();
 if(apply){
  for(let attempt=0;attempt<16;attempt++){
   const pending=await read();
   if(!pending.length)break;
   const action=pending[0];
   const path='/metadata/objects'+(action.kind==='extend'?'/Sale__c':'');
   const method=action.kind==='extend'?'PUT':'POST';
   try{await api(path,method,action.object)}
   catch(error){
    if(!/HTTP (409|502|503|504)\b/.test(String(error))||attempt===15)throw error;
   }
   await new Promise(resolve=>setTimeout(resolve,Math.min(10000,600*2**Math.min(attempt,4))));
  }
  if((await read()).length)throw Error('POS safety metadata did not persist after safe retries');
 }
 console.log(JSON.stringify({version:checkoutSafetyVersion,mode:apply?'applied':'dry-run',
  tenantVerified:true,changes:initial.map(x=>({kind:x.kind,object:x.object.apiName})),
  flowActivated:false,createdBusinessRecords:0,recordsModified:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
