import type { Principal } from '../../auth.js';

import type { FlowMetadata, FlowRuntimeContext } from '../../index.js';
import type { createCoreRecordAccess } from '../../core/security/record-access.js';
import { chatterPostSchema, customNotificationSchema, approvalRequestSchema } from '../../core/metadata/shared-data-schemas.js';
import { randomUUID } from 'node:crypto';

type PermissionRuntime = ReturnType<typeof createCoreRecordAccess>;
/** Flow actions share central OneEngine RBAC and tenant-owned metadata records. */
export function createFlowActionRuntime(deps: {
 getUsers: () => LocalUser[];
 principalForUser: (user: LocalUser, tenant: TenantData) => Principal;
 hasObjectPermission: PermissionRuntime['hasObjectPermission'];
 hasRecordAccess: PermissionRuntime['hasRecordAccess'];
 effectivePermissions: (user: LocalUser, tenant: TenantData) => string[];
 resolveFlowTemplate: (value: string, context: FlowRuntimeContext) => string;
}) {
 const { getUsers, principalForUser, hasObjectPermission, hasRecordAccess,
 effectivePermissions, resolveFlowTemplate } = deps;
function performPostToChatter(
  tenantId: string,
  tenant: TenantData,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): void {
  const runningUser = getUsers().find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser) throw new Error('The running user is no longer active.');
  const principal = principalForUser(runningUser, tenant);
  const objectApiName = typeof config.objectApiName === 'string' ? config.objectApiName : '';
  const object = tenant.objects.find((candidate) => candidate.apiName === objectApiName);
  if (!object) throw new Error(`Post to Chatter "${elementLabel}" references an unavailable object.`);
  if (!object.settings?.allowInChatter) {
    throw new Error(`Chatter is disabled for object "${object.label}".`);
  }
  if (!hasObjectPermission(principal, tenant, objectApiName, 'edit')) {
    throw new Error(`The running user does not have edit permission for object "${objectApiName}".`);
  }
  const recordId = resolveFlowTemplate(String(config.recordId ?? ''), context).trim();
  const record = (tenant.records[objectApiName] ?? []).find((candidate) => candidate.Id === recordId);
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) {
    throw new Error(`Post to Chatter "${elementLabel}" requires edit access to its target record.`);
  }
  const body = resolveFlowTemplate(String(config.message ?? ''), context);
  const post = chatterPostSchema.parse({
    id: randomUUID(),
    objectApiName,
    recordId,
    body,
    createdBy: runningUser.id,
    createdByName: runningUser.name,
    createdAt: new Date().toISOString(),
    comments: []
  });
  tenant.chatterPosts.push(post);
}

function performCustomNotification(
  tenantId: string,
  tenant: TenantData,
  flow: FlowMetadata,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): void {
  const runningUser = getUsers().find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!runningUser || !effectivePermissions(runningUser, tenant).includes('notifications:send')) {
    throw new Error('The running user does not have permission to send custom notifications.');
  }
  const recipientText = resolveFlowTemplate(String(config.recipientIds ?? ''), context);
  const recipientIds = [...new Set(recipientText.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean))];
  if (!recipientIds.length) throw new Error(`Custom Notification "${elementLabel}" requires at least one recipient user ID.`);
  const recipients = recipientIds.map((recipientId) => getUsers().find((user) =>
    user.id === recipientId && user.tenantId === tenantId && !user.disabled));
  const missingRecipientIndex = recipients.findIndex((recipient) => !recipient);
  if (missingRecipientIndex >= 0) {
    throw new Error(`Custom Notification "${elementLabel}" recipient "${recipientIds[missingRecipientIndex]}" is not an active user in this tenant.`);
  }
  const title = resolveFlowTemplate(String(config.title ?? ''), context);
  const body = resolveFlowTemplate(String(config.messageBody ?? ''), context);
  const createdAt = new Date().toISOString();
  const notifications = recipients.map((recipient) => {
    if (!recipient) throw new Error(`Custom Notification "${elementLabel}" contains an invalid recipient.`);
    return customNotificationSchema.parse({
      id: randomUUID(),
      recipientId: recipient.id,
      title,
      body,
      flowApiName: flow.apiName,
      sentBy: runningUser.id,
      createdAt,
      readAt: null
    });
  });
  tenant.notifications.push(...notifications);
}

