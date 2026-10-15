import {readFileSync} from 'node:fs';

// Core definitions are templates only. Optional business objects are not
// installed into every tenant merely because they exist in this catalog.
export function coreSeedDefinitions() {
  const metadata = JSON.parse(readFileSync(new URL('../../data/platform-metadata.json',import.meta.url),'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../../../web/src/custom-components/manifest.json',import.meta.url),'utf8'));
  const {users: _legacySampleUsers, ...accessTemplates}=metadata.accessControl??{};
  return {
    objectDefinitions: structuredClone(metadata.objects ?? []),
    flowDefinitions: structuredClone(metadata.flows ?? []),
    pageDefinitions: structuredClone(metadata.pages ?? []),
    accessControlTemplates: structuredClone(accessTemplates),
    sharedComponents: structuredClone(manifest.filter(c=>c.scope==='platform'))
  };
}

/**
 * Add only explicitly requested foundation objects to an already-created SQL
 * tenant. Defaults to no business objects. Does not create users, records,
 * credentials, optional apps, or permissions, and does not overwrite edits.
 * The caller commits the resulting metadata via the existing SQL write path.
 */
export function seedNewTenantCore(tenant, {objectApiNames=[]}={}) {
  if(!tenant || !Array.isArray(tenant.objects))throw Error('Core seeding requires an initialized tenant');
  if(!Array.isArray(objectApiNames))throw Error('Core object selection must be a list');
  const definitions=new Map(coreSeedDefinitions().objectDefinitions.map(o=>[o.apiName,o]));
  const objects=[...tenant.objects];
  for(const apiName of objectApiNames) {
    if(!definitions.has(apiName))throw Error('Unknown Core object definition');
    if(!objects.some(o=>o.apiName===apiName))objects.push(structuredClone(definitions.get(apiName)));
  }
  return objects.length===tenant.objects.length ? tenant : {...tenant,objects};
}
