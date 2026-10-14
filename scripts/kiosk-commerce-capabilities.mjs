// Commerce capabilities stay metadata-driven. No kiosk-specific API handlers.
const f=(apiName,dataType,options={})=>({apiName,label:apiName,dataType,required:false,unique:false,...options});
const link=(name,target,relation,required=false)=>f(name,`Lookup(${target})`,{
  required,relationship:{type:'Lookup',targetObject:target,relationshipName:relation,
  childRelationshipName:relation+'s',deleteBehavior:'Restrict'}
});
const entity=(apiName,label,fields)=>({apiName,label,pluralLabel:label+'s',
  kind:'Custom Object',description:'Reusable product customisation metadata for commerce apps.',
  fields:[f('Name','Text(255)',{required:true}),...fields]
});
export const customisationObjects=[
  entity('ModifierGroup__c','Modifier Group',[
    f('MinSelections','Number(9, 0)'),f('MaxSelections','Number(9, 0)'),
    f('IsRequired','Checkbox'),f('IsActive','Checkbox'),f('SortOrder','Number(9, 0)')
  ]),
  entity('ModifierOption__c','Modifier Option',[
    link('GroupId','ModifierGroup__c','ModifierOptions',true),
    f('PriceAdjustment','Currency(18, 2)'),f('IsActive','Checkbox'),f('SortOrder','Number(9, 0)')
  ]),
  entity('ProductModifierGroup__c','Product Modifier Group',[
    link('ProductId','Product__c','ProductModifierGroups',true),
    link('GroupId','ModifierGroup__c','GroupAssignments',true),f('SortOrder','Number(9, 0)')
  ]),
  entity('OrderLineModifier__c','Order Line Modifier',[
    link('OrderLineId','OrderLine__c','SelectedModifiers',true),
    link('ModifierOptionId','ModifierOption__c','ModifierSelections',true),
    f('PriceAdjustment','Currency(18, 2)'),f('Quantity','Number(9, 0)')
  ])
];
// Reuse Order__c (Draft) and OrderLine__c as durable basket state.
// These optional fields enable anonymous session ownership and line recalculation.
export const basketObjectExtensions={
  Order__c:[
    f('BasketSessionKey','Text(128)'),
    f('BasketExpiresAt','DateTime'),
    f('BasketVersion','Number(18, 0)')
  ],
  OrderLine__c:[
    f('BaseUnitPrice','Currency(18, 2)'),
    f('ModifierTotal','Currency(18, 2)'),
    f('SelectionFingerprint','Text(255)')
  ]
};
export const demoModifierGroups=[
  {Name:'Demo Burger Extras',MinSelections:0,MaxSelections:3,IsRequired:false,IsActive:true,SortOrder:1},
  {Name:'Demo Cooking Preference',MinSelections:1,MaxSelections:1,IsRequired:true,IsActive:true,SortOrder:2}
];
export const demoModifierOptions=[
  {Name:'Demo Extra Cheese',group:'Demo Burger Extras',PriceAdjustment:0.75,IsActive:true,SortOrder:1},
  {Name:'Demo Extra Patty',group:'Demo Burger Extras',PriceAdjustment:2.00,IsActive:true,SortOrder:2},
  {Name:'Demo No Onion',group:'Demo Burger Extras',PriceAdjustment:0,IsActive:true,SortOrder:3},
  {Name:'Demo Regular',group:'Demo Cooking Preference',PriceAdjustment:0,IsActive:true,SortOrder:1},
  {Name:'Demo Well Done',group:'Demo Cooking Preference',PriceAdjustment:0,IsActive:true,SortOrder:2}
];
export const demoModifierAssignments=[
  {product:'Demo Classic Burger',group:'Demo Burger Extras'},
  {product:'Demo Classic Burger',group:'Demo Cooking Preference'},
  {product:'Demo Crispy Chicken Burger',group:'Demo Burger Extras'}
];
