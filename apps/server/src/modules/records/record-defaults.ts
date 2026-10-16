/** Record defaults are resolved from metadata and explicitly injected tenant services. */
import type { ObjectMetadata, TenantData } from '../../index.js';
import { normalizeRuntimeValues } from './record-values.js';
import { autoNumberFormatForField, formatAutoNumber } from './auto-number.js';
type DefaultsContext = {
  users: readonly {id:string;tenantId:string;disabled?:boolean}[];
  hasRecordTypeAccessForUser: (userId:string,tenant:TenantData,objectName:string,recordTypeId:string)=>boolean;
  allocateAutoNumberSequence: (tenantId:string,tenant:TenantData,object:ObjectMetadata,field:ObjectMetadata['fields'][number])=>number;
};

export function applyRecordDefaults(tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, userId: string, ctx: DefaultsContext): Record<string, unknown> {
  const result = { ...values };
  if (object.fields.some((field) => field.apiName === 'CurrencyIsoCode')
    && result.CurrencyIsoCode === undefined) {
    result.CurrencyIsoCode = tenant.currencySettings.corporateCurrency;
  }
  if (object.recordTypes?.length) {
    const activeRecordTypes = object.recordTypes.filter((recordType) => recordType.active);
    if (result.RecordTypeId === undefined) {
      const defaultRecordType = activeRecordTypes.find((recordType) => recordType.isDefault
        && ctx.hasRecordTypeAccessForUser(userId, tenant, object.apiName, recordType.id));
      const firstAvailable = activeRecordTypes.find((recordType) =>
        ctx.hasRecordTypeAccessForUser(userId, tenant, object.apiName, recordType.id));
      const selectedRecordType = defaultRecordType ?? firstAvailable;
      if (!selectedRecordType) throw new Error(`No available record type is assigned for "${object.apiName}".`);
      result.RecordTypeId = selectedRecordType.id;
    } else if (typeof result.RecordTypeId !== 'string' || !activeRecordTypes.some((recordType) =>
      recordType.id === result.RecordTypeId && ctx.hasRecordTypeAccessForUser(userId, tenant, object.apiName, recordType.id))) {
      throw new Error(`Record type "${String(result.RecordTypeId)}" is not assigned to this user for "${object.apiName}".`);
    }
  }
  for (const field of object.fields) {
    if (result[field.apiName] === undefined && field.defaultValue !== undefined) result[field.apiName] = field.defaultValue;
    if (field.dataType === 'AutoNumber' || field.dataType === 'Auto Number') {
      if (result[field.apiName] !== undefined) throw new Error(`Auto-number field "${field.apiName}" cannot be supplied.`);
      const sequence = ctx.allocateAutoNumberSequence(tenantId, tenant, object, field);
      result[field.apiName] = formatAutoNumber(autoNumberFormatForField(object, field), sequence);
    }
  }
  if (object.fields.some((field) => field.apiName === 'OwnerId') && result.OwnerId === undefined) result.OwnerId = userId;
  const ownerField = object.fields.find((field) => field.apiName === 'OwnerId');
  const ownerTenantId = ctx.users.find((user) => user.id === userId)?.tenantId;
  const owner = typeof result.OwnerId === 'string'
    ? ctx.users.find((user) => user.id === result.OwnerId && user.tenantId === ownerTenantId && !user.disabled)
    : undefined;
  if (ownerField && typeof result.OwnerId === 'string'
    && !(owner && tenant.accessControl.users.some((member) => member.id === owner.id))
    && !tenant.accessControl.queues.some((queue) => queue.id === result.OwnerId && queue.supportedObjectApiNames.includes(object.apiName))) {
    throw new Error(`Owner "${result.OwnerId}" is not an eligible user or queue for "${object.apiName}".`);
  }
  return normalizeRuntimeValues(object, result);
}

