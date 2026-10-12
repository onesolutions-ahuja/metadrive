export type AdvancedRestrictionRule = {
  id:string; tenantId:string; objectApiName:string; enabled:boolean;
  subjectType:'all'|'user'|'role'|'external'; subjectId?:string;
  conditionLogic:'all'|'any';
  conditions: {field:string;operator:'eq'|'ne'|'in'|'notIn'|'isNull'|'notNull';value?:unknown}[];
};
export type AdvancedRecordContext = {
  tenantId:string; userId:string; objectApiName:string;
  operation:'read'|'edit'|'delete'; userType:'internal'|'external';
  roleIds:string[]; objectPermission:boolean;
  externalAccessEnabled?:boolean; accountId?:string;
};
export function decideAdvancedRecordAccess(args:{
  context:AdvancedRecordContext;
  record:Record<string,unknown>; ordinaryAuthorized:boolean;
  rules?:AdvancedRestrictionRule[];
  implicit?:unknown[];territoryAssignments?:unknown[];
  maxHierarchyDepth?:number;
}): Readonly<{allowed:boolean;reason:string}>;
export function validateAdvancedSharingMetadata(args:{
  tenantId:string;objectApiName:string;rules?:AdvancedRestrictionRule[];
}):boolean;
export function resolveAdvancedRecordGrant(args:{
  tenantId:string;userId:string;operation:'read'|'edit';recordId:string;
  recordTerritoryId?:string|null;readableParentRecordIds?:string[];
  implicitShares?:Array<{tenantId:string;parentId:string;childId:string;accessLevel:'read'|'edit'}>;
  territoryMemberships?:Array<{
    tenantId:string;userId:string;territoryId:string;
    accessLevel:'read'|'edit';includeSubordinates:boolean
  }>;
  territoryEdges?:Array<{tenantId:string;id:string;parentId:string|null}>;
}):Readonly<{granted:boolean;source:'implicit_parent'|'territory'|null}>;
