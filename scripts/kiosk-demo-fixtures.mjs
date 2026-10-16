// Reusable, tenant-safe kiosk sample data. These are ordinary MetaDrive Object definitions,
// installed only via the authenticated Object API; no direct database writes.
const field=(apiName,label,dataType,options={})=>({apiName,label,dataType,required:false,unique:false,...options});
const text=(name,label=name)=>field(name,label,'Text(255)');
const lookup=(name,target,relation)=>field(name,name,`Lookup(${target})`,{relationship:{type:'Lookup',targetObject:target,relationshipName:relation,childRelationshipName:relation+'s',deleteBehavior:'Restrict'}});
const money=(name)=>field(name,name,'Currency(18, 2)');
const number=(name)=>field(name,name,'Number(18, 2)');
const create=(apiName,label,fields)=>({
  apiName,label,pluralLabel:label+'s',kind:'Custom Object',
  description:'Reusable commerce metadata for all MetaDrive apps; kiosk demo seed v1.',
  fields:[field('Name','Name','Text(255)',{required:true}),...fields]
});
export const kioskObjectDefinitions=[
  create('ProductCategory__c','Product Category',[
    field('ImageUrl','Category Image URL','URL'),number('SortOrder'),field('IsActive','Active','Checkbox'),lookup('ParentCategoryId','ProductCategory__c','Subcategory')
  ]),
  create('Product__c','Product',[
    text('SKU'),lookup('CategoryId','ProductCategory__c','ProductsByCategory'),money('DefaultPrice'),
    field('ImageUrl','Product Image URL','URL'),field('IsActive','Active','Checkbox'),text('Description')
  ]),
  create('Order__c','Order',[
    field('Status','Status','Picklist',{picklistValues:['Draft','Submitted','Paid','Cancelled']}),
    money('Subtotal'),money('TaxAmount'),money('Total'),text('CurrencyCode'),text('ExternalReference')
  ]),
  create('OrderLine__c','Order Line',[
    lookup('OrderId','Order__c','OrderLines'),lookup('ProductId','Product__c','OrderProductLines'),
    number('Quantity'),money('UnitPrice'),money('LineTotal'),text('Notes')
  ]),
  create('SaleLine__c','Sale Line',[
    lookup('SaleId','Sale__c','SaleLines'),lookup('ProductId','Product__c','SaleProductLines'),
    number('Quantity'),money('UnitPrice'),money('LineTotal'),text('Notes')
  ])
];
// Public example photos used solely for demonstration. Replace through the ImageUrl property.
export const demoCategories=[
  {Name:'Demo Burgers',SortOrder:1,ImageUrl:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',IsActive:true},
  {Name:'Demo Sides',SortOrder:2,ImageUrl:'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800',IsActive:true},
  {Name:'Demo Drinks',SortOrder:3,ImageUrl:'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800',IsActive:true},
  {Name:'Demo Desserts',SortOrder:4,ImageUrl:'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800',IsActive:true}
];
export const demoProducts=[
  {Name:'Demo Classic Burger',SKU:'MD-DEMO-BURGER-01',category:'Demo Burgers',DefaultPrice:6.99,Description:'Beef-style burger with lettuce and sauce',ImageUrl:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',IsActive:true},
  {Name:'Demo Crispy Chicken Burger',SKU:'MD-DEMO-BURGER-02',category:'Demo Burgers',DefaultPrice:7.49,Description:'Crispy chicken-style burger',ImageUrl:'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800',IsActive:true},
  {Name:'Demo Fries',SKU:'MD-DEMO-SIDE-01',category:'Demo Sides',DefaultPrice:2.49,Description:'Golden fries',ImageUrl:'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800',IsActive:true},
  {Name:'Demo Sparkling Drink',SKU:'MD-DEMO-DRINK-01',category:'Demo Drinks',DefaultPrice:1.99,Description:'Chilled sparkling soft drink',ImageUrl:'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800',IsActive:true},
  {Name:'Demo Coffee',SKU:'MD-DEMO-DRINK-02',category:'Demo Drinks',DefaultPrice:2.79,Description:'Freshly brewed coffee',ImageUrl:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800',IsActive:true},
  {Name:'Demo Ice Cream',SKU:'MD-DEMO-DESSERT-01',category:'Demo Desserts',DefaultPrice:3.49,Description:'Vanilla dessert',ImageUrl:'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800',IsActive:true}
];
