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
// Extend existing shared commerce objects; do not reseed duplicate modifier Objects.
export const customisationObjects=[];
export const customisationObjectExtensions={
  ProductModifierGroup__c:[
    f('MinSelections','Number(9, 0)'),f('MaxSelections','Number(9, 0)'),
    f('IsRequired','Checkbox'),f('IsActive','Checkbox'),
    f('SortOrder','Number(9, 0)')
  ],
  ProductModifier__c:[
    link('GroupId','ProductModifierGroup__c','ProductModifierOptions'),
    f('IsActive','Checkbox'),f('SortOrder','Number(9, 0)')
  ],
  ProductCategory:[
    f('ImageUrl','URL'),f('SortOrder','Number(18, 2)'),f('IsActive','Checkbox')
  ],
  Product__c:[
    link('CategoryId','ProductCategory','ProductsByCategory')
  ]
};
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
    f('SelectionFingerprint','Text(255)'),
    link('ParentOrderLineId','OrderLine__c','ModifierChildLines'),
    link('ProductModifierId','ProductModifier__c','SelectedProductModifiers')
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
