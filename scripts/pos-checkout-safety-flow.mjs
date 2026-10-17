/**
 * Metadata-only cash, Challenge 25 and stock Flow plan.
 * All decisions and CRUD use shared Flow runtime and OneEngine.
 * The draft is never activated by this planner.
 */
const el=(id,type,label,config={})=>({id,type,label,config});
const condition=(field,operator,value='')=>({field,operator,value});
const link=(from,to,label='')=>({id:'pos-safe-'+from+'-'+to+'-'+label.replace(/[^a-zA-Z0-9]/g,''),
 from,to,label,kind:'normal'});
const value=(field,value)=>({field,value});
const get=(id,label,object,conditions,outputVariable)=>el(id,'Get Records',label,{
 object,conditions,recordLimit:'1',outputVariable
});
const assignment=(id,label,variable,operator,value)=>el(id,'Assignment',label,{
 variable,operator,value
});
const create=(id,label,object,fields)=>el(id,'Create Records',label,{
 object,fieldValues:Object.entries(fields).map(([key,v])=>value(key,v))
});
const decision=(id,label,outcomes)=>el(id,'Decision',label,{
 outcomes:[...outcomes.map(([name,conditions])=>({name,label:name,conditions})),
  {name:'Default',label:'Default',conditions:[]}]
});
const outcome=(name,...conditions)=>[name,conditions];
const output=(name,dataType='Text',input=false)=>({
 name,label:name,type:'Variable',dataType,isCollection:false,
 availableForInput:input,availableForOutput:true
});
export function planCashAgeStockFlow(source,objects){
 if(source.status!=='Draft'||source.activeVersion!=null)
  throw Error('Refusing to modify active checkout');
 const needed=['POS_CashPayment__c','POS_StockBalance__c','POS_StockMovement__c',
  'Product__c','Sale__c','SaleLine__c','Order__c','OrderLine__c'];
 for(const name of needed)if(!objects.some(o=>o.apiName===name))
  throw Error('Missing installed POS metadata: '+name);
 const next=structuredClone(source);
 if(next.elements.some(x=>x.label==='POS Safety - Previous Payment'))return null;
 const nodes=next.elements;
 const edges=next.connectors;
 const query=nodes.find(e=>e.type==='Get Records'&&e.config?.object==='OrderLine__c'&&String(e.config?.recordLimit)==='all');
 const gate=nodes.find(e=>e.type==='Decision'&&e.label==='Validate Cash and Basket');
 const sale=nodes.find(e=>e.type==='Create Records'&&e.config?.object==='Sale__c');
 const saleLine=nodes.find(e=>e.type==='Create Records'&&e.config?.object==='SaleLine__c');
 const loop=nodes.find(e=>e.type==='Loop'&&e.config?.loopVariable==='CurrentOrderLine');
 const existingProduct=nodes.find(e=>e.type==='Get Records'&&e.config?.object==='Product__c');
 const screen=nodes.find(e=>e.type==='Screen'&&/cash/i.test(e.label));
 const complete=nodes.find(e=>e.type==='Screen'&&/complete/i.test(e.label));
 if(!query||!gate||!sale||!saleLine||!loop||!existingProduct||!screen||!complete)
  throw Error('Checkout Flow graph differs from approved draft; refusing edits');
 function take(from,to,label=''){
  const index=edges.findIndex(e=>e.from===from&&e.to===to&&
    (label===''||e.label.toLowerCase()===label.toLowerCase()));
  if(index<0)throw Error('Expected checkout connector '+from+' -> '+to+' absent');
  return edges.splice(index,1)[0];
 }
 take(gate.id,sale.id,'Default');
 take(existingProduct.id,saleLine.id);
 take(saleLine.id,loop.id);
 take(loop.id,complete.id,'After Last');
 // Reuse the original finish Screen's position but complete the Flow without
 // a second user click after durable checkout mutations.
 next.connectors=edges.filter(e=>e.from!==complete.id);
 next.elements=nodes.filter(e=>e.id!==complete.id);
 const checkout=next.elements;
 const graph=next.connectors;
 const existingNames=new Set(next.resources.map(x=>x.name));
 const addResource=x=>{if(!existingNames.has(x.name)){next.resources.push(x);existingNames.add(x.name)}};
 addResource(output('CheckoutStatus'));
 addResource(output('ChangeDue','Currency'));
 addResource(output('CheckoutRequestKey','Text',true));
 addResource({name:'RemainingStock',label:'Remaining Stock',type:'Variable',dataType:'Number',
  isCollection:false,availableForInput:false,availableForOutput:false,value:0});
 for(const field of [
  {apiName:'IDChecked',type:'Checkbox',label:'Customer photographic ID verified',required:false,defaultValue:false},
  {apiName:'VerifiedCustomerAge',type:'Number',label:'Age verified from ID (restricted items)',min:0,max:120,required:false}
 ])if(!(screen.config.fields??[]).some(f=>f.apiName===field.apiName))
  screen.config.fields.push(field);
 // Explicitly gate an empty cart and absent idempotency key.
 const outcomes=gate.config.outcomes;
 if(!outcomes.some(x=>x.name==='MissingTotal'))outcomes.splice(outcomes.length-1,0,
  {name:'MissingTotal',label:'MissingTotal',conditions:[
   condition('{!element3.Total}','Is Null')]});
 if(!outcomes.some(x=>x.name==='EmptyBasket'))outcomes.splice(outcomes.length-1,0,
  {name:'EmptyBasket',label:'EmptyBasket',conditions:[
   condition('{!CurrentOrderLines.length}','Less Than',1)]});
 if(!outcomes.some(x=>x.name==='MissingRequestKey'))outcomes.splice(outcomes.length-1,0,
  {name:'MissingRequestKey',label:'MissingRequestKey',conditions:[
   condition('{!CheckoutRequestKey}','Is Null')]});
 const reject=next.elements.find(e=>e.label==='Cash Checkout Rejected');
 if(!reject)throw Error('Cash rejection End node missing');
 for(const label of ['EmptyBasket','MissingRequestKey','MissingTotal']){
  if(!graph.some(e=>e.from===gate.id&&e.label===label))
   graph.push(link(gate.id,reject.id,label));
 }
 // Preserve exact request ID for idempotency and cashier event correlation.
 const saleFields=new Map((sale.config.fieldValues??[]).map(f=>[f.field,f.value]));
 for(const [key,v] of Object.entries({
  CheckoutRequestKey:'{!CheckoutRequestKey}',
  CashReceived:'{!CashReceived}',ChangeDue:'{!ChangeDue}',
  IDChecked:'{!IDChecked}',VerifiedCustomerAge:'{!VerifiedCustomerAge}'
 }))saleFields.set(key,v);
 sale.config.fieldValues=[...saleFields].map(([field,value])=>({field,value}));
 let id=Math.max(...next.elements.map(e=>e.id))+1;
 const add=(type,label,config)=>{const x=el(id++,type,label,config);checkout.push(x);return x};
 const priorPayment=add('Get Records','POS Safety - Previous Payment',{
  object:'POS_CashPayment__c',conditions:[
   condition('CheckoutRequestKey','Equals','{!CheckoutRequestKey}')],
  recordLimit:'1',outputVariable:'PreviousPayment'});
 const replay=add('Decision','POS Safety - Prevent Duplicate Payment',decision(0,'',[
  outcome('CompletedEarlier',condition('{!PreviousPayment.Id}','Is Not Null'))
 ]).config);
 const priorSale=get(id++,'POS Safety - Previous Sale','Sale__c',[
  condition('CheckoutRequestKey','Equals','{!CheckoutRequestKey}')],'PreviousSale');
 checkout.push(priorSale);
 const existingSale=add('Decision','POS Safety - Reject Incomplete Sale',decision(0,'',[
  outcome('IncompletePrior',condition('{!PreviousSale.Id}','Is Not Null'))
 ]).config);
 const priorChange=assignment(id++,'POS Safety - Previous Change','ChangeDue','Assign','{!PreviousPayment.ChangeDue}');
 checkout.push(priorChange);
 const accepted=assignment(id++,'POS Safety - Accepted','CheckoutStatus','Assign','Accepted');checkout.push(accepted);
 const failed=assignment(id++,'POS Safety - Declined','CheckoutStatus','Assign','Declined');checkout.push(failed);
 const finished=add('End','POS Safety - Finished',{});
 // Preflight checks authoritative Product and Stock records before any writes.
 const validationLoop=add('Loop','POS Safety - Validate Lines',{collection:'CurrentOrderLines',loopVariable:'ValidationLine'});
 const validationProduct=get(id++,'POS Safety - Trusted Product','Product__c',[
  condition('Id','Equals','{!ValidationLine.ProductId}')],'ValidationProduct');checkout.push(validationProduct);
 const age=add('Decision','POS Safety - Challenge 25',decision(0,'',[
  outcome('ProductMissing',condition('{!ValidationProduct.Id}','Is Null')),
  outcome('InactiveProduct',condition('{!ValidationProduct.IsActive}','Not Equals',true)),
  outcome('InvalidLineQuantity',condition('{!ValidationLine.Quantity}','Less Than',1)),
  outcome('MissingID',condition('{!ValidationProduct.AgeRestricted}','Equals',true),
   condition('{!IDChecked}','Not Equals',true)),
  outcome('AgeMissing',condition('{!ValidationProduct.AgeRestricted}','Equals',true),
   condition('{!VerifiedCustomerAge}','Is Null')),
  outcome('Underage',condition('{!ValidationProduct.AgeRestricted}','Equals',true),
   condition('{!VerifiedCustomerAge}','Less Than',18)),
  outcome('BelowProductMinimum',condition('{!ValidationProduct.AgeRestricted}','Equals',true),
   condition('{!VerifiedCustomerAge}','Less Than','{!ValidationProduct.MinimumAge}')),
  outcome('ImplausibleAge',condition('{!ValidationProduct.AgeRestricted}','Equals',true),
   condition('{!VerifiedCustomerAge}','Greater Than',120)),
  outcome('AgeClassificationMissing',condition('{!ValidationProduct.AgeRestricted}','Is Null'))
 ]).config);
 const validationStock=get(id++,'POS Safety - Available Stock','POS_StockBalance__c',[
  condition('ProductId','Equals','{!ValidationLine.ProductId}')],'ValidationStock');checkout.push(validationStock);
 const available=add('Decision','POS Safety - Stock Precheck',decision(0,'',[
  outcome('NoBalance',condition('{!ValidationStock.Id}','Is Null')),
  outcome('InsufficientStock',condition('{!ValidationStock.OnHand}','Less Than','{!ValidationLine.Quantity}'))
 ]).config);
 // Calculate change only after the cash and age/stock checks.
 const changeFromCash=assignment(id++,'POS Safety - Calculate Change','ChangeDue','Assign','{!CashReceived}');
 const changeLessTotal=assignment(id++,'POS Safety - Deduct Total','ChangeDue','Subtract','{!element3.Total}');
 checkout.push(changeFromCash,changeLessTotal);
 const currentStock=get(id++,'POS Safety - Recheck Stock','POS_StockBalance__c',[
  condition('ProductId','Equals','{!CurrentOrderLine.ProductId}')],'WriteStock');checkout.push(currentStock);
 const stockGate=add('Decision','POS Safety - Verify Write Stock',decision(0,'',[
  outcome('NoBalance',condition('{!WriteStock.Id}','Is Null')),
  outcome('InsufficientStock',condition('{!WriteStock.OnHand}','Less Than','{!CurrentOrderLine.Quantity}'))
 ]).config);
 const setRemaining=assignment(id++,'POS Safety - Starting Stock','RemainingStock','Assign','{!WriteStock.OnHand}');
 const subtract=assignment(id++,'POS Safety - Deduct Stock','RemainingStock','Subtract','{!CurrentOrderLine.Quantity}');
 checkout.push(setRemaining,subtract);
 const writeStock=add('Update Records','POS Safety - Decrement Balance',{
  object:'POS_StockBalance__c',conditions:[condition('Id','Equals','{!WriteStock.Id}')],
  fieldValues:[value('OnHand','{!RemainingStock}')]
 });
 const movement=create(id++,'POS Safety - Record Stock Movement','POS_StockMovement__c',{
  Name:'POS sale stock movement',ProductId:'{!CurrentOrderLine.ProductId}',
  SaleLineId:'{!record'+saleLine.id+'.Id}',StockBalanceId:'{!WriteStock.Id}',
  CheckoutRequestKey:'{!CheckoutRequestKey}',QuantityChange:'{!CurrentOrderLine.Quantity}',
  StockAfter:'{!RemainingStock}',Reason:'Sale'
 });checkout.push(movement);
 const cashPayment=create(id++,'POS Safety - Record Cash Payment','POS_CashPayment__c',{
  Name:'POS cash payment',SaleId:'{!record'+sale.id+'.Id}',
  OrderId:'{!element3.Id}',CheckoutRequestKey:'{!CheckoutRequestKey}',
  Amount:'{!element3.Total}',CashReceived:'{!CashReceived}',
  ChangeDue:'{!ChangeDue}',Status:'Completed'
 });checkout.push(cashPayment);
 const rollback=add('Roll Back Records','POS Safety - Rollback Incomplete Checkout',{});
 // All write paths finish before success is exposed to the page.
 graph.push(link(gate.id,priorPayment.id,'Default'),
  link(priorPayment.id,replay.id),
  link(replay.id,priorChange.id,'CompletedEarlier'),
  link(priorChange.id,accepted.id),
  link(replay.id,priorSale.id,'Default'),
  link(priorSale.id,existingSale.id),
  link(existingSale.id,failed.id,'IncompletePrior'),
  link(existingSale.id,validationLoop.id,'Default'),
  link(validationLoop.id,validationProduct.id,'For Each'),
  link(validationProduct.id,age.id));
 for(const name of ['ProductMissing','InactiveProduct','InvalidLineQuantity','MissingID','AgeMissing','Underage','BelowProductMinimum','ImplausibleAge','AgeClassificationMissing'])
  graph.push(link(age.id,failed.id,name));
 graph.push(link(age.id,validationStock.id,'Default'),
  link(validationStock.id,available.id));
 for(const name of ['NoBalance','InsufficientStock'])
  graph.push(link(available.id,failed.id,name));
 graph.push(link(available.id,validationLoop.id,'Default'),
  link(validationLoop.id,changeFromCash.id,'After Last'),
  link(changeFromCash.id,changeLessTotal.id),
  link(changeLessTotal.id,sale.id),
  link(existingProduct.id,currentStock.id),
  link(currentStock.id,stockGate.id));
 for(const name of ['NoBalance','InsufficientStock'])
  graph.push(link(stockGate.id,rollback.id,name));
 graph.push(link(stockGate.id,saleLine.id,'Default'),
  link(saleLine.id,setRemaining.id),
  link(setRemaining.id,subtract.id),
  link(subtract.id,writeStock.id),
  link(writeStock.id,movement.id),
  link(movement.id,loop.id),
  link(loop.id,cashPayment.id,'After Last'),
  link(cashPayment.id,accepted.id),
  link(accepted.id,finished.id),
  link(failed.id,finished.id),
  link(rollback.id,failed.id));
 next.description=(next.description??'')+' | POS safety v1: cash, age, inventory, idempotency';
 return next;
}
