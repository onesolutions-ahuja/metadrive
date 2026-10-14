import type {LibraryComponentMetadata} from './metadata';

export type ComponentSurface = LibraryComponentMetadata['surfaces'][number];

/** Resolve published components for each metadata-defined page, dashboard or Flow surface. */
export function findRegisteredComponent(
  components: readonly LibraryComponentMetadata[],
  apiName: unknown,
  surface: ComponentSurface
): LibraryComponentMetadata | undefined {
  if (typeof apiName !== 'string' || !apiName) return undefined;
  return components.find(definition =>
    definition.apiName === apiName &&
    definition.status !== 'Draft' &&
    definition.surfaces.includes(surface)
  );
}
