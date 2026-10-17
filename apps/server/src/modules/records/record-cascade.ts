import type { Principal } from '../../auth.js';

import type { RuntimeRecord, ObjectMetadata, FlowDebugTraceEntry } from '../../index.js';
import { stampRecordAuditFields } from './record-actions.js';
import type { createRecordTriggerHandlers } from '../flows/record-trigger-handlers.js';
import type { createCoreRecordAccess } from '../../core/security/record-access.js';

export function createRecordCascadeRuntime(deps: {
 getUsers: () => LocalUser[];
 effectivePermissions: (user: LocalUser, tenant: TenantData) => string[];
 hasRecordAccess: ReturnType<typeof createCoreRecordAccess>['hasRecordAccess'];
 assertFieldEditPermissions: ReturnType<typeof createCoreRecordAccess>['assertFieldEditPermissions'];
 runRecordTriggeredFlows: ReturnType<typeof createRecordTriggerHandlers>['runRecordTriggeredFlows'];
 appendFieldHistory: (tenant: TenantData, object: ObjectMetadata, previous: RuntimeRecord, updated: RuntimeRecord, userId: string) => void;
}) {
 const {getUsers, effectivePermissions, hasRecordAccess, assertFieldEditPermissions,
 runRecordTriggeredFlows, appendFieldHistory} = deps;
async function deleteRecordCascade(
  tenantId: string,
  tenant: TenantData,
  userId: string,
  objectName: string,
  record: RuntimeRecord,
  depth = 0,
  debugExecution = false,
  debugTrace: FlowDebugTraceEntry[] = [],
  rollbackSnapshot?: TenantData
): Promise<void> {
  if (depth > 10) throw new Error('Relationship cascade depth exceeded the 10-level limit.');
  const user = getUsers().find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
  if (!user) throw new Error('The user initiating this deletion is no longer active.');
  const principal: Principal = {
    userId: user.id, tenantId, email: user.email, roles: [user.role], permissions: effectivePermissions(user, tenant)
  };
  if (!hasRecordAccess(principal, tenant, objectName, record, 'Delete')) {
    throw new Error(`Missing record-level delete access for "${objectName}" record "${record.Id}".`);
  }
  await runRecordTriggeredFlows(
    tenantId, tenant, userId, objectName, 'deleted', record, record, depth, false, debugExecution, debugTrace, rollbackSnapshot
  );
  for (const childObject of tenant.objects) {
    for (const field of childObject.fields) {
      if (!field.relationship || field.relationship.targetObject !== objectName) continue;
      const children = (tenant.records[childObject.apiName] ?? []).filter((item) => item[field.apiName] === record.Id);
      if (!children.length) continue;
      if (field.relationship.type === 'Master-Detail') {
        for (const child of children) {
          await deleteRecordCascade(
            tenantId, tenant, userId, childObject.apiName, child, depth + 1, debugExecution, debugTrace, rollbackSnapshot
          );
        }
      } else {
        if (field.relationship.deleteBehavior === 'Restrict') {
          throw new Error(`Cannot delete this record while lookup "${field.relationship.relationshipName}" (${childObject.apiName}.${field.apiName}) has related records.`);
        }
        if (field.required) throw new Error(`Cannot delete this record while required lookup "${childObject.apiName}.${field.apiName}" is populated.`);
        for (const child of children) {
          if (!hasRecordAccess(principal, tenant, childObject.apiName, child, 'Edit')) {
            throw new Error(`Missing record-level edit access to clear "${childObject.apiName}.${field.apiName}" on child record "${child.Id}".`);
          }
          assertFieldEditPermissions(principal, tenant, childObject, { [field.apiName]: null });
        }
        const childIds = new Set(children.map((child) => child.Id));
        const now = new Date().toISOString();
        tenant.records[childObject.apiName] = (tenant.records[childObject.apiName] ?? []).map((child) => {
          if (!childIds.has(child.Id)) return child;
          const updated = stampRecordAuditFields({ ...child, [field.apiName]: null, LastModifiedDate: now }, userId, now, child);
          appendFieldHistory(tenant, childObject, child, updated, userId);
          return updated;
        });
        for (const child of children) {
          const updated = tenant.records[childObject.apiName].find((item) => item.Id === child.Id);
          if (updated) {
            await runRecordTriggeredFlows(
              tenantId, tenant, userId, childObject.apiName, 'updated', updated, child,
              depth + 1, false, debugExecution, debugTrace, rollbackSnapshot
            );
          }
        }
      }
    }
  }
  tenant.records[objectName] = (tenant.records[objectName] ?? []).filter((item) => item.Id !== record.Id);
  tenant.recordShares = tenant.recordShares.filter((share) =>
    share.objectApiName !== objectName || share.recordId !== record.Id);
  if (objectName === 'Contact') tenant.campaignMembers = tenant.campaignMembers.filter((member) => member.contactId !== record.Id);
}

 return { deleteRecordCascade };
}
