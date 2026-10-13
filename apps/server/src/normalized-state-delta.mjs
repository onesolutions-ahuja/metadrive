// Incremental, SQL-only state-tree mutations. IDs remain stable for existing
// object keys and array positions, so appending a login session or audit event
// never rewrites unrelated metadata. All mutations are committed atomically.
export function normalizedRow(row) {
  const pick = (camel, snake) => row[camel] ?? row[snake] ?? null;
  const numberValue = pick('numberValue', 'number_value');
  const parentId = pick('parentId', 'parent_id');
  return {
    nodeId: Number(pick('nodeId', 'node_id')),
    parentId: parentId === null ? null : Number(parentId),
    slotKey: pick('slotKey', 'slot_key'),
    ordinal: Number(row.ordinal),
    kind: row.kind,
    stringValue: pick('stringValue', 'string_value'),
    numberValue: numberValue === null ? null : Number(numberValue),
    boolValue: pick('boolValue', 'bool_value')
  };
}
function equivalent(a, b) {
  return a.nodeId === b.nodeId && a.parentId === b.parentId &&
    a.slotKey === b.slotKey && a.ordinal === b.ordinal && a.kind === b.kind &&
    a.stringValue === b.stringValue && a.numberValue === b.numberValue &&
    a.boolValue === b.boolValue;
}
function childKey(row, parentKind) {
  if (parentKind === 'array') return 'i:' + row.ordinal;
  if (parentKind === 'object') return 'k:' + row.slotKey;
  throw Error('Scalar node cannot have children');
}
// Revision indexes are reusable between commits. The output nodes of one commit
// become the input nodes of the next; building their indexes while remapping
// avoids re-indexing an otherwise unchanged platform snapshot on every login.
const indexedRevisions = new WeakMap();
function fastNormalizedRow(row) {
  return Object.prototype.hasOwnProperty.call(row, 'nodeId') &&
    Object.prototype.hasOwnProperty.call(row, 'parentId') &&
    Object.prototype.hasOwnProperty.call(row, 'stringValue')
    ? row : normalizedRow(row);
}
function indexRevision(rows) {
  const cached = indexedRevisions.get(rows);
  if (cached) return cached;
  const old = rows.map(fastNormalizedRow);
  const byId = new Map();
  let root = null, highestId = 0;
  for (const row of old) {
    if (!Number.isSafeInteger(row.nodeId) || row.nodeId < 1 || byId.has(row.nodeId))
      throw Error('Duplicate or invalid stored node ID');
    byId.set(row.nodeId, row);
    highestId = Math.max(highestId, row.nodeId);
    if (row.parentId === null) {
      if (root) throw Error('Invalid stored tree root');
      root = row;
    }
  }
  if (!root) throw Error('Invalid stored tree root');
  const children = new Map();
  for (const row of old) {
    if (row.parentId === null) continue;
    const parent = byId.get(row.parentId);
    if (!parent) throw Error('Orphaned stored node');
    const key = childKey(row, parent.kind);
    let siblings = children.get(parent.nodeId);
    if (!siblings) { siblings = new Map(); children.set(parent.nodeId, siblings); }
    if (siblings.has(key)) throw Error('Duplicate stored child');
    siblings.set(key, row);
  }
  const indexed = {old, byId, root, children, highestId};
  indexedRevisions.set(rows, indexed);
  return indexed;
}
export function planNormalizedDelta(previousRows, projectedRows) {
  if (!previousRows.length || !projectedRows.length)
    throw Error('Normalized delta requires nonempty trees');
  const prior = indexRevision(previousRows);
  const assigned = new Map();
  const seen = new Set();
  const nodes = [], inserted = [], updated = [];
  const byId = new Map(), children = new Map();
  let highestId = prior.highestId, root = null;
  for (const source of projectedRows) {
    const row = fastNormalizedRow(source);
    const parent = row.parentId === null ? null : assigned.get(row.parentId);
    if (row.parentId !== null && !parent) throw Error('Projected parent is missing');
    let matched;
    if (parent === null) {
      if (root) throw Error('Invalid projected tree root');
      matched = prior.root;
    } else {
      const priorParent = prior.byId.get(parent.nodeId);
      if (priorParent?.kind === parent.kind && (parent.kind === 'array' || parent.kind === 'object'))
        matched = prior.children.get(parent.nodeId)?.get(childKey(row, parent.kind));
    }
    const nodeId = matched?.nodeId ?? ++highestId;
    if (!Number.isSafeInteger(nodeId) || seen.has(nodeId)) throw Error('Invalid delta node identity');
    seen.add(nodeId);
    const mapped = {...row, nodeId, parentId: parent?.nodeId ?? null};
    if (parent === null) root = mapped;
    else {
      const key = childKey(mapped, parent.kind);
      let siblings = children.get(parent.nodeId);
      if (!siblings) { siblings = new Map(); children.set(parent.nodeId, siblings); }
      if (siblings.has(key)) throw Error('Duplicate projected child');
      siblings.set(key, mapped);
    }
    assigned.set(row.nodeId, mapped);
    byId.set(nodeId, mapped);
    nodes.push(mapped);
    if (!matched) inserted.push(mapped);
    else if (!equivalent(mapped, matched)) updated.push(mapped);
  }
  const deleted = prior.old.filter(row => !seen.has(row.nodeId));
  indexedRevisions.set(nodes, {old:nodes, byId, root, children, highestId});
  return {nodes, deleted, inserted, updated};
}
// Verify every scalar and parent edge after stable-ID remapping, without
// decoding or hashing the entire state tree a second time per transaction.
export function verifyProjectedDelta(projectedRows, mappedRows) {
  if (projectedRows.length !== mappedRows.length) throw Error('Projected SQL delta node count mismatch');
  const mappedIds = new Map();
  const seen = new Set();
  for (let i = 0; i < projectedRows.length; i++) {
    const expected = projectedRows[i], actual = mappedRows[i];
    if (!actual || expected.slotKey !== actual.slotKey ||
        expected.ordinal !== actual.ordinal || expected.kind !== actual.kind ||
        expected.stringValue !== actual.stringValue ||
        expected.numberValue !== actual.numberValue ||
        expected.boolValue !== actual.boolValue ||
        !Number.isSafeInteger(actual.nodeId) || seen.has(actual.nodeId))
      throw Error('Projected SQL delta differs from source');
    const sourceParent = expected.parentId;
    const expectedParent = sourceParent === null ? null : mappedIds.get(sourceParent);
    if (expectedParent === undefined || actual.parentId !== expectedParent)
      throw Error('Projected SQL delta parent differs from source');
    seen.add(actual.nodeId);
    mappedIds.set(expected.nodeId, actual.nodeId);
  }
}

export function verifyDeltaReadback(expectedRows, actualRows) {
  const expected = new Map(expectedRows.map(row => [row.nodeId, normalizedRow(row)]));
  if (actualRows.length !== expected.size) throw Error('SQL delta readback row count mismatch');
  for (const input of actualRows) {
    const row = normalizedRow(input);
    const intended = expected.get(row.nodeId);
    if (!intended || !equivalent(row, intended)) throw Error('SQL delta readback differs');
    expected.delete(row.nodeId);
  }
  if (expected.size) throw Error('SQL delta readback missing nodes');
}
