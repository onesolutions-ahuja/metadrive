/**
 * Pure, typed Flow Assignment operations for collection resources.
 * Scalar Assignment arithmetic and text operations stay in the core runtime.
 */
export function applyFlowCollectionAssignment(previous, incoming, operator, resourceType = 'Variable') {
  const collection = previous == null ? [] : previous;
  if (!Array.isArray(collection)) {
    throw new Error('Collection Assignment requires a collection variable.');
  }
  const items = Array.isArray(incoming) ? incoming : [incoming];
  const isRecordCollection = resourceType === 'Record Collection';
  const requireValidItems = (values) => {
    if (values.some((value) => value === undefined || value === null
      || (isRecordCollection && (typeof value !== 'object' || Array.isArray(value))))) {
      throw new Error('Collection Assignment contains an invalid value for its data type.');
    }
    return values;
  };
  switch (operator) {
    case 'Assign':
      if (!Array.isArray(incoming)) {
        throw new Error('Assigning a collection requires a collection value.');
      }
      return [...requireValidItems(incoming)];
    case 'Add':
    case 'Add At End':
      return [...collection, ...requireValidItems(items)];
    case 'Add At Beginning':
      return [...requireValidItems(items), ...collection];
    case 'Remove': {
      const removed = requireValidItems(items);
      const equivalent = (left, right) => {
        if (Object.is(left, right)) return true;
        if (isRecordCollection && left && right && typeof left === 'object' && typeof right === 'object') {
          return typeof left.Id === 'string' && left.Id.length > 0 && left.Id === right.Id;
        }
        return false;
      };
      return collection.filter(item => !removed.some(other => equivalent(item, other)));
    }
    case 'Remove All':
      return [];
    default:
      throw new Error('Operator "' + operator + '" is unavailable for collection Assignment.');
  }
}
