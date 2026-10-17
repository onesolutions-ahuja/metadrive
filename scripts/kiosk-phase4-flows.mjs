// Kiosk installation uses the existing generic Flow engine: no bespoke API routes.
// Runtime record actions retain MetaDrive Object/FLS/RBAC and tenant enforcement.
const e=(id,type,label,config={})=>({id,type,label,config});
const edge=(from,to,label='')=>({id:'e'+from+'_'+to+'_'+label.replace(/[^A-Za-z0-9]/g,''),from,to,label,kind:'normal'});
const resource=(name,type='Variable',dataType='Text',isCollection=false,input=false,output=false,value)=>
 ({name,label:name,type,dataType,isCollection,availableForInput:input,availableForOutput:output,
   ...(value!==undefined?{value}:{})});
const input=(name,dataType='Text')=>resource(name,'Variable',dataType,false,true,false);
const output=(name,dataType='Text',value)=>resource(name,'Variable',dataType,false,false,true,value);
const record=(name,object,outputFlag=false)=>resource(name,'Record',object,false,false,outputFlag,null);
const collection=(name,object,outputFlag=false,initial)=>resource(name,'Record Collection',object,true,false,outputFlag,initial);
const get=(id,label,object,conditions,outputVariable,recordLimit='1')=>
 e(id,'Get Records',label,{object,conditions,outputVariable,recordLimit});
