import { randomUUID } from 'node:crypto';
import type { TenantData } from '../../core/state/types.js';
import type { ObjectMetadata, RuntimeRecord } from '../../index.js';

export function appendFieldHistory(tenant: TenantData, object: ObjectMetadata, previous: RuntimeRecord, updated: RuntimeRecord, userId: string): void {
  if (!object.settings?.trackFieldHistory) return;
  const changedAt = new Date().toISOString();
  const entries = object.fields.filter((field) => field.trackHistory && !Object.is(previous[field.apiName], updated[field.apiName]))
    .map((field) => ({
      id: randomUUID(),
      objectApiName: object.apiName,
      recordId: updated.Id,
      fieldApiName: field.apiName,
      oldValue: previous[field.apiName] ?? null,
      newValue: updated[field.apiName] ?? null,
      changedBy: userId,
      changedAt
    }));
  if (entries.length) tenant.fieldHistory.push(...entries);
}

