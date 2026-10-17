/** Targeted, upgrade-safe repair for the Product fields-only retirement.
 * Run only under the encrypted-backup, restore-proven SQL migration workflow.
 * Retain the populated ImageUrl field and existing Product__c business rows.
 */
export function repairProductImageCaseCollision(state,tenantId){
 const tenant=state.tenants?.[tenantId];
 if(!tenant)throw Error('Product image repair: missing target tenant');
 const product=(tenant.objects??[]).find(object=>object.apiName==='Product__c');
 if(!product)throw Error('Product image repair: missing canonical Product__c Object');
 const fields=(product.fields??[]).filter(field=>String(field.apiName).toLowerCase()==='imageurl');
 if(fields.length===1)return {alreadyDone:true,removedEmptyField:false,updatedComponentDefaults:0};
 if(fields.length!==2||!fields.some(field=>field.apiName==='ImageUrl')||
    !fields.some(field=>field.apiName==='ImageURL')||fields.some(field=>field.dataType!=='URL'))
   throw Error('Product image repair: unexpected duplicate field metadata; manual review required');
 const records=tenant.records?.Product__c??[];
 if(records.some(record=>record.ImageURL!==undefined&&record.ImageURL!==null&&record.ImageURL!==''))
   throw Error('Product image repair: alias ImageURL contains business data; refusing removal');
 const supported=new Set(['OneItemGrid','RecordCatalogCart','OneShoppingCart']);
 let updatedComponentDefaults=0;
 for(const component of state.libraryComponents??[]){
  for(const definition of component.propertyDefinitions??[]){
   if(definition.defaultValue!=='ImageURL')continue;
   if(!supported.has(component.apiName))
     throw Error('Product image repair: unexpected component binding to ImageURL: '+component.apiName);
   definition.defaultValue='ImageUrl';
   updatedComponentDefaults++;
  }
 }
 // Historical metadata remains in SQL backup and version history; only the
 // empty current field definition and its three known UI defaults change.
 product.fields=product.fields.filter(field=>field.apiName!=='ImageURL');
 return {alreadyDone:false,removedEmptyField:true,updatedComponentDefaults};
}
