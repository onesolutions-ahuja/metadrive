
import type { ObjectMetadata, RuntimeRecord } from '../../index.js';
import { stampRecordAuditFields } from '../records/record-actions.js';
import { randomUUID } from 'node:crypto';

/** Canonical external API audit logging; tenant data always persists through shared CRUD. */
export function createCommunicationAuditRuntime(deps: {
 tenantData: (tenantId: string) => TenantData | undefined;
 getUsers: () => LocalUser[];
 applyRecordDefaults: (tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, ownerId: string) => Record<string, unknown>;
 validateRuntimeRecord: (tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, current?: RuntimeRecord) => void;
 persistTenantRecords: (tenantId: string, tenant: TenantData) => void;
}) {
 const { tenantData, getUsers, applyRecordDefaults, validateRuntimeRecord, persistTenantRecords } = deps;
function redactCommunicationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCommunicationValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /password|secret|authorization|token|api[-_]?key|credential|cookie/i.test(key)
        ? '[REDACTED]'
        : redactCommunicationValue(item)
    ]));
  }
  return value;
}

function communicationPayload(value: unknown): string {
  if (value === undefined || value === null) return '';
  let payload: unknown = value;
  if (typeof value === 'string') {
    try { payload = JSON.parse(value) as unknown; } catch { /* Plain-text payloads are retained as text. */ }
  }
  const serialized = typeof payload === 'string'
    ? payload
    : JSON.stringify(redactCommunicationValue(payload));
  const maximumLength = 120_000;
  return serialized.length > maximumLength ? `${serialized.slice(0, maximumLength - 15)}...[TRUNCATED]` : serialized;
}

function communicationSafeUrl(value: string): string {
  const url = new URL(value);
  for (const [key] of url.searchParams) {
    if (/password|secret|authorization|token|api[-_]?key|credential|cookie/i.test(key)) {
      url.searchParams.set(key, '[REDACTED]');
    }
  }
  return url.toString();
}

function supportedCommunicationMethod(method: string): string {
  const supportedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return supportedMethods.includes(method.toUpperCase()) ? method.toUpperCase() : 'OTHER';
}

function communicationError(responseBody: unknown): string {
  if (typeof responseBody === 'string') return responseBody.slice(0, 120_000);
  if (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
    const response = responseBody as Record<string, unknown>;
    const error = response.error ?? response.message;
    return error === undefined ? '' : communicationPayload(error);
  }
  return '';
}

function appendCommunicationRecord(
  tenantId: string,
  requestedOwnerId: string,
  entry: {
    apiId: string;
    url: string;
    authType: string;
    method: string;
    direction: 'Incoming' | 'Outgoing';
    requestBody: string;
    responseBody: string;
    status: number;
    error: string;
    durationMs: number;
  }
): void {
  const tenant = tenantData(tenantId);
  const object = tenant?.objects.find((item) => item.apiName === 'Communication_Records__c');
  if (!tenant || !object) throw new Error(`Communication Records is unavailable for tenant "${tenantId}".`);
  const ownerId = getUsers().find((user) => user.id === requestedOwnerId && user.tenantId === tenantId && !user.disabled)?.id
    ?? getUsers().find((user) => user.tenantId === tenantId && !user.disabled)?.id;
  if (!ownerId) throw new Error(`No active owner is available for Communication Records in tenant "${tenantId}".`);
  const now = new Date().toISOString();
  const values = applyRecordDefaults(tenantId, tenant, object, {
    Api_Id__c: entry.apiId.slice(0, 255),
    Event_Type__c: 'API Call', Communication_Mode__c: 'API', Source__c: 'API',
    Url__c: entry.url,
    Auth_Type__c: entry.authType,
    Method__c: entry.method,
    Direction__c: entry.direction,
    Request_Body__c: entry.requestBody,
    Response_Body__c: entry.responseBody,
    Status_Code__c: entry.status,
    Error__c: entry.error,
    Duration_Ms__c: entry.durationMs,
    Occurred_At__c: now
  }, ownerId);
  validateRuntimeRecord(tenantId, tenant, object, values);
  const record = stampRecordAuditFields({
    ...values,
    Id: randomUUID(),
    CreatedDate: now,
    LastModifiedDate: now
  }, ownerId, now);
  persistTenantRecords(tenantId, {
    ...tenant,
    records: {
      ...tenant.records,
      Communication_Records__c: [...(tenant.records.Communication_Records__c ?? []), record]
    }
  });
}

 return { redactCommunicationValue, communicationPayload, communicationSafeUrl,
  supportedCommunicationMethod, communicationError, appendCommunicationRecord };
}
