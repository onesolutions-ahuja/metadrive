// Phase 4 advanced record access policy. Run ONLY after ordinary tenant RBAC;
// restrictions narrow existing grants, and implicit/territory access must not
// grant an object or field permission which the subject does not hold.
const ident = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const obj = x => x && typeof x === 'object' && !Array.isArray(x);
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const operators = new Set(['eq','ne','in','notIn','isNull','notNull']);
function matching(condition, record) {
  if (!obj(condition) || !ident(condition.field) || !operators.has(condition.operator) ||
      !obj(record)) throw Error('Invalid restriction condition');
  const value = own(record,condition.field) ? record[condition.field] : null;
  const operand = condition.value;
  switch(condition.operator) {
    case 'eq': return value === operand;
    case 'ne': return value !== operand;
    case 'in':
    case 'notIn': {
      if (!Array.isArray(operand) || operand.length > 100 ||
          operand.some(v => !['string','number','boolean'].includes(typeof v) && v !== null))
        throw Error('Invalid restriction list');
      const found = operand.includes(value);
      return condition.operator === 'in' ? found : !found;
    }
    case 'isNull': return value == null;
    case 'notNull': return value != null;
  }
}
function applies(rule, context) {
  if (!obj(rule) || !ident(rule.tenantId) || !ident(rule.objectApiName) ||
      !['user','role','external','all'].includes(rule.subjectType) ||
      !Array.isArray(rule.conditions) || rule.conditions.length < 1 ||
      rule.conditions.length > 16 || !['all','any'].includes(rule.conditionLogic))
    throw Error('Invalid restriction rule');
  if (rule.tenantId !== context.tenantId || rule.objectApiName !== context.objectApiName)
    throw Error('Cross-tenant or cross-object restriction reference');
  if (rule.enabled !== true) return false;
  if (rule.subjectType === 'all') return true;
  if (rule.subjectType === 'external') return context.userType === 'external';
  if (!ident(rule.subjectId)) throw Error('Restriction subject invalid');
  return rule.subjectType === 'user' ? rule.subjectId === context.userId :
    context.roleIds.includes(rule.subjectId);
}
// No bearer identity fields can be sourced from an unverified request body.
export function decideAdvancedRecordAccess({
  context, record, ordinaryAuthorized, rules = [], implicit = [],
  territoryAssignments = [], maxHierarchyDepth = 8
}) {
  if (!obj(context) || !ident(context.tenantId) || !ident(context.userId) ||
      !ident(context.objectApiName) || !['read','edit','delete'].includes(context.operation) ||
      !['internal','external'].includes(context.userType) ||
      !Array.isArray(context.roleIds) || !context.roleIds.every(ident) ||
      !obj(record) || !ident(record.tenantId) || record.tenantId !== context.tenantId ||
      !Array.isArray(rules) || !Array.isArray(implicit) ||
      !Array.isArray(territoryAssignments) || !Number.isInteger(maxHierarchyDepth) ||
      maxHierarchyDepth < 0 || maxHierarchyDepth > 16)
    throw Error('Advanced access context is not trusted or tenant-scoped');
  if (ordinaryAuthorized !== true || context.objectPermission !== true)
    return Object.freeze({ allowed:false, reason:'base_permission_denied' });
  if (context.userType === 'external') {
    if (context.externalAccessEnabled !== true ||
        record.portalVisible !== true ||
        !ident(context.accountId) || record.accountId !== context.accountId)
      return Object.freeze({ allowed:false, reason:'external_default_deny' });
  }
  if (rules.length > 100) throw Error('Too many restriction rules');
  for(const rule of rules) {
    if (!applies(rule,context)) continue;
    const flags = rule.conditions.map(c => matching(c,record));
    const accepts = rule.conditionLogic === 'all' ? flags.every(Boolean) : flags.some(Boolean);
    if (!accepts) return Object.freeze({allowed:false,reason:'restriction_rule_denied'});
  }
  // This module cannot grant access: implicit and territory relationships are
  // evidence for the ordinary RBAC resolver, never a replacement for it.
  for (const relationship of implicit) {
    if (!obj(relationship) || relationship.tenantId !== context.tenantId ||
        !ident(relationship.parentId) || !ident(relationship.childId) ||
        !['parent_to_child','child_to_parent'].includes(relationship.direction))
      throw Error('Invalid implicit access relation');
  }
  for (const assignment of territoryAssignments) {
    if (!obj(assignment) || assignment.tenantId !== context.tenantId ||
        !ident(assignment.territoryId) || !ident(assignment.userId) ||
        !Number.isInteger(assignment.depth) || assignment.depth < 0 ||
        assignment.depth > maxHierarchyDepth)
      throw Error('Invalid territory assignment');
  }
  return Object.freeze({allowed:true,reason:'base_authorized_and_unrestricted'});
}
export function validateAdvancedSharingMetadata({tenantId,objectApiName,rules=[]}) {
  if (!ident(tenantId) || !ident(objectApiName) || !Array.isArray(rules)) throw Error('Invalid metadata context');
  const ids = new Set();
  for(const rule of rules) {
    if (!obj(rule) || !ident(rule.id) || ids.has(rule.id) ||
        rule.tenantId !== tenantId || rule.objectApiName !== objectApiName)
      throw Error('Duplicate or cross-tenant restriction rule');
    ids.add(rule.id);
    // Force validation even if disabled.
    applies({...rule,enabled:true},{tenantId,objectApiName,userId:'validation',
      roleIds:[],userType:'internal'});
    rule.conditions.forEach(c=>matching(c,{}));
  }
  return true;
}

