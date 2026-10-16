/** Phase 2 additive defaults: never infer confidential, RBAC, or historic records. */
export const safeEmptySettings = Object.freeze({
  autoNumberSequences: {},
  scheduleRetries: {},
  scheduleRuns: {},
  automationSettings: {}
});
export function planSafeDefaults(liveSettings) {
  const allowed = new Set(Object.keys(safeEmptySettings));
  return liveSettings.filter(row => allowed.has(row.setting_name) && row.payload == null)
    .map(row => ({tenantId:row.tenant_id, settingName:row.setting_name,
      payload:safeEmptySettings[row.setting_name]}));
}
export function assessCutover(rows) {
  const unresolved = Object.entries(rows).filter(([,value]) => value > 0).map(([key,value]) => key + ': ' + value);
  return {ready:unresolved.length === 0, unresolved};
}
