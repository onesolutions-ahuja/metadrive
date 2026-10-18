import type {SqlPersistence} from './sql-persistence.js';
import {RbacEngine, type PermissionCheck} from './rbac-engine.js';

/** Session capabilities are derived exclusively from the shared OneEngine RBAC evaluator. */
const capabilities:readonly (PermissionCheck&{capability:string})[]=[
  {resource:'ObjectDefinition',action:'read',capability:'metadata:read'},
  {resource:'ObjectDefinition',action:'create',capability:'metadata:write'},
  {resource:'Security',action:'read',capability:'security:read'},
  {resource:'Security',action:'manage',capability:'security:manage'},
  {resource:'Tenant',action:'manage',capability:'platform:tenants:manage'},
  {resource:'Flow',action:'execute',capability:'flows:run'},
  {resource:'FlowDefinition',action:'manage',capability:'flows:manage'},
  {resource:'Licence',action:'manage',capability:'licence:manage'}
];
export async function sessionMetadata(db:SqlPersistence,tenantId:string,userId:string) {
  const rights=await new RbacEngine(db).allowedMany(tenantId,userId,capabilities);
  const permissions=capabilities.filter((_,i)=>rights[i]).map(c=>c.capability);
  return {user:{
    id:userId,userId,tenantId,profileId:'',permissions,
    fieldAccess:{} as Record<string,{read:boolean;edit:boolean}>,
    recordTypeAccess:{} as Record<string,boolean>
  }};
}
