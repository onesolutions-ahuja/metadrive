/** Retired metadata API names whose legacy SQL tables have been removed.
 * Keep this single tombstone catalog for all automatic seed/install paths.
 * User is deliberately not listed: its canonical identity metadata remains
 * valid even when the duplicate generic physical User table was removed.
 */
export const retiredObjectApiNames = Object.freeze([
  'Campaign',
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
