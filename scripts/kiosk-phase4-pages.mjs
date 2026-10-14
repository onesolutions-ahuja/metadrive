// Composable App Pages — every visual region is an independent registered component,
// with its own typed Page Builder properties and declarative Flow/navigation bindings.
const appId='MD_Commerce_Kiosk';
const navigation=(apiName)=>({actionType:'Navigate',navigationTargetType:'App Page',
 navigationAppId:appId,navigationPageApiName:apiName});
const flow=(flowApiName,inputs={},extra={})=>({actionType:'Flow',flowApiName,inputs,...extra});
const block=(id,apiName,label,region,properties={})=>({
 id,type:'Custom:'+apiName,label,visible:true,region,
 properties:{libraryComponentId:apiName,...properties}
});
const actionsNav={
 catalog:navigation('MD_Commerce_Menu'),
 basket:navigation('MD_Commerce_Basket')
};
const nav=(id)=>block(id,'MD_CommerceNavigation','Menu and basket navigation','header',{
 title:'Order kiosk',subtitle:'Fresh food made for you',actionFlows:actionsNav
});
const basketActions={
 load:flow('MD_Commerce_LoadBasket',{SessionKey:'$session'}),
 remove:flow('MD_Commerce_RemoveLine',{SessionKey:'$session',LineId:'$event.lineId'}),
 submit:flow('MD_Commerce_SubmitBasket',{SessionKey:'$session'},{resetSessionOnSuccess:true}),
 confirmation:navigation('MD_Commerce_Confirmation')
};
export const commercePages=[
 {
  apiName:'MD_Commerce_Menu',label:'Kiosk Menu',targetObject:'Product__c',
  pageType:'App Page',layoutMode:'template',template:'header-main-sidebar',
  canvasWidth:1440,canvasHeight:900,status:'Active',devices:['Desktop','Phone'],
  activationAssignments:[],
  components:[
   nav('menu-nav'),
   block('menu-products','MD_CommerceProductGrid','Product Cards and Meal Customisation','main',{
    objectApiName:'Product__c',title:'Explore the menu',columns:3,currencySymbol:'£',
    priceField:'DefaultPrice',imageField:'ImageUrl',primaryButtonLabel:'Customise',
    actionFlows:{
     options:flow('MD_Commerce_ModifierCatalog',{ProductId:'$event.productId'}),
     add:flow('MD_Commerce_AddProduct',{
      SessionKey:'$session',ProductId:'$event.productId',
      Quantity:'$event.quantity',Selections:'$event.selections'
     })
    }
   }),
   block('menu-basket','MD_CommerceBasketPanel','Live Basket Summary','sidebar',{
    title:'Your basket',objectApiName:'Order__c',actionFlows:basketActions
   })
  ]
 },
 {
  apiName:'MD_Commerce_Basket',label:'Kiosk Basket',targetObject:'Order__c',
  pageType:'App Page',layoutMode:'template',template:'header-main',
  canvasWidth:1100,canvasHeight:900,status:'Active',devices:['Desktop','Phone'],
  activationAssignments:[],
  components:[
   nav('basket-nav'),
   block('basket-lines','MD_CommerceBasketPanel','Review Basket and Place Order','main',{
    title:'Review your order',objectApiName:'Order__c',actionFlows:basketActions
   })
  ]
 },
 {
  apiName:'MD_Commerce_Confirmation',label:'Order Confirmation',targetObject:'Order__c',
  pageType:'App Page',layoutMode:'template',template:'one-region',
  canvasWidth:900,canvasHeight:650,status:'Active',devices:['Desktop','Phone'],
  activationAssignments:[],
  components:[
   block('order-confirmation','MD_CommerceStatus','Order Placed','main',{
    title:'Order received',message:'Your order was submitted. Payment is handled separately.',
    actionFlows:{catalog:actionsNav.catalog}
   })
  ]
 }
];
export const commerceApp={
 apiName:appId,label:'Order Kiosk',description:'Editable metadata-driven ordering experience built with shared components and Flows.',
 navigationItems:['Product__c'],
 navigationPageApiNames:commercePages.map(p=>p.apiName),
 navigationOrder:[
  ...commercePages.map(p=>({type:'App Page',apiName:p.apiName})),
  {type:'Object',apiName:'Product__c'}
 ],
 brandColor:'#103e51',utilityItems:[]
};
