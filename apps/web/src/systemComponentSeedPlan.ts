/** Phase 2g: additive seed/permission contract for metadata-driven platform components.
 * No privilege is granted by client metadata; server OneEngine RBAC remains authoritative.
 */
export type SystemComponentSeed={apiName:string;scope:'platform-system';surfaces:readonly string[];version:number};
export type SeedPlan={install:SystemComponentSeed[];skip:string[];errors:string[]};
const name=/^[A-Za-z][A-Za-z0-9_]*$/;
export function planSystemComponentSeeds(
  candidates:readonly SystemComponentSeed[],installed:readonly SystemComponentSeed[],
  canManageSystemMetadata:boolean
):SeedPlan{
  const result:SeedPlan={install:[],skip:[],errors:[]};
  if(!canManageSystemMetadata){result.errors.push('OneEngine system metadata permission required');return result;}
  const known=new Map(installed.map(item=>[item.apiName,item]));
  const visited=new Set<string>();
  for(const item of candidates){
    if(!name.test(item.apiName)||item.scope!=='platform-system'||!Number.isSafeInteger(item.version)
      ||item.version<1||!Array.isArray(item.surfaces)||!item.surfaces.length
      ||item.surfaces.some(surface=>!['page','dashboard','flow','platform'].includes(surface))){
      result.errors.push('Invalid system component metadata: '+item.apiName);continue;
    }
    if(visited.has(item.apiName)){result.errors.push('Duplicate system component: '+item.apiName);continue;}
    visited.add(item.apiName);
    const old=known.get(item.apiName);
    if(old&&old.scope!=='platform-system'){result.errors.push('Protected component name collision: '+item.apiName);continue;}
    if(old&&old.version>=item.version){result.skip.push(item.apiName);continue;}
    result.install.push(item);
  }
  return result.errors.length?{install:[],skip:result.skip,errors:result.errors}:result;
}
