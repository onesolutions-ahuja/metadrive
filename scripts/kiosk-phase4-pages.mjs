// Rebuilt Kiosk Page Builder metadata. Objects, Actions and Flows are not replaced.
const appId='MD_Commerce_Kiosk';
const navigate=(page)=>({actionType:'Navigate',navigationTargetType:'App Page',
 navigationAppId:appId,navigationPageApiName:page});
const flow=(name,inputs={},extra={})=>({actionType:'Flow',flowApiName:name,inputs,...extra});
const setPageState=(stateKey,value)=>({actionType:'PageState',stateKey,value});
const block=(id,apiName,label,region,properties={})=>({
 id,type:'Custom:'+apiName,label,visible:true,region,
 properties:{libraryComponentId:apiName,...properties}
});
const basketActions={
 load:flow('MD_Commerce_LoadBasket',{SessionKey:'$session'},{mutatesData:false}),
 remove:flow('MD_Commerce_RemoveLine',{SessionKey:'$session',LineId:'$event.lineId'}),
 submit:flow('MD_Commerce_SubmitBasket',{SessionKey:'$session'},{resetSessionOnSuccess:true}),
 confirmation:navigate('MD_Commerce_Confirmation'),
 openBasket:setPageState('basketOpen',true),
 closeBasket:setPageState('basketOpen',false)
};
export const commercePages=[
 {
  apiName:'MD_Commerce_Menu',label:'Kiosk Menu',targetObject:'Product__c',
  pageType:'App Page',layoutMode:'template',template:'header-main-sidebar',
  canvasWidth:1080,canvasHeight:1920,status:'Active',devices:['Desktop','Phone'],
  activationAssignments:[],
  components:[
   block('menu-nav','MD_CommerceNavigationV2','Editable category rail','header',{
    objectApiName:'ProductCategory__c',title:'MENU',nameField:'Name',imageField:'ImageUrl',
    brandLabel:'YOUR BRAND',brandLogoUrl:'',accentColor:'#ed002d',backgroundColor:'#fff',fillRegion:true,
    standalonePresentation:true,presentationLayout:'rail-checkout',presentationVariant:'portrait',
    actionFlows:{selectCategory:setPageState('selectedCategory','$event')}
   }),
   block('menu-products','MD_CommerceProductGridV2','Editable product grid and filters','main',{
    objectApiName:'Product__c',presentationVariant:'portrait',title:'MENU',
    columns:3,currencySymbol:'£',nameField:'Name',priceField:'DefaultPrice',
    imageField:'ImageUrl',categoryField:'CategoryId',filterField:'Subcategory',
    bestsellerField:'IsBestseller',featuredBorderColor:'#92b000',chipColor:'#ed002d',
    imageHeight:168,primaryButtonLabel:'CUSTOMISE',accentColor:'#e4002b',
    actionFlows:{
     options:flow('MD_Commerce_ModifierCatalog',{ProductId:'$event.productId'},{mutatesData:false}),
     add:flow('MD_Commerce_AddProduct',{SessionKey:'$session',ProductId:'$event.productId',
      Quantity:'$event.quantity',Selections:'$event.selections'})
    }
   }),
   block('menu-basket','MD_CommerceBasketPanelV2','Editable bottom basket and order bar','sidebar',{
    objectApiName:'Order__c',presentationVariant:'portrait',
    title:'SHOW BASKET',accentColor:'#92b000',currencySymbol:'£',
    iframeMinHeight:84,actionFlows:basketActions
   })
  ]
 },
 {
  apiName:'MD_Commerce_Confirmation',label:'Kiosk Order Confirmation',
  targetObject:'Order__c',pageType:'App Page',layoutMode:'template',template:'one-region',
  canvasWidth:1080,canvasHeight:1920,status:'Active',devices:['Desktop','Phone'],
  activationAssignments:[],
  components:[
   block('order-confirmation','MD_CommerceStatusV2','Editable order confirmation','main',{
    title:'Order received',message:'Your order has been submitted.',
    accentColor:'#ed002d',actionFlows:{catalog:navigate('MD_Commerce_Menu')}
   })
  ]
 }
];
// Old basket is replaced by the menu's modal overlay; installer archives it as
// Draft until dependency-safe removal is supported by the central metadata API.
export const obsoleteCommercePages=['MD_Commerce_Basket','UNE_KIOSK'];
export const commerceApp={
 apiName:appId,label:'Order Kiosk',
 description:'Editable data-driven portrait self-service ordering interface.',
 navigationItems:['Product__c'],
 navigationPageApiNames:commercePages.map(page=>page.apiName),
 navigationOrder:commercePages.map(page=>({type:'App Page',apiName:page.apiName})),
 brandColor:'#ed002d',utilityItems:[]
};
