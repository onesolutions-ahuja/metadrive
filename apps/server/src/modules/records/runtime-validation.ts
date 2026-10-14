/** Record validation for all metadata-configured objects; tenant-scoped users are explicit. */
import type { ObjectMetadata, TenantData, RuntimeRecord, RelatedLookupFilterMetadata } from '../../index.js';
import { uniqueFieldValueKey } from './record-values.js';
import { validateRequiredRecordFields } from './field-rules.js';
import { matchesRelatedLookupFilter, validateGeolocationValue } from './record-constraints.js';

export function validateRuntimeRecord(tenantId: string, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>, current: RuntimeRecord | undefined, users: readonly {id:string;tenantId:string;disabled?:boolean}[]): void {
  const fields = new Map(object.fields.map((field) => [field.apiName, field]));
  const recordTypeId = values.RecordTypeId ?? current?.RecordTypeId
    ?? object.recordTypes?.find((recordType) => recordType.isDefault && recordType.active)?.id;
  if (object.recordTypes?.length) {
    if (typeof recordTypeId !== 'string' || !object.recordTypes.some((recordType) => recordType.id === recordTypeId && recordType.active)) {
      throw new Error(`Record type "${String(recordTypeId ?? '')}" is not active on "${object.apiName}".`);
    }
  }
  for (const [fieldName, value] of Object.entries(values)) {
    if (fieldName === 'RecordTypeId') continue;
    const field = fields.get(fieldName);
    if (!field) throw new Error(`Field "${fieldName}" does not exist on "${object.apiName}".`);
    if (fieldName === 'CurrencyIsoCode' && value !== undefined && value !== null
      && !tenant.currencySettings.currencies.some((currency) => currency.currencyIsoCode === value)) {
      throw new Error(`Currency "${String(value)}" is not active for this tenant.`);
    }
    if (field.formula) throw new Error(`Formula field "${fieldName}" is read-only.`);
    if (field.dataType === 'Geolocation') validateGeolocationValue(field.label, value);
    if ((field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist')
      && value !== undefined && value !== null) {
      const recordType = object.recordTypes?.find((item) => item.id === recordTypeId);
      const recordTypeValues = recordType?.picklistValues?.[fieldName];
      const allowedValues = recordTypeValues ?? field.picklistValues;
      const submittedValues = field.dataType === 'Multi-Select Picklist' ? String(value).split(';').filter(Boolean) : [String(value)];
      if (field.dataType === 'Multi-Select Picklist'
        && String(value) !== ''
        && (String(value).split(';').some((item) => item.length === 0) || new Set(submittedValues).size !== submittedValues.length)) {
        throw new Error(`Field "${field.label}" contains an empty or repeated selection.`);
      }
      if (field.picklistRestricted && (recordTypeValues !== undefined || field.picklistValues !== undefined)
        && submittedValues.some((item) => !allowedValues?.includes(item))) {
        throw new Error(`Value "${String(value)}" contains an inactive picklist option for record type "${recordType?.label ?? recordTypeId ?? 'default'}" on "${field.label}".`);
      }
    }
    if (field.unique && value !== undefined && value !== null
      && uniqueFieldValueKey(field, current?.[fieldName]) !== uniqueFieldValueKey(field, value)) {
      if (tenant.records[object.apiName]?.some((record) =>
        record.Id !== current?.Id && uniqueFieldValueKey(field, record[fieldName]) === uniqueFieldValueKey(field, value))) {
        throw new Error(`Value for unique field "${fieldName}" already exists.`);
      }
    }
    if (field.relationship && value !== undefined && value !== null) {
      const queueOwner = field.apiName === 'OwnerId' && field.relationship.targetObject === 'User'
        ? tenant.accessControl.queues.some((queue) =>
          queue.id === value && queue.supportedObjectApiNames.includes(object.apiName))
        : false;
      const targetExists = queueOwner || (field.relationship.targetObject === 'User'
        ? users.some((user) => user.id === value && user.tenantId === tenantId && !user.disabled)
        : tenant.records[field.relationship.targetObject]?.some((record) => record.Id === value) ?? false);
      if (!targetExists) throw new Error(`Related record "${String(value)}" does not exist in "${field.relationship.targetObject}".`);
    }
  }
  for (const field of object.fields) {
    if (!field.controllerFieldApiName) continue;
    const dependentValue = values[field.apiName] ?? current?.[field.apiName];
    if (dependentValue === undefined || dependentValue === null || dependentValue === '') continue;
    const controllerValue = values[field.controllerFieldApiName] ?? current?.[field.controllerFieldApiName];
    const allowedValues = controllerValue === undefined || controllerValue === null || controllerValue === ''
      ? []
      : field.valueSettings?.[String(controllerValue)] ?? [];
    const selectedDependentValues = field.dataType === 'Multi-Select Picklist'
      ? String(dependentValue).split(';').filter(Boolean)
      : [String(dependentValue)];
    if (selectedDependentValues.some((value) => !allowedValues.includes(value))) {
      throw new Error(`Value "${String(dependentValue)}" is not allowed for "${field.label}" when "${field.controllerFieldApiName}" is "${String(controllerValue ?? '')}".`);
    }
  }
  const requiredFiltersByField = new Map<string, RelatedLookupFilterMetadata[]>();
  for (const filter of object.relatedLookupFilters ?? []) {
    if (!filter.required) continue;
    requiredFiltersByField.set(filter.fieldApiName, [...(requiredFiltersByField.get(filter.fieldApiName) ?? []), filter]);
  }
  for (const [fieldApiName, filters] of requiredFiltersByField) {
    const relatedId = values[fieldApiName] ?? current?.[fieldApiName];
    if (relatedId === undefined || relatedId === null || relatedId === '') continue;
    const relatedRecord = tenant.records[filters[0].relatedObject]?.find((record) => record.Id === relatedId);
    if (!relatedRecord) continue;
    const filterMatches = filters.map((filter) => {
      const actual = relatedRecord[filter.relatedFieldApiName];
      const expected = filter.valueFieldApiName
        ? Object.hasOwn(values, filter.valueFieldApiName)
          ? values[filter.valueFieldApiName]
          : current?.[filter.valueFieldApiName]
        : filter.value;
      return matchesRelatedLookupFilter(actual, expected, filter.operator);
    });
    const matches = object.relatedLookupFilterLogic?.[fieldApiName] === 'Any'
      ? filterMatches.some(Boolean)
      : filterMatches.every(Boolean);
    if (!matches) throw new Error(`Related record does not satisfy required lookup filters for "${fieldApiName}".`);
  }
  validateRequiredRecordFields(object.fields, values, current);
}