/** Compute a record-level read/edit grant from verified server-resolved relations.
 * This never returns object/field permission and never grants delete privileges.
 * Callers must enforce their ordinary object CRUD/FLS checks independently.
 */
export function resolveAdvancedRecordGrant({
  tenantId, userId, operation, recordId, recordTerritoryId,
  readableParentRecordIds = [], implicitShares = [],
  territoryMemberships = [], territoryEdges = []
}) {
  if (!ident(tenantId) || !ident(userId) || !ident(recordId) ||
      !['read','edit'].includes(operation) ||
      !Array.isArray(readableParentRecordIds) || !Array.isArray(implicitShares) ||
      !Array.isArray(territoryMemberships) || !Array.isArray(territoryEdges) ||
      implicitShares.length > 10000 || territoryEdges.length > 10000 ||
      territoryMemberships.length > 10000 ||
      !readableParentRecordIds.every(ident))
    throw Error('Invalid server-resolved advanced record relationships');
  const readSet = new Set(readableParentRecordIds);
  for (const edge of implicitShares) {
    if (!obj(edge) || edge.tenantId !== tenantId || !ident(edge.parentId) ||
        !ident(edge.childId) || !['read','edit'].includes(edge.accessLevel))
      throw Error('Invalid implicit share');
    if (edge.childId === recordId && readSet.has(edge.parentId) &&
        (operation === 'read' || edge.accessLevel === 'edit'))
      return Object.freeze({granted:true,source:'implicit_parent'});
  }
  if (recordTerritoryId === undefined || recordTerritoryId === null)
    return Object.freeze({granted:false,source:null});
  if (!ident(recordTerritoryId)) throw Error('Invalid territory identifier');
  const ancestors = new Map();
  for (const edge of territoryEdges) {
    if (!obj(edge) || edge.tenantId !== tenantId ||
        !ident(edge.id) || (edge.parentId !== null && !ident(edge.parentId)) ||
        ancestors.has(edge.id)) throw Error('Invalid tenant territory hierarchy');
    ancestors.set(edge.id,edge.parentId);
  }
  const reachable = new Set();
  let node = recordTerritoryId;
  while(node && !reachable.has(node)) {
    reachable.add(node);
    node = ancestors.get(node);
  }
  if(node) throw Error('Cyclic territory hierarchy');
  for(const member of territoryMemberships) {
    if (!obj(member) || member.tenantId !== tenantId ||
        !ident(member.userId) || !ident(member.territoryId) ||
        !['read','edit'].includes(member.accessLevel) ||
        typeof member.includeSubordinates !== 'boolean')
      throw Error('Invalid territory grant');
    const matches = member.territoryId === recordTerritoryId ||
      (member.includeSubordinates && reachable.has(member.territoryId));
    if(member.userId === userId && matches &&
       (operation === 'read' || member.accessLevel === 'edit'))
      return Object.freeze({granted:true,source:'territory'});
  }
  return Object.freeze({granted:false,source:null});
}
