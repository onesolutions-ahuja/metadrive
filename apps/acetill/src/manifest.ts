/** Acetill is a tenant-installed transaction surface, NOT a second POS platform.
 * Core owns authentication, objects, permissions, components, flows, and data.
 * Only an authorised publisher promotes this contract into SQL app package rows.
 */
export const ACETILL = Object.freeze({
  apiName: 'Acetill',
  label: 'Acetill',
  version: 2,
  description: 'Independent POS transaction terminal using UNE Solutions MetaDrive',
  brandColor: '#1769D2',
  entryPage: 'AcetillRegister',
  pages: [
    {apiName:'AcetillRegister', title:'Register'},
    {apiName:'AcetillSale',title:'New Sale'},
    {apiName:'AcetillCheckout',title:'Checkout'},
    {apiName:'AcetillReceipt',title:'Receipt'}
  ],
  // References to shared standard tenant objects, never private duplicates.
  requiredObjects: ['Product','Cart','CartLine','Invoice','InvoiceLine'] as const,
  // Auth and access remain owned and enforced by MetaDrive, not Acetill.
  auth: 'metadrive-session',
  authorization: 'central-rbac',
  pageRuntime: 'metadrive-published',
  componentRegistry: 'metadrive-one',
  dataSource: 'metadrive-tenant-sql'
} as const);

export type AcetillManifest = typeof ACETILL;
