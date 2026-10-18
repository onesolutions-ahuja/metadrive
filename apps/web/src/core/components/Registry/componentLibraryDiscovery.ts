import type { LibraryComponentMetadata } from '../../metadata/Definitions/metadata';

export const oneLibraryName = 'One-';

/** Display names can change without invalidating persisted API references. */
export function oneComponentLabel(component: Pick<LibraryComponentMetadata, 'label' | 'apiName'>): string {
  const label = component.label.trim() || component.apiName;
  return `One-${label.replace(/^One(?:[-\s]+|(?=[A-Z]))/, '')}`;
}

/** Compatibility entries stay resolvable, but are not offered for new placements.
 * Only reviewed bundled aliases are consolidated; tenant components retain their identity. */
const bundledAliases: Readonly<Record<string, string>> = { ChatterInbox: 'OneConversation' };

export function registeredComponentDefinitions(
  components: readonly LibraryComponentMetadata[],
  surface?: LibraryComponentMetadata['surfaces'][number]
): LibraryComponentMetadata[] {
  const definitions = new Map<string, LibraryComponentMetadata>();
  for (const component of components) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(component.apiName) ||
        (surface && (component.status === 'Draft' || !component.surfaces?.includes(surface)))) continue;
    const existing = definitions.get(component.apiName);
    // Prefer the published definition, then the newest revision of the same identity.
    if (!existing || (existing.status === 'Draft' && component.status !== 'Draft') ||
        ((existing.status === 'Draft') === (component.status === 'Draft') && component.version > existing.version)) {
      definitions.set(component.apiName, component);
    }
  }
  return [...definitions.values()];
}

export function uniqueLibraryComponents(
  components: readonly LibraryComponentMetadata[],
  surface?: LibraryComponentMetadata['surfaces'][number]
): LibraryComponentMetadata[] {
  const catalog = registeredComponentDefinitions(components, surface);
  const definitions = new Map(catalog.map(component => [component.apiName, component]));
  return catalog.filter(component => {
    const canonical = definitions.get(bundledAliases[component.apiName]);
    return !(component.trustedBundled && canonical?.trustedBundled && canonical.status !== 'Draft' &&
      (component.surfaces ?? []).every(item => canonical.surfaces.includes(item)));
  });
}

export function libraryComponentLabel(component: LibraryComponentMetadata): string {
  return component.scope === 'platform-system' ? component.label : oneComponentLabel(component);
}
