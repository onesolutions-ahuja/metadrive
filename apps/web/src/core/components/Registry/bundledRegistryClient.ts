import type { LibraryComponentMetadata } from '../../metadata/Definitions/metadata';

export type SqlRegisteredComponent = {
  apiName:string;
  rendererKey:string;
};

/** Only SQL-enabled, explicitly bundled definitions acquire trusted runtime assets.
 * The lightweight index is loaded after authentication, not during public startup. */
export async function resolveSqlComponentLibrary(
  registered: readonly SqlRegisteredComponent[],
  baseUrl: string = import.meta.env.BASE_URL
): Promise<LibraryComponentMetadata[]> {
  const authorised = registered.filter(item => item.rendererKey === 'one-bundled:' + item.apiName);
  if (!authorised.length) return [];
  const response = await fetch(`${baseUrl}component-library/catalog-index.json`,{cache:'no-cache'});
  if (!response.ok) throw Error('Bundled component index unavailable');
  const payload:unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('components' in payload) ||
    !Array.isArray(payload.components)) throw Error('Invalid bundled component index');
  const indexed = new Map<string, LibraryComponentMetadata>();
  for (const raw of payload.components) {
    if (!raw || typeof raw.apiName !== 'string' || !Array.isArray(raw.surfaces) ||
      typeof raw.version !== 'number') continue;
    indexed.set(raw.apiName, {
      ...raw, description:raw.description ?? '', jsxSource:'',cssSource:'',
      compiledJs:'',scopedCss:'',updatedAt:'',status:'Published',
      trustedBundled:true
    } as LibraryComponentMetadata);
  }
  return authorised.map(item => {
    const definition = indexed.get(item.apiName);
    if (!definition) throw Error('SQL component missing from reviewed bundle: ' + item.apiName);
    return definition;
  });
}
