/** Authenticated, read-only diagnosis of cashier category bindings. Never prints business record values. */
const base=(process.env.METADRIVE_API_BASE||'https://metadrive-production.up.railway.app').replace(/\/$/,'');
const email=process.env.METADRIVE_TEST_EMAIL,password=process.env.METADRIVE_TEST_PASSWORD;
if(!email||!password)throw Error('CI credentials required');
async function request(path,token,method='GET',body){
 const response=await fetch(base+'/api'+path,{method,headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{}),
  ...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(path+' HTTP '+response.status);
 return response.json();
}
const auth=await request('/auth/login',null,'POST',{email,password});
if(!auth.access_token||!auth.user?.tenantId)throw Error('Tenant-scoped authentication failed');
const token=auth.access_token;
const [pagesResult,objectsResult]=await Promise.all([
 request('/metadata/pages',token),request('/metadata/objects',token)
]);
const pages=pagesResult.pages??[];
const objects=objectsResult.objects??[];
const cashierCandidates=pages.filter(p=>/cashier|till/i.test(p.label+' '+p.apiName)&&p.status==='Draft');
const draftWithOneComponents=pages.filter(p=>p.status==='Draft'&&(p.components??[]).some(c=>/One(SplitPane|Tabs|ItemGrid|ShoppingCart)/i.test(c.type)));
const page=[...cashierCandidates].sort((a,b)=>(b.components?.length??0)-(a.components?.length??0))[0]??null;
console.log(JSON.stringify({result:'DRAFT_INVENTORY',candidateCount:cashierCandidates.length,
 candidates:cashierCandidates.map(p=>({apiName:p.apiName,componentCount:p.components?.length??0,
 types:(p.components??[]).map(c=>c.type).filter(t=>/One(SplitPane|Tabs|ItemGrid|ShoppingCart)/.test(t))})),
 otherDraftsWithOneComponents:draftWithOneComponents.length}));
if(!page){
 console.log(JSON.stringify({result:'NO_CASHIER_DRAFT_IN_TEST_TENANT',authenticated:true,readOnly:true,
  note:'The configured test identity cannot verify the actual saved cashier draft.'}));
 process.exit(0);
}
const components=page.components??[];
const find=name=>components.find(c=>c.type==='Custom:'+name);
const tabs=find('OneTabs'),grid=find('OneItemGrid'),basket=find('OneShoppingCart');
const src=String(tabs?.properties?.objectApiName??''),dst=String(grid?.properties?.objectApiName??'');
const product=objects.find(o=>o.apiName===dst);
const fields=product?.fields??[];
const mapped=String(grid?.properties?.categoryFieldApiName??'');
const eligible=fields.filter(f=>f.relationship?.targetObject===src||f.dataType==='Lookup('+src+')');
const mappedExists=fields.some(f=>f.apiName===mapped);
const inferred=eligible.length===1?eligible[0].apiName:'';
let counters=null;
if(tabs&&grid&&src&&dst){
 try{
  const [cats,products]=await Promise.all([request('/records/'+encodeURIComponent(src),token),
   request('/records/'+encodeURIComponent(dst),token)]);
  const catRows=cats.records??[],prodRows=products.records??[];
  const chosen=mappedExists?mapped:inferred;
  const ids=new Set(catRows.map(c=>String(c.Id??'')));
  const labels=new Set(catRows.map(c=>String(c.Name??'')));
  const linked=chosen?prodRows.filter(row=>ids.has(String(row[chosen]??''))||labels.has(String(row[chosen]??''))).length:0;
  counters={categories:catRows.length,products:prodRows.length,matchedProductCount:linked};
 }catch{counters={recordsReadable:false};}
}
console.log(JSON.stringify({result:'READ_ONLY_DRAFT_DIAGNOSIS',authenticated:true,readOnly:true,
 draft:true,components:{tabs:Boolean(tabs),grid:Boolean(grid),basket:Boolean(basket)},
 categoryObject:src,gridObject:dst,
 categoryValueField:String(tabs?.properties?.categoryValueFieldApiName??''),
 configuredProductCategoryField:mapped,configuredProductFieldExists:mappedExists,
 relationalCandidateFields:eligible.map(f=>f.apiName),inferredCategoryField:inferred,
 commonFilterKey:tabs?.properties?.filterKey===grid?.properties?.filterKey,
 filterActionType:tabs?.properties?.actionFlows?.tabChange?.actionType??null,
 basketOnly:basket?.properties?.viewMode==='basket',
 sharedBasketKey:Boolean(grid?.properties?.cartTargetKey)&&grid?.properties?.cartTargetKey===basket?.properties?.cartTargetKey,
 ...counters
}));
