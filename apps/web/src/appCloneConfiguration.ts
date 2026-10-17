import { reconcileNavigationOrder } from './appNavigation';
import { suggestAppApiName } from './appSetupReadiness';
import type { LightningAppMetadata } from './metadata';

/** A copy is a new tenant-owned app, never another AppExchange installation. */
export function cloneAppConfiguration(
  source: LightningAppMetadata, existing: readonly Pick<LightningAppMetadata, 'apiName'>[]
): LightningAppMetadata {
  const copy = { ...source };
  // Installation ownership, entitlements and licences must never be inherited.
  delete copy.installationAppKey;
  const label = source.label + ' Copy';
  return {
    ...copy,
    apiName: suggestAppApiName(label, existing),
    label,
    navigationItems: [...source.navigationItems],
    navigationPageApiNames: [...source.navigationPageApiNames],
    navigationOrder: reconcileNavigationOrder(
      source.navigationItems, source.navigationPageApiNames, source.navigationOrder
    ),
    utilityItems: [...source.utilityItems]
  };
}
