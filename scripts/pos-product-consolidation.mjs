/**
 * Lossless logical retirement of the duplicate standard Product metadata.
 * Physical SQL Product rows remain archived; this function maps their identities
 * to Product__c before the generic retirement migration deactivates the old Object.
 */
import {randomUUID} from 'node:crypto';
const canonicalKey=x=>String(x??'').trim().toLowerCase();
export function consolidateRetiredProducts(tenant){
 const legacy=tenant.objects?.find(x=>x.apiName==='Product');
 if(!legacy)return {archived:0,migrated:0,reused:0,remappedInvoiceItems:0};
 const current=tenant.objects?.find(x=>x.apiName==='Product__c');
 if(!current)throw Error('Product__c must exist before Product retirement');
 const originals=tenant.records?.Product??[], target=tenant.records?.Product__c??[];
 const sku=new Map(),name=new Map(),ids=new Set(target.map(r=>r.Id));
 function index(rec){
  for(const [map,key,property] of [[sku,canonicalKey(rec.SKU||rec.SKU__c),'SKU'],
   [name,canonicalKey(rec.Name),'Name']]){
   if(!key)continue;
   const prior=map.get(key);
   if(prior&&prior.Id!==rec.Id)throw Error('Ambiguous canonical Product '+property+' duplicate; manual resolution required');
   map.set(key,rec);
  }
 }
 for(const record of target)index(record);
 const available=new Set(current.fields.map(f=>f.apiName));
 const validFields=new Map(current.fields.map(f=>[f.apiName,f]));
 const references=new Map();
 let migrated=0,reused=0;
 for(const old of originals){
  if(!old?.Id||!old.Name)throw Error('Legacy Product record lacks stable identity or Name');
  const skuMatch=sku.get(canonicalKey(old.SKU));
  const nameMatch=name.get(canonicalKey(old.Name));
  if(skuMatch&&nameMatch&&skuMatch.Id!==nameMatch.Id)
   throw Error('Legacy Product resolves to conflicting canonical SKU and Name');
  const existing=skuMatch??nameMatch;
  if(existing){
   references.set(old.Id,existing.Id);
   reused++;continue;
  }
  // Copy supported common fields only. Original rows stay in archival SQL,
  // and optional data is not silently replaced on any existing Product__c.
  const clone={Id:ids.has(old.Id)?randomUUID():old.Id,Name:old.Name};
  const oldNames=new Set((legacy.fields??[]).map(f=>f.apiName));
  for(const [key,v] of Object.entries(old)){
   if(['Id','Name','IsDeleted'].includes(key)||!available.has(key)||!oldNames.has(key))continue;
   const before=legacy.fields.find(f=>f.apiName===key);
   const after=validFields.get(key);
   if(before?.dataType!==after?.dataType)continue;
   clone[key]=v;
  }
  if(available.has('Price__c')&&clone.Price__c==null&&Number.isFinite(Number(old.DefaultPrice)))
   clone.Price__c=Number(old.DefaultPrice);
  if(available.has('SKU')&&old.SKU!=null)clone.SKU=old.SKU;
  const date=old.CreatedDate||old.LastModifiedDate||'2026-10-17T00:00:00.000Z';
  clone.CreatedDate=old.CreatedDate||date;
  clone.LastModifiedDate=old.LastModifiedDate||date;
  if(ids.has(clone.Id))throw Error('Canonical Product collision');
  target.push(clone);ids.add(clone.Id);index(clone);
  references.set(old.Id,clone.Id);migrated++;
 }
 // The retired InvoiceItem lookup must no longer depend on Product after
 // all existing links have been mapped; a missing target must fail closed.
 let remappedInvoiceItems=0;
 for(const item of tenant.records?.InvoiceItem??[]){
  if(item.ProductId==null)continue;
  if(references.has(item.ProductId)){
   item.ProductId=references.get(item.ProductId);remappedInvoiceItems++;
  }else if(!target.some(record=>record.Id===item.ProductId)){
   throw Error('InvoiceItem has unmapped legacy Product reference');
  }
 }
 const invoiceItem=tenant.objects?.find(x=>x.apiName==='InvoiceItem');
 const lookup=invoiceItem?.fields?.find(x=>x.apiName==='ProductId');
 if(lookup?.relationship?.targetObject==='Product'){
  lookup.relationship={...lookup.relationship,targetObject:'Product__c'};
  lookup.dataType='Lookup(Product__c)';
 }
 tenant.records.Product__c=target;
 return {archived:originals.length,migrated,reused,remappedInvoiceItems};
}
