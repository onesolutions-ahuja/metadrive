import {mergeCoreMetadata} from './core.mjs';

const SHARED_COLLECTIONS = ['objects','pages','flows','apps','reports','dashboards',
  'platformEvents','approvalProcesses','connectorDefinitions','libraryComponents'];
const KEY_FIELDS = ['apiName','componentApiName','name'];

/**
 * A shared dependency is metadata only, never tenant data or credentials.
 * Existing definitions are authoritative, including owner-adjusted permissions.
 */
export function mergeSharedDependency(tenant, dependency) {
  if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency))
    throw Error('Shared dependency definition required');
  const forbidden = ['records','users','accessControl','namedCredentials',
    'integrationConnections','refreshSessions','securityAudit','recordShares'];
  for (const key of forbidden)
    if (Object.hasOwn(dependency,key))
      throw Error('Shared dependency may not seed tenant business/security state: ' + key);
  const result = mergeCoreMetadata(tenant,{
    objects:dependency.objects??[],pages:dependency.pages??[],flows:dependency.flows??[]});
  for (const name of SHARED_COLLECTIONS.filter(name=>!['objects','pages','flows'].includes(name))) {
    const existing = result[name]??[];
    if (!Array.isArray(existing) || !Array.isArray(dependency[name]??[]))
      throw Error('Shared metadata collection must be an array: '+name);
    const seen = new Set(existing.map(item=>KEY_FIELDS.map(key=>item?.[key]).find(Boolean)).filter(Boolean));
    const added=[];
    for(const item of dependency[name]??[]) {
      const id=KEY_FIELDS.map(key=>item?.[key]).find(value=>typeof value==='string'&&value.trim());
      if(!id)throw Error('Shared '+name+' definition requires stable API identity');
      if(seen.has(id))continue;
      seen.add(id);added.push(structuredClone(item));
    }
    result[name]=[...existing,...added];
  }
  return result;
}
