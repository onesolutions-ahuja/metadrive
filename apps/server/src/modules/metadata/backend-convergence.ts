/** Phase 6: authoritative convergence contract for existing backend domains.
 * This inventories the shared engines; it does not replace request-time RBAC.
 */
export const backendDomains=[
 {id:'objects',engine:'modules/objects/routes',resource:'Object',tenantScoped:true},
 {id:'records',engine:'modules/records/routes',resource:'Record',tenantScoped:true},
 {id:'actions',engine:'shared-action-runtime',resource:'Action',tenantScoped:true},
 {id:'flows',engine:'shared-flow-runtime',resource:'Flow',tenantScoped:true},
 {id:'scheduler',engine:'shared-flow-scheduler',resource:'Flow',tenantScoped:true},
 {id:'components',engine:'component-metadata-runtime',resource:'Component',tenantScoped:true},
 {id:'pages',engine:'modules/pages/page-assignment',resource:'Page',tenantScoped:true},
 {id:'packages',engine:'installable-app-packages',resource:'Package',tenantScoped:true}
] as const;
export type BackendDomainId=typeof backendDomains[number]['id'];
export type TenantResourceContext={
 tenantId:string;principalTenantId:string;principalId:string;
 grants:ReadonlySet<string>;requiredPermission:string;
};
export function assertTenantResourceAccess(context:TenantResourceContext){
 if(!context.tenantId||!context.principalTenantId||!context.principalId)
  throw Error('Authenticated tenant context required');
 if(context.tenantId!==context.principalTenantId)
  throw Error('Cross-tenant metadata access denied');
 if(!context.requiredPermission||!context.grants.has(context.requiredPermission))
  throw Error('Metadata permission denied');
}
export type RevisionWrite={expectedRevision:number;currentRevision:number;nextRevision:number};
export function assertMetadataRevisionWrite(input:RevisionWrite):void{
 if(![input.expectedRevision,input.currentRevision,input.nextRevision].every(Number.isSafeInteger))
  throw Error('Invalid metadata revision');
 if(input.expectedRevision!==input.currentRevision||input.nextRevision!==input.currentRevision+1)
  throw Error('Concurrent metadata modification');
}
export function validateBackendDomainCatalog(){
 const ids=new Set<string>();
 for(const domain of backendDomains){
  if(ids.has(domain.id)||!domain.tenantScoped||!domain.engine||!domain.resource)
   throw Error('Invalid backend domain metadata');
  ids.add(domain.id);
 }
 return ids.size;
}
