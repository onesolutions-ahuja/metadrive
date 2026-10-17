/** Read-only live cashier image diagnostic; never prints Product values or image URLs. */
import assert from 'node:assert/strict';
const root=(process.env.METADRIVE_API_BASE||'https://metadrive-production.up.railway.app').replace(/\/$/,'');
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
assert(email&&password,'Authenticated test credentials required');
async function req(path,token,body){
 const response=await fetch(root+'/api'+path,{method:body?'POST':'GET',headers:{
  accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
  ...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(30000)});
 assert(response.ok,path+' HTTP '+response.status);
 return response.json();
}
const auth=await req('/auth/login',null,{email,password});
assert(auth.access_token&&auth.user?.tenantId,'Login failed');
const token=auth.access_token;
const [pagesResult,objectResult,productsResult]=await Promise.all([
 req('/metadata/pages',token),req('/metadata/objects',token),req('/records/Product',token)
]);
const cashier=(pagesResult.pages??[]).find(p=>p.apiName==='UK_Off_Licence_POS_Cashier_Till');
assert(cashier?.status==='Draft','Expected saved Draft');
const grid=cashier.components?.find(c=>c.type==='Custom:OneItemGrid');
assert(grid,'Missing OneItemGrid');
const source=objectResult.objects?.find(o=>o.apiName==='Product');
const field=String(grid.properties?.imageFieldApiName??'ImageURL');
const records=productsResult.records??[];
const classify=value=>{
 if(value==null||value==='')return 'empty';
 if(typeof value!=='string')return Array.isArray(value)?'array':typeof value;
 if(!value.trim())return 'blank';
 const v=value.trim();
 if(/^https:\/\//i.test(v))return 'https';
 if(/^http:\/\//i.test(v))return 'http';
 if(/^data:/i.test(v))return 'data';
 if(/^blob:/i.test(v))return 'blob';
 if(/^\//.test(v))return 'relative-root';
 if(/^[./]/.test(v))return 'relative-path';
 return 'other-text';
};
const counts={};
for(const record of records){
 const kind=classify(record[field]);
 counts[kind]=(counts[kind]??0)+1;
}
console.log(JSON.stringify({
 result:'READ_ONLY_IMAGE_DIAGNOSTIC',readOnly:true,draft:true,
 gridImageField:field,fieldExistsOnProductMetadata:Boolean(source?.fields?.some(f=>f.apiName===field)),
 productCount:records.length,recordsWithField:records.filter(r=>Object.prototype.hasOwnProperty.call(r,field)).length,
 showImage:grid.properties?.showImage!==false,
 statusCounts:counts
}));
