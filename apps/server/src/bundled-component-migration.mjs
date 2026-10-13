import { createHash } from 'node:crypto';

// Source fingerprints of the previously shipped, repository-owned kiosk bundle.
// These are Git blob SHA-1 identifiers for both files at commit
// 245e6c187de8089f2dfb5d604ac6711079d98108. This deliberately does not
// grant trust on API name alone or to any tenant-scoped custom component.
const legacyKioskSources = Object.freeze({
  jsx: '2e05c970500f6624d305748ac3bd0899eac32a62',
  css: '2e306e81ede52c22efc8850708dbd3d1d0216a35'
});

export function sourceGitBlobSha(source) {
  if (typeof source !== 'string') return '';
  return createHash('sha1').update('blob ' + Buffer.byteLength(source) + '\0').update(source).digest('hex');
}

/**
 * Only a global component with exact repository-owned source can be adopted
 * into the trusted registry. Changed, unknown or tenant-owned code is never
 * reclassified or overwritten. Independent collisions must be isolated.
 */
export function bundledLegacyMigrationDecision(legacy, apiName, bundledJsx, bundledCss) {
  if (!legacy || legacy.trustedBundled === true || legacy.tenantId != null
      || legacy.apiName?.toLowerCase() !== apiName?.toLowerCase()) return 'preserve';
  if (typeof legacy.jsxSource !== 'string' || typeof legacy.cssSource !== 'string') return 'preserve';
  if (legacy.jsxSource === bundledJsx && legacy.cssSource === bundledCss) return 'adopt-current';
  if (apiName === 'KioskOrderingExperience'
      && sourceGitBlobSha(legacy.jsxSource) === legacyKioskSources.jsx
      && sourceGitBlobSha(legacy.cssSource) === legacyKioskSources.css) return 'upgrade-historical';
  return 'preserve';
}
