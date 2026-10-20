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
      component('kiosk_brand', 'OneText', 'Brand heading', 20, 22, 160, 94,
        { text: 'ONE KIOSK' }),
      component('kiosk_categories', 'OneNavigation', 'Category navigation', 12, 140, 176, 1390,
        { kind: 'Navigation', orientation: 'vertical' }),
      component('kiosk_heading', 'OneText', 'Menu heading', 224, 40, 816, 130,
        { text: 'OUR MENU' }),
      component('kiosk_products', 'OneItemGrid', 'Menu products', 220, 220, 836, 1430, {
        kind: 'ItemGrid',
        title: '',
        titleFieldApiName: deps.nameFieldApiName,
        priceFieldApiName: deps.priceFieldApiName,
        imageFieldApiName: deps.imageFieldApiName ?? '',
        categoryFieldApiName: deps.categoryFieldApiName ?? '',
        currencyCode: 'GBP',
        filterKey: 'category',
        searchKey: 'catalogue',
        selectionBehavior: 'select',
        selectionFilterKey: 'selectedProduct'
      }),
      component('kiosk_cart', 'OneShoppingCart', 'Basket', 220, 1670, 836, 230, {
        kind: 'ShoppingCart', viewMode: 'basket', title: 'Your Order',
        currencyCode: 'GBP', showVatTotal: false
      })
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
