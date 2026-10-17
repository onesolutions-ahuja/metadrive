/** Retired metadata API names prohibited from future seeding/re-registration.
 * Historical physical tables can remain archived until a separate verified drop.
 * Keep this single tombstone catalog for all automatic seed/install paths.
 * User is deliberately not listed: its canonical identity metadata remains
 * valid even when the duplicate generic physical User table was removed.
 */
export const retiredObjectApiNames = Object.freeze([
  'Campaign',
  'Product', // Consolidated into Product__c; do not recreate by seeds or installers.
  'Global_Settings__c',
  'KioskSettings__c',
  'OrderLineModifier__c',
  'Tenant__c',
  'TillSession__c',
  'ModifierGroup__c',
  'ModifierOption__c',
  'ProductCategory__c',
  'SaleItem__c'
]);
export const retiredObjectNames = new Set(retiredObjectApiNames);
export const isRetiredObject = apiName => retiredObjectNames.has(apiName);
