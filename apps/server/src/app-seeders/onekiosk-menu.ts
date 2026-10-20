import type { PageRuntime } from '../system-files/page-runtime.js';

/**
 * OneKiosk first-page blueprint. All presentation is standard editable Page
 * Builder metadata: no kiosk-specific renderer, component or route.
 * Invoke through the tenant-aware application installer after resolving the
 * existing Product object and its field API names. Never overwrite user pages.
 */
export type KioskMenuPageDependencies = {
  productObjectApiName: string;
  nameFieldApiName: string;
  priceFieldApiName: string;
  imageFieldApiName?: string;
  categoryFieldApiName?: string;
  categoryObjectApiName?: string;
  categoryNameFieldApiName?: string;
  categoryImageFieldApiName?: string;
  categoryOrderFieldApiName?: string;
  categoryActiveFieldApiName?: string;
  productSortFieldApiName?: string;
  productDescriptionFieldApiName?: string;
  logoAssetUri?: string;
  promotionImageUri?: string;
};

const component = (
  id: string, api: string, label: string,
  x: number, y: number, width: number, height: number,
  properties: Record<string, unknown> = {}
) => ({
  id, type: `Custom:${api}`, label, region: 'main', visible: true,
  position: { x, y, width, height },
  properties
});

/** A metadata draft that stays editable in the normal Page Builder. */
export function kioskMenuDraft(deps: KioskMenuPageDependencies) {
  if (!deps.productObjectApiName || !deps.nameFieldApiName || !deps.priceFieldApiName) {
    throw new Error('Existing Product object and field mappings are required');
  }
  return {
    apiName: 'Kiosk_Menu',
    label: 'Kiosk Menu',
    targetObject: deps.productObjectApiName,
    pageType: 'App Page',
    layoutMode: 'free-canvas',
    canvasWidth: 1080,
    canvasHeight: 1920,
    status: 'Draft',
    devices: ['Desktop'],
    activationAssignments: [],
    components: [
      component('kiosk_logo',deps.logoAssetUri?'OneImage':'OneText','Kiosk branding',24,28,205,132,
        deps.logoAssetUri?{kind:'Image',src:deps.logoAssetUri,alt:'Restaurant logo',imageFit:'contain'}:
          {kind:'Text',text:'ONE KIOSK',fontSize:34,fontWeight:'800'}),
      component('kiosk_heading','OneText','Menu heading',266,56,780,88,
        {kind:'Text',text:'OUR MENU',fontSize:48,fontWeight:'800',textColor:'#171717'}),
      component('kiosk_subtitle','OneText','Menu introduction',266,145,620,50,
        {kind:'Text',text:'Choose your favourites',fontSize:22}),
      component('kiosk_offer','OneCard','Featured menu offer',265,280,785,230,
        {kind:'Card',title:'BUILD YOUR OWN BUCKET',subtitle:'Your favourites, your way',
          imageSrc:deps.promotionImageUri??'',imageAlt:'Featured food selection',
          imagePosition:'right',imageWidthPercent:46,imageFit:'contain',
          layoutContainer:true,theme:'light',accentColor:'#E4002B',radius:12}),
      component('kiosk_products','OneItemGrid','Menu products',263,555,785,1065,{
        kind:'ItemGrid',title:'',showHeading:false,objectApiName:deps.productObjectApiName,
        titleFieldApiName:deps.nameFieldApiName,priceFieldApiName:deps.priceFieldApiName,
        imageFieldApiName:deps.imageFieldApiName??'',
        categoryFieldApiName:deps.categoryFieldApiName??'',
        recordSortFieldApiName:deps.productSortFieldApiName??'',
        descriptionFieldApiName:deps.productDescriptionFieldApiName??'',
        currencyCode:'GBP',filterKey:'category',searchKey:'catalogue',
        selectionBehavior:'select',selectionFilterKey:'selectedProduct',
        desktopColumns:3,tabletColumns:2,mobileColumns:1,gap:12,
        imageHeight:175,imageFit:'contain',imageAspectRatio:'1/1',
        cardDensity:'image-focused',cardPadding:10,cardRadius:8,
        cardBackgroundColor:'#FFFFFF',cardBorderColor:'#EAEAEA',
        showImage:true,showPrice:true,showAddIcon:false
      }),
      component('kiosk_details','OneOverlay','Product details',263,625,785,100,{
        kind:'Overlay',title:'Product details',openOnFilterKey:'selectedProduct',
        hideTrigger:true,showSelectedRecord:true,objectApiName:deps.productObjectApiName,
        selectedTitleFieldApiName:deps.nameFieldApiName,
        selectedImageFieldApiName:deps.imageFieldApiName??'',
        selectedPriceFieldApiName:deps.priceFieldApiName,
        selectedDescriptionFieldApiName:deps.productDescriptionFieldApiName??'',
        confirmBehavior:'add',confirmLabel:'ADD TO ORDER',
        cartTargetKey:'kiosk_basket',currencyCode:'GBP',imageFit:'contain'
      }),
      component('kiosk_cart','OneShoppingCart','Bottom basket',263,1690,785,210,{
        kind:'ShoppingCart',viewMode:'basket',basketPresentation:'footer',
        basketTitle:'YOUR ORDER',checkoutLabel:'PLACE ORDER',totalLabel:'Total',
        nameFieldApiName:deps.nameFieldApiName,priceFieldApiName:deps.priceFieldApiName,
        cartTargetKey:'kiosk_basket',currencyCode:'GBP',showVatTotal:false,
        theme:'light',accentColor:'#8BAC12',radius:10
      }),
      ...(deps.categoryObjectApiName ? [
        component('kiosk_category_title','OneText','Navigation heading',20,188,212,60,
          {kind:'Text',text:'EXPLORE MENU',fontSize:20,fontWeight:'800'}),
        component('kiosk_categories','OneRepeater','Illustrated category navigation',
          16,260,222,1390,{
          kind:'Repeater',label:'',objectApiName:deps.categoryObjectApiName,
          recordTitleFieldApiName:deps.categoryNameFieldApiName||'Name',
          recordValueFieldApiName:'Id',
          recordImageFieldApiName:deps.categoryImageFieldApiName||'',
          recordSortFieldApiName:deps.categoryOrderFieldApiName||'',
          recordActiveFieldApiName:deps.categoryActiveFieldApiName||'',
          recordLayout:'tile',recordItemMinHeight:110,showAllItem:true,
          selectedItemBackgroundColor:'#E4002B',selectedItemTextColor:'#FFFFFF',
          showImage:true,imageFit:'contain',selectionFilterKey:'category',gap:10
        }),
        component('kiosk_subcategories','OneTabs','Subcategory filters',
          265,200,785,65,{
          kind:'Tabs',objectApiName:deps.categoryObjectApiName,dynamicTabs:true,
          categoryFieldApiName:deps.categoryNameFieldApiName||'Name',
          categoryValueFieldApiName:'Id',
          relatedFilterKey:'category',relatedFieldApiName:'ParentCategory',
          showPanel:false,tabStyle:'pill',showAllTab:true,wrapTabs:false,
          filterKey:'subcategory',accentColor:'#E4002B'
        })
      ] : [])
    ]
  };
}

/**
 * Safe opt-in seeding: create only if absent. Future installations must not
 * overwrite tenant edits. Page activation and navigation occur separately.
 */
export async function seedKioskMenuDraft(
  pages: PageRuntime, tenantId: string, deps: KioskMenuPageDependencies
) {
  try {
    return { created: false, page: await pages.metadata(tenantId, 'Kiosk_Menu') };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Page not found') throw error;
  }
  const draft = kioskMenuDraft(deps);
  return { created: true, page: await pages.save(tenantId, draft.apiName, draft) };
}