const cond=(field,operator,value)=>({field,operator,value});
const field=(field,value)=>({field,value});
const decision=(id,label,outcomes)=>e(id,'Decision',label,{outcomes:[...outcomes,{name:'Default',label:'Default',conditions:[]}]});
const assign=(id,label,variable,operator,value)=>e(id,'Assignment',label,{variable,operator,value});
const create=(id,label,object,values)=>e(id,'Create Records',label,{object,fieldValues:Object.entries(values).map(([k,v])=>field(k,v))});
const update=(id,label,object,conditions,values)=>e(id,'Update Records',label,{object,conditions,fieldValues:Object.entries(values).map(([k,v])=>field(k,v))});
const remove=(id,label,object,conditions)=>e(id,'Delete Records',label,{object,conditions});
const loop=(id,label,collectionName,loopVariable)=>e(id,'Loop',label,{collection:collectionName,loopVariable});
const yes=(name,conditions)=>({name,label:name,conditions});
const flow=(apiName,label,elements,connectors,resources,description)=>({
 apiName,label,description:'MetaDrive Commerce Phase 4: '+description,
 flowType:'Autolaunched Flow',status:'Active',versionNumber:1,activeVersion:null,
 triggerObject:null,startConfig:{},elements,connectors,resources,versions:[]
});
const sessionConditions=[
 cond('BasketSessionKey','Equals','{!SessionKey}'),cond('Status','Equals','Draft')
];
export const commerceFlows=[
 flow('MD_Commerce_ModifierCatalog','Load Product Modifier Choices',[
  e(1,'Start','Start'),
  get(2,'Get assigned groups','ProductModifierGroup__c',[cond('ProductId','Equals','{!ProductId}')],'Assignments','all'),
  get(3,'Get enabled groups','ProductModifierGroup__c',[cond('ProductId','Equals','{!ProductId}'),cond('IsActive','Equals',true)],'Groups','all'),
  get(4,'Get enabled options','ProductModifier__c',[cond('IsActive','Equals',true)],'Options','all'),
  e(5,'End','End')
 ],[edge(1,2),edge(2,3),edge(3,4),edge(4,5)],[
  input('ProductId'),collection('Assignments','ProductModifierGroup__c',true),
  collection('Groups','ProductModifierGroup__c',true),collection('Options','ProductModifier__c',true)
 ],'Read live assigned modifier groups/options for product editor.'),
 flow('MD_Commerce_LoadBasket','Load Draft Basket',[
  e(1,'Start','Start'),
  get(2,'Get session basket','Order__c',sessionConditions,'Basket'),
  get(3,'Get basket lines','OrderLine__c',[cond('OrderId','Equals','{!Basket.Id}')],'Lines','all'),
  e(4,'End','End')
 ],[edge(1,2),edge(2,3),edge(3,4)],[
  input('SessionKey'),record('Basket','Order__c',true),collection('Lines','OrderLine__c',true)
 ],'Read basket by server-filtered session key.'),
 flow('MD_Commerce_AddProduct','Add Product to Draft Basket',[
  e(1,'Start','Start'),
  get(2,'Find active product','Product__c',[cond('Id','Equals','{!ProductId}'),cond('IsActive','Equals',true)],'Product'),
  decision(3,'Validate product and quantity',[yes('Valid',[
   cond('{!Product.Id}','Is Not Null',''),cond('{!Quantity}','Greater Than',0),
   cond('{!Quantity}','Less Than',21),cond('{!SessionKey}','Is Not Null','')
  ])]),
  get(4,'Read product group assignments','ProductModifierGroup__c',[cond('ProductId','Equals','{!ProductId}')],'Assignments','all'),
  loop(5,'Validate each requested option','Selections','Candidate'),
  get(6,'Read trusted option','ProductModifier__c',[cond('Id','Equals','{!Candidate.Id}'),cond('IsActive','Equals',true)],'Option'),
  get(7,'Check option belongs to product','ProductModifierGroup__c',[
   cond('ProductId','Equals','{!ProductId}'),cond('Id','Equals','{!Option.GroupId}')
  ],'OptionAssignment'),
  decision(8,'Reject invalid or unassigned options',[yes('Allowed',[
   cond('{!Option.Id}','Is Not Null',''),cond('{!OptionAssignment.Id}','Is Not Null','')
  ])]),
  assign(9,'Collect verified option','VerifiedOptions','Add','{!Option}'),
  assign(10,'Accumulate verified option price','ModifierAmount','Add','{!Option.Price__c}'),
  loop(11,'Validate group selection rules','Assignments','Assignment'),
  get(12,'Get product modifier group','ProductModifierGroup__c',[cond('Id','Equals','{!Assignment.Id}')],'CurrentGroup'),
  e(13,'Collection Filter','Only selected options in current group',{collection:'VerifiedOptions',outputCollection:'GroupSelections',
   conditions:[cond('GroupId','Equals','{!CurrentGroup.Id}')]}),
  decision(14,'Enforce modifier minimum and maximum',[
   yes('TooFew',[cond('{!GroupSelections.length}','Less Than','{!CurrentGroup.MinSelections}')]),
   yes('TooMany',[cond('{!GroupSelections.length}','Greater Than','{!CurrentGroup.MaxSelections}')])
  ]),
  get(15,'Find existing draft basket','Order__c',sessionConditions,'Basket'),
  decision(16,'Reuse session basket',[yes('Exists',[cond('{!Basket.Id}','Is Not Null','')])]),
  assign(17,'Use existing basket','BasketId','Assign','{!Basket.Id}'),
  create(18,'Create draft order','Order__c',{Name:'Draft Basket',Status:'Draft',BasketSessionKey:'{!SessionKey}',
   Subtotal:0,TaxAmount:0,Total:0,CurrencyCode:'GBP'}),
  assign(19,'Start at base price','UnitAmount','Assign','{!Product.DefaultPrice}'),
  create(20,'Create order line','OrderLine__c',{Name:'{!Product.Name}',OrderId:'{!BasketId}',
   ProductId:'{!ProductId}',Quantity:'{!Quantity}',BaseUnitPrice:'{!Product.DefaultPrice}',
   ModifierTotal:'{!ModifierAmount}',UnitPrice:'{!UnitAmount}',LineTotal:'{!LineAmount}'}),
  loop(21,'Save validated options','VerifiedOptions','SavedOption'),
  create(22,'Store line option','OrderLine__c',{Name:'{!SavedOption.Name}',OrderId:'{!BasketId}',
   ParentOrderLineId:'{!record20.Id}',ProductModifierId:'{!SavedOption.Id}',
   Quantity:1,UnitPrice:0,LineTotal:0}),
  assign(23,'Use new basket','BasketId','Assign','{!record18.Id}'),
  assign(24,'Include modifier prices','UnitAmount','Add','{!ModifierAmount}'),
  assign(25,'Set extended price','LineAmount','Assign','{!UnitAmount}'),
  assign(26,'Calculate extended price','LineAmount','Multiply','{!Quantity}'),
  get(27,'Get updated basket lines','OrderLine__c',[cond('OrderId','Equals','{!BasketId}')],'BasketLines','all'),
  loop(28,'Sum basket lines','BasketLines','RunningLine'),
  assign(29,'Add line amount','BasketAmount','Add','{!RunningLine.LineTotal}'),
  update(30,'Update basket totals','Order__c',[cond('Id','Equals','{!BasketId}')],
   {Subtotal:'{!BasketAmount}',TaxAmount:0,Total:'{!BasketAmount}'}),
  assign(31,'Confirm add','Added','Assign',true),
  e(32,'End','Completed'),e(99,'End','Rejected')
 ],[
  edge(1,2),edge(2,3),edge(3,4,'Valid'),edge(3,99,'Default'),
  edge(4,5),edge(5,6,'For each'),edge(5,11,'After last'),
  edge(6,7),edge(7,8),edge(8,9,'Allowed'),edge(8,99,'Default'),
  edge(9,10),edge(10,5),
  edge(11,12,'For each'),edge(11,15,'After last'),
  edge(12,13),edge(13,14),edge(14,99,'TooFew'),edge(14,99,'TooMany'),
  edge(14,11,'Default'),
  edge(15,16),edge(16,17,'Exists'),edge(16,18,'Default'),
  edge(17,19),edge(18,23),edge(23,19),edge(19,24),edge(24,25),edge(25,26),edge(26,20),
  edge(20,21),edge(21,22,'For each'),edge(21,27,'After last'),
  edge(22,21),edge(27,28),edge(28,29,'For each'),edge(28,30,'After last'),
  edge(29,28),edge(30,31),edge(31,32)
 ],[
  input('SessionKey'),input('ProductId'),input('Quantity','Number'),
  resource('Selections','Record Collection','ProductModifier__c',true,true,false,[]),
  record('Product','Product__c'),collection('Assignments','ProductModifierGroup__c'),
  resource('Candidate','Record','ProductModifier__c',false,false,false,null),
  record('Option','ProductModifier__c'),record('OptionAssignment','ProductModifierGroup__c'),
  collection('VerifiedOptions','ProductModifier__c',false,[]),
  resource('ModifierAmount','Variable','Number',false,false,false,0),
  resource('Assignment','Record','ProductModifierGroup__c'),
  record('CurrentGroup','ProductModifierGroup__c'),
  collection('GroupSelections','ProductModifier__c',false,[]),
  record('Basket','Order__c'),output('BasketId','Text',''),
  resource('UnitAmount','Variable','Currency',false,false,false,0),
  resource('LineAmount','Variable','Currency',false,false,false,0),
  resource('SavedOption','Record','ProductModifier__c'),
  collection('BasketLines','OrderLine__c'),
  resource('RunningLine','Record','OrderLine__c'),
  resource('BasketAmount','Variable','Currency',false,false,false,0),
  output('Added','Boolean',false)
 ],'Server-validated product and group-limited modifier selection, atomic line creation and totals.'),
 flow('MD_Commerce_RemoveLine','Remove Basket Line',[
  e(1,'Start','Start'),
  get(2,'Find session basket','Order__c',sessionConditions,'Basket'),
  get(3,'Find basket-owned line','OrderLine__c',[
   cond('Id','Equals','{!LineId}'),cond('OrderId','Equals','{!Basket.Id}')],'Line'),
  decision(4,'Validate line ownership',[yes('Found',[
   cond('{!Basket.Id}','Is Not Null',''),cond('{!Line.Id}','Is Not Null','')])]),
  remove(5,'Remove line modifiers','OrderLine__c',[cond('ParentOrderLineId','Equals','{!Line.Id}')]),
  remove(6,'Remove line','OrderLine__c',[
   cond('Id','Equals','{!Line.Id}'),cond('OrderId','Equals','{!Basket.Id}')]),
  get(7,'Load remaining lines','OrderLine__c',[cond('OrderId','Equals','{!Basket.Id}')],'Lines','all'),
  loop(8,'Recalculate totals','Lines','Line'),
  assign(9,'Sum line','Subtotal','Add','{!Line.LineTotal}'),
  update(10,'Write new totals','Order__c',[cond('Id','Equals','{!Basket.Id}')],
   {Subtotal:'{!Subtotal}',TaxAmount:0,Total:'{!Subtotal}'}),
  assign(11,'Confirm removal','Removed','Assign',true),
  e(12,'End','Completed'),e(99,'End','Rejected')
 ],[edge(1,2),edge(2,3),edge(3,4),edge(4,5,'Found'),edge(4,99,'Default'),
 edge(5,6),edge(6,7),edge(7,8),edge(8,9,'For each'),edge(8,10,'After last'),
 edge(9,8),edge(10,11),edge(11,12)],[input('SessionKey'),input('LineId'),
 record('Basket','Order__c'),record('Line','OrderLine__c'),
 collection('Lines','OrderLine__c'),resource('Subtotal','Variable','Currency',false,false,false,0),
 output('Removed','Boolean',false)],'Removes only a line owned by the current draft basket and recalculates totals.'),
 flow('MD_Commerce_SubmitBasket','Submit Basket for Payment',[
  e(1,'Start','Start'),
  get(2,'Find draft basket','Order__c',sessionConditions,'Basket'),
  get(3,'Get basket lines','OrderLine__c',[cond('OrderId','Equals','{!Basket.Id}')],'Lines','all'),
  decision(4,'Require a nonempty draft basket',[yes('Ready',[
   cond('{!Basket.Id}','Is Not Null',''),cond('{!Lines.length}','Greater Than',0)])]),
  update(5,'Submit order','Order__c',[cond('Id','Equals','{!Basket.Id}')],{Status:'Submitted'}),
  assign(6,'Confirm submission','Submitted','Assign',true),
  e(7,'End','Done'),e(99,'End','No basket')
 ],[edge(1,2),edge(2,3),edge(3,4),edge(4,5,'Ready'),edge(4,99,'Default'),edge(5,6),edge(6,7)],[
 input('SessionKey'),record('Basket','Order__c'),collection('Lines','OrderLine__c'),
 output('Submitted','Boolean',false)],'Creates a submitted order, never fabricates a paid transaction.')
];