function performSubmitForApproval(
  tenantId: string,
  tenant: TenantData,
  flow: FlowMetadata,
  config: Record<string, unknown>,
  context: FlowRuntimeContext,
  elementLabel: string
): string {
  const submitter = getUsers().find((user) =>
    user.id === context.currentUserId && user.tenantId === tenantId && !user.disabled);
  if (!submitter) throw new Error('The running user is no longer active.');
  const principal = principalForUser(submitter, tenant);
  const objectApiName = typeof config.objectApiName === 'string' ? config.objectApiName.trim() : '';
  const object = tenant.objects.find((candidate) => candidate.apiName === objectApiName);
  if (!object) throw new Error(`Submit for Approval "${elementLabel}" references an unavailable object.`);
  const processApiName = typeof config.approvalProcessApiName === 'string' ? config.approvalProcessApiName : '';
  const approvalProcess = processApiName
    ? tenant.approvalProcesses.find((item) => item.apiName === processApiName && item.active)
    : undefined;
  if (processApiName && !approvalProcess) {
    throw new Error(`Submit for Approval "${elementLabel}" references an unavailable or inactive approval process.`);
  }
  if (approvalProcess && approvalProcess.objectApiName !== objectApiName) {
    throw new Error(`Approval process "${approvalProcess.label}" is for "${approvalProcess.objectApiName}", not "${objectApiName}".`);
  }
  const recordId = resolveFlowTemplate(String(config.recordId ?? ''), context).trim();
  const record = (tenant.records[objectApiName] ?? []).find((candidate) => candidate.Id === recordId);
  if (!record || !hasObjectPermission(principal, tenant, objectApiName, 'edit')
    || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) {
    throw new Error(`Submit for Approval "${elementLabel}" requires edit access to its target record.`);
  }
  const approverText = approvalProcess
    ? approvalProcess.approverUserIds.join(',')
    : resolveFlowTemplate(String(config.approverIds ?? ''), context);
  const approverIds = [...new Set(approverText.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean))];
  if (!approverIds.length) throw new Error(`Submit for Approval "${elementLabel}" requires at least one approver.`);
  const approvers = approverIds.map((approverId) => getUsers().find((user) =>
    user.id === approverId && user.tenantId === tenantId && !user.disabled));
  const missingApproverIndex = approvers.findIndex((approver) => !approver);
  if (missingApproverIndex >= 0) {
    throw new Error(`Submit for Approval "${elementLabel}" approver "${approverIds[missingApproverIndex]}" is not an active user in this tenant.`);
  }
  for (const approver of approvers) {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    const approverPrincipal = principalForUser(approver, tenant);
    if (!hasObjectPermission(approverPrincipal, tenant, objectApiName, 'read')
      || !hasRecordAccess(approverPrincipal, tenant, objectApiName, record, 'Read')) {
      throw new Error(`Submit for Approval "${elementLabel}" approver "${approver.name}" cannot access the target record.`);
    }
  }
  const comments = resolveFlowTemplate(String(config.comments ?? ''), context);
  if (comments.length > 2000) throw new Error(`Submit for Approval "${elementLabel}" comments cannot exceed 2000 characters.`);
  const groupId = randomUUID();
  const createdAt = new Date().toISOString();
  const requests = approvers.map((approver) => {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    return approvalRequestSchema.parse({
      id: randomUUID(),
      groupId,
      objectApiName,
      recordId,
      flowApiName: flow.apiName,
      processApiName: typeof config.approvalProcessApiName === 'string' ? config.approvalProcessApiName : null,
      orchestrationInterviewId: typeof config.orchestrationInterviewId === 'string' ? config.orchestrationInterviewId : null,
      approvalMode: config.approvalMode === 'ALL' ? 'ALL' : 'ANY',
      submittedBy: submitter.id,
      submittedByName: submitter.name,
      approverId: approver.id,
      status: 'Pending',
      comments,
      decisionComments: '',
      createdAt,
      decidedAt: null,
      decidedBy: null
    });
  });
  const notifications = approvers.map((approver) => {
    if (!approver) throw new Error(`Submit for Approval "${elementLabel}" contains an invalid approver.`);
    return customNotificationSchema.parse({
      id: randomUUID(),
      recipientId: approver.id,
      title: `Approval requested: ${object.label}`,
      body: `${submitter.name} submitted ${String(record.Name ?? recordId)} for your approval.`,
      flowApiName: flow.apiName,
      sentBy: submitter.id,
      createdAt,
      readAt: null
    });
  });
  tenant.approvalRequests.push(...requests);
  tenant.notifications.push(...notifications);
  return groupId;
}

 return { performPostToChatter, performCustomNotification, performSubmitForApproval };
}
