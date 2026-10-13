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
export function planNormalizedDelta(previousRows, projectedRows) {
  const old = previousRows.map(normalizedRow);
  const next = projectedRows.map(normalizedRow);
  if (!old.length || !next.length) throw Error('Normalized delta requires nonempty trees');
  const byOldId = new Map(old.map(row => [row.nodeId, row]));
  if (byOldId.size !== old.length) throw Error('Duplicate stored node ID');
  const oldRoot = old.find(row => row.parentId === null);
  if (!oldRoot || old.filter(row => row.parentId === null).length !== 1)
    throw Error('Invalid stored tree root');
  const children = new Map();
  for (const row of old) {
    if (row.parentId === null) continue;
    const parent = byOldId.get(row.parentId);
    if (!parent) throw Error('Orphaned stored node');
    const key = childKey(row, parent.kind);
    if (!children.has(parent.nodeId)) children.set(parent.nodeId, new Map());
    if (children.get(parent.nodeId).has(key)) throw Error('Duplicate stored child');
    children.get(parent.nodeId).set(key, row);
  }
  const assigned = new Map();
  const seen = new Set();
  const nodes = [];
  let highestId = 0;
  for (const row of old) highestId = Math.max(highestId, row.nodeId);
  for (const row of next) {
    const parent = row.parentId === null ? null : assigned.get(row.parentId);
    if (row.parentId !== null && !parent) throw Error('Projected parent is missing');
    let matched;
    if (parent === null) matched = oldRoot;
    else {
      const priorParent = byOldId.get(parent.nodeId);
      if (priorParent?.kind === parent.kind && (parent.kind === 'array' || parent.kind === 'object'))
        matched = children.get(parent.nodeId)?.get(childKey(row, parent.kind));
    }
    const nodeId = matched?.nodeId ?? ++highestId;
    if (!Number.isSafeInteger(nodeId) || seen.has(nodeId)) throw Error('Invalid delta node identity');
    seen.add(nodeId);
    const mapped = { ...row, nodeId, parentId: parent?.nodeId ?? null };
    assigned.set(row.nodeId, mapped);
    nodes.push(mapped);
  }
  const deleted = old.filter(row => !seen.has(row.nodeId));
  const inserted = nodes.filter(row => !byOldId.has(row.nodeId));
  const updated = nodes.filter(row => byOldId.has(row.nodeId) && !equivalent(row, byOldId.get(row.nodeId)));
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
    seen.add(actual.nodeId);
    mappedIds.set(expected.nodeId, actual.nodeId);
  }
  for (let i = 0; i < projectedRows.length; i++) {
    const sourceParent = projectedRows[i].parentId;
    const expectedParent = sourceParent === null ? null : mappedIds.get(sourceParent);
    if (expectedParent === undefined || mappedRows[i].parentId !== expectedParent)
      throw Error('Projected SQL delta parent differs from source');
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
