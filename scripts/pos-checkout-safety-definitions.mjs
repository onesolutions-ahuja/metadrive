/**
 * POS package v1: metadata only. Uses the universal Object, Flow and Page engines.
 * No stock data or payment records are fabricated during installation.
 */
const field=(apiName,dataType,options={})=>({
 apiName,label:apiName,dataType,required:false,unique:false,...options
});
const relationship=(apiName,target,unique=false)=>field(apiName,'Lookup('+target+')',{
 unique,relationship:{type:'Lookup',targetObject:target,relationshipName:apiName.replace(/Id$/,''),
 childRelationshipName:apiName.replace(/Id$/,'')+'Records',deleteBehavior:'Restrict'}
});
const entity=(apiName,label,fields)=>({
 apiName,label,pluralLabel:label+'s',kind:'Custom Object',
 description:'Metadata-driven POS safety and audit data; only installed with POS',
 fields:[field('Name','Text(255)',{required:true}),...fields]
});
export const checkoutSafetyVersion=1;
export const checkoutSafetyObjects=[
 entity('POS_CashPayment__c','POS Cash Payment',[
  relationship('SaleId','Sale__c'),relationship('OrderId','Order__c'),
  field('CheckoutRequestKey','Text(128)',{required:true,unique:true}),
  field('Amount','Currency(18, 2)'),field('CashReceived','Currency(18, 2)'),
  field('ChangeDue','Currency(18, 2)'),field('Status','Text(24)')
 ]),
 entity('POS_StockBalance__c','POS Stock Balance',[
  relationship('ProductId','Product__c',true),
  field('OnHand','Number(18, 2)',{required:true})
 ]),
 entity('POS_StockMovement__c','POS Stock Movement',[
  relationship('ProductId','Product__c'),
  relationship('SaleLineId','SaleLine__c',true),
  relationship('StockBalanceId','POS_StockBalance__c'),
  field('CheckoutRequestKey','Text(128)'),
  field('QuantityChange','Number(18, 2)',{required:true}),
  field('StockAfter','Number(18, 2)'),
  field('Reason','Text(32)')
 ])
];
export const checkoutSaleFields=[
 field('CheckoutRequestKey','Text(128)',{unique:true}),
 field('CashReceived','Currency(18, 2)'),
 field('ChangeDue','Currency(18, 2)'),
 field('IDChecked','Checkbox'),
 field('VerifiedCustomerAge','Number(3, 0)')
];
export const checkoutObjectNames=[
 'Product__c','Order__c','OrderLine__c','Sale__c','SaleLine__c',
 ...checkoutSafetyObjects.map(x=>x.apiName)
];
export function planCheckoutSafetyMetadata(objects){
 const byName=new Map(objects.map(x=>[x.apiName,x]));
 for(const name of ['Product__c','Sale__c','SaleLine__c','Order__c','OrderLine__c'])
  if(!byName.has(name))throw Error('Missing canonical checkout object '+name);
 const result=[];
 for(const required of checkoutSafetyObjects){
  const existing=byName.get(required.apiName);
  if(!existing){result.push({kind:'create',object:required});continue}
  for(const f of required.fields){
   const actual=existing.fields.find(x=>x.apiName===f.apiName);
   if(!actual)throw Error('Existing POS safety object lacks field '+existing.apiName+'.'+f.apiName+
    '; refusing silent relationship mutation');
   if(actual.dataType.replace(/\s/g,'')!==f.dataType.replace(/\s/g,''))
    throw Error('POS safety field type mismatch '+existing.apiName+'.'+f.apiName);
  }
 }
 const sale=byName.get('Sale__c');
 const missing=checkoutSaleFields.filter(required=>{
  const present=sale.fields.find(f=>f.apiName===required.apiName);
  if(!present)return true;
  if(present.dataType.replace(/\s/g,'')!==required.dataType.replace(/\s/g,''))
   throw Error('Sale field type mismatch '+required.apiName);
  return false;
 });
 if(missing.length){
  if(sale.kind!=='Custom Object')throw Error('Sale object cannot be extended safely');
  result.push({kind:'extend',object:{...sale,fields:[...sale.fields,...missing]}});
 }
 return result;
}
