import {createHash} from 'node:crypto';

/** Build a content-addressed read-only projection of the same metadata that
 * existing RBAC-gated endpoints are permitted to expose. The caller must be
 * authenticated and require metadata:read before invoking this function.
 */
export function createAuthorizedMetadataPublication({
 tenantId,userId,objects,pages,apps,components
}){
 if(!tenantId||!userId)throw Error('Authenticated metadata identity required');
 const content={pages,apps,objects,components};
 if(!Object.values(content).every(Array.isArray))throw Error('Incomplete metadata publication');
 const digest=createHash('sha256').update(JSON.stringify(content)).digest('hex');
 return {
  content,
  publication:{
   revision:{version:1,publishedAt:Date.now(),digest},
   verifiedDigest:digest,
   minimumVersion:1
  }
 };
}
