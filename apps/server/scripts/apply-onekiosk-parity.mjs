import { kioskMenuDraft } from '../src/app-seeders/onekiosk-menu.ts';

/**
 * One-time, explicitly approved OneKiosk tenant page upgrade.
 * Use the existing authenticated metadata and generic Record APIs only.
 * Never write SQL directly, bypass RBAC, or silently replace tenant pages.
 */
const required = key => {
  const value = process.env[key]?.trim();
  if (!value) throw Error('Missing environment configuration: ' + key);
  return value;
};
if (required('ONEKIOSK_APPROVE_UPDATE') !== 'Kiosk_Menu')
  throw Error('Explicit page upgrade approval is required');
const base = required('METADRIVE_API_BASE_URL').replace(/\/$/, '');
if (!/^https:\/\/[^/]+\/api$/i.test(base)) throw Error('Secure MetaDrive API URL required');
const json = async (path, options = {}) => {
  const response = await fetch(base + path, {
    ...options, signal: AbortSignal.timeout(25000),
    headers: {'content-type': 'application/json', ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error('MetaDrive API refused '+options.method+' '+path+' ('+response.status+')');
  return data;
};
const login = await json('/auth/login', {method:'POST',body:JSON.stringify({
  tenantSlug:required('METADRIVE_TENANT_SLUG'),
  email:required('METADRIVE_LOGIN_EMAIL'),
  password:required('METADRIVE_LOGIN_PASSWORD')
})});
if (!login.access_token || login.mfa_required) throw Error('Authenticated tenant session unavailable');
const headers = {Authorization:'Bearer '+login.access_token};
const get = path => json(path,{headers});
const save = (path,body,method='PUT') => json(path,{method,headers,body:JSON.stringify(body)});
const pages = await get('/metadata/pages');
const page = Array.isArray(pages.pages) && pages.pages.find(p => p.apiName==='Kiosk_Menu');
if (!page) throw Error('Existing Kiosk_Menu page was not found; no page created');
if (page.status!=='Draft' || page.layoutMode!=='free-canvas' || page.targetObject!=='Product' ||
    page.pageType!=='App Page' || page.canvasWidth!==1080 || page.canvasHeight!==1920)
  throw Error('Existing page identity/format changed; refusing to overwrite');
if (!Array.isArray(page.components)) throw Error('Existing page components could not be inspected');
if (page.components.some(c => c.id==='kiosk_details' && c.properties?.showSelectedRecord===true)) {
  console.log('OneKiosk page already carries selected-product detail metadata; no overwrite');
  process.exit(0);
}
const legacy = [
  'kiosk_brand','kiosk_categories','kiosk_heading','kiosk_products','kiosk_cart',
  'kiosk_sidebar_title','kiosk_category_records','kiosk_search','kiosk_subtitle',
  'kiosk_offer','kiosk_delivery_label','kiosk_basket_instruction','kiosk_logo'
];
if (page.revision!==3 || page.components.length!==legacy.length ||
    page.components.some(c => !legacy.includes(c.id)) ||
    new Set(page.components.map(c=>c.id)).size!==legacy.length)
  throw Error('Unrecognized page revision/components; preserve tenant customisations and stop');

const metadata=await get('/metadata/objects');
const objects=Array.isArray(metadata)?metadata:metadata.objects;
if(!Array.isArray(objects))throw Error('Object metadata unavailable');
const product=objects.find(o=>o.apiName==='Product');
const category=objects.find(o=>o.apiName==='MenuCategory');
if(!product || !category)throw Error('Existing Product and MenuCategory objects required');
const fields = object => new Set((object.fields||[]).map(f=>f.apiName));
const pFields=fields(product), cFields=fields(category);
for(const key of ['Name','Price','ImageUrl','MenuCategory'])
  if(!pFields.has(key))throw Error('Missing Product field: '+key);
for(const key of ['Name','CategoryImage'])
  if(!cFields.has(key))throw Error('Missing MenuCategory field: '+key);

const unwrapRecords = data => Array.isArray(data)?data:
  (Array.isArray(data.records)?data.records:Array.isArray(data.data)?data.data:[]);
const products=unwrapRecords(await get('/records/Product?limit=100'));
const categories=unwrapRecords(await get('/records/MenuCategory?limit=100'));
const imageValue = row => typeof row.ImageUrl==='string' && /^https:\/\//.test(row.ImageUrl)
  ? row.ImageUrl : '';
const promo = products.find(p => String(p.Name)==='Build Your Own Bucket');
const logo=page.components.find(c=>c.id==='kiosk_logo')?.properties?.src || '';
const draft=kioskMenuDraft({
  productObjectApiName:'Product',nameFieldApiName:'Name',
  priceFieldApiName:'Price',imageFieldApiName:'ImageUrl',
  categoryFieldApiName:'MenuCategory',categoryObjectApiName:'MenuCategory',
  categoryNameFieldApiName:'Name',categoryImageFieldApiName:'CategoryImage',
  categoryOrderFieldApiName:cFields.has('DisplayOrder')?'DisplayOrder':'',
  productSortFieldApiName:pFields.has('DisplayOrder')?'DisplayOrder':'',
  productDescriptionFieldApiName:pFields.has('Description')?'Description':'',
  logoAssetUri:typeof logo==='string'?logo:'',
  promotionImageUri:promo?imageValue(promo):''
});
const next=new Map(page.components.map(c=>[c.id,{...c,visible:false}]));
for (const component of draft.components) {
  const original=page.components.find(c=>c.id===component.id);
  next.set(component.id,{...component,...(original?{region:original.region}:{}),
    properties:{...original?.properties,...component.properties},visible:true});
}
// Don't show empty subcategory chips until actual parent/child records are configured.
const hasSubcategories=categories.some(c=>c.ParentCategory);
if (!hasSubcategories && next.has('kiosk_subcategories'))
  next.get('kiosk_subcategories').visible=false;
// Existing kiosk-only ProductType filter must remain; don't reintroduce retail demo stock.
const grid=next.get('kiosk_products');
const oldGrid=page.components.find(c=>c.id==='kiosk_products');
grid.properties.filters=oldGrid?.properties?.filters || [
  {field:'ProductType',operator:'Not Equals',value:''}
];
// This draft's Product Active values are not populated: do not accidentally filter all records.
delete grid.properties.recordActiveFieldApiName;
// Preserve existing search component, but move it away from promotional image.
const existingSearch=page.components.find(c=>c.id==='kiosk_search');
if(existingSearch)next.set('kiosk_search',{
  ...existingSearch,visible:true,
  position:{x:715,y:155,width:330,height:55},
  properties:{...existingSearch.properties,searchKey:'catalogue',
    theme:'light',radius:10,accentColor:'#E4002B'}
});
const transformed={...page,revision:page.revision,components:[...next.values()]};
const result=await save('/metadata/pages/Kiosk_Menu',transformed);
if(result.page?.apiName!=='Kiosk_Menu')throw Error('Authenticated page save did not confirm Kiosk_Menu');
const checked=await get('/metadata/pages');
const current=checked.pages?.find(p=>p.apiName==='Kiosk_Menu');
if(!current?.components?.some(c=>c.id==='kiosk_details' && c.properties?.showSelectedRecord===true)
  ||current.components.find(c=>c.id==='kiosk_products')?.properties?.imageFit!=='contain')
  throw Error('Saved page read-back does not match expected component settings');

// Assign only missing category pictures, reusing existing Product photos.
// Each update uses the authenticated generic Record Engine's RBAC and field permissions.
let assigned=0;
for(const categoryRecord of categories){
  if(categoryRecord.CategoryImage || !categoryRecord.Id)continue;
  const representative=products.find(p=>{
    const relation=p.MenuCategory;
    return (typeof relation==='string' && relation===String(categoryRecord.Id)) ||
      (relation && typeof relation==='object' &&
       String(relation.Id??relation.id??'')===String(categoryRecord.Id));
  });
  const photo=representative && imageValue(representative);
  if(!photo)continue;
  await save('/records/MenuCategory/'+encodeURIComponent(String(categoryRecord.Id)),
    {CategoryImage:photo},'PATCH');
  assigned++;
}
console.log('Authenticated OneKiosk upgrade completed: '+current.components.length+
  ' editable page components; '+assigned+' category photos added.');
