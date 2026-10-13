/**
 * Generic Flow Create Records collection input guard.
 *
 * The caller still executes tenant DML with current-user RBAC, record defaults,
 * before/after triggers, transaction integrity and audit hooks. This function
 * only accepts configured Record Collection resources of the target object and
 * validates the entire batch *before* attempting its first record write.
 */
export function prepareFlowCreateCollection(resourceDefinitions, sourceCollection, object, sourceValues) {
  if (!sourceCollection || typeof sourceCollection !== 'string') {
    throw new Error('Create Records requires a selected Record Collection resource.');
  }
  const resource = resourceDefinitions.find(item => item.name === sourceCollection);
  if (!resource || resource.type !== 'Record Collection' || resource.dataType !== object.apiName || resource.isCollection !== true) {
    throw new Error('Create Records collection must be a Record Collection resource of the selected object.');
  }
  if (!Array.isArray(sourceValues)) {
    throw new Error('Create Records collection value must contain records.');
  }
  if (sourceValues.length > 200) {
    throw new Error('Create Records collection exceeded the 200-record transaction limit.');
  }
  const allowedFields = new Set(['RecordTypeId', ...object.fields.map(field => field.apiName)]);
  return sourceValues.map((sourceRecord, index) => {
    if (!sourceRecord || typeof sourceRecord !== 'object' || Array.isArray(sourceRecord)) {
      throw new Error('Create Records collection item ' + (index + 1) + ' must be a record object.');
    }
    const fieldValues = Object.entries(sourceRecord);
    for (const [fieldName] of fieldValues) {
      if (!allowedFields.has(fieldName) || ['Id', 'CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById'].includes(fieldName)) {
        throw new Error('Create Records collection item ' + (index + 1) + ' includes an unavailable or immutable field.');
      }
    }
    return Object.fromEntries(fieldValues);
  });
}
