/** Adopt only byte-identical, global, unmodified trusted source bundles. */
export function bundledLegacyMigrationDecision(legacy, apiName, bundledJsx, bundledCss) {
  if (!legacy || legacy.trustedBundled === true || legacy.tenantId != null
      || legacy.apiName?.toLowerCase() !== apiName?.toLowerCase()) return 'preserve';
  if (typeof legacy.jsxSource !== 'string' || typeof legacy.cssSource !== 'string') return 'preserve';
  if (legacy.jsxSource === bundledJsx && legacy.cssSource === bundledCss) return 'adopt-current';
  return 'preserve';
}
