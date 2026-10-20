/** Shared, tenant-neutral Screen Flow record-selection contract.
 * Screens receive only collections explicitly bound to Data Table fields; submitted IDs
 * are resolved to typed Record Collections from server-held records, never client objects.
 */
export type FlowScreenRecord = Record<string, unknown>;
export type FlowScreenResource = { name: string; type: string; dataType: string };
export type FlowScreenField = Record<string, unknown>;

const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fields(screen: { config: Record<string, unknown> }): FlowScreenField[] {
  return Array.isArray(screen.config.fields)
    ? screen.config.fields.filter((item): item is FlowScreenField =>
      !!item && typeof item === 'object' && !Array.isArray(item)) : [];
}
function target(field: FlowScreenField): string {
  return typeof field.selectedRowsResource === 'string' && field.selectedRowsResource
    ? field.selectedRowsResource : String(field.apiName ?? '');
}
function selectedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return typeof value === 'string' && value ? [value] : [];
  return value.filter((item): item is string => typeof item === 'string');
}
function visibleRecord(value: unknown): value is FlowScreenRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as FlowScreenRecord).Id === 'string';
}

/** Only expose explicitly screen-bound collections, not every Flow variable. */
export function screenRecordPayload(screen: { config: Record<string, unknown> },
  vars: Record<string, unknown>, resources: FlowScreenResource[]) {
  const result: Record<string, unknown> = {};
  const screenResources: Record<string, FlowScreenRecord[]> = {};
  for (const field of fields(screen)) {
    const key = field.apiName;
    if (typeof key !== 'string' || !identifier.test(key)) continue;
    const type = field.type;
    if (type === 'Data Table') {
      const source = field.collection;
      if (typeof source === 'string' && resources.some(item =>
        item.name === source && item.type === 'Record Collection')
        && Array.isArray(vars[source])) {
        screenResources[source] = (vars[source] as unknown[]).filter(visibleRecord);
      }
    }
    const multi = type === 'Data Table' ? field.multiselect === true
      : type === 'Choice Lookup' && field.multipleSelections === true;
    const destination = resources.find(item => item.name === target(field)
      && item.type === 'Record Collection');
    if ((multi || destination) && destination && Array.isArray(vars[destination.name])) {
      result[key] = (vars[destination.name] as unknown[]).filter(visibleRecord)
        .map(item => item.Id);
    } else if (Object.hasOwn(vars, key)) result[key] = vars[key];
  }
  return { values: result, screenResources };
}

/** Return true if a typed selection was handled. Other scalar fields use the
 * existing Screen value path. Reader must enforce OneEngine Object/Record/FLS.
 */
export async function acceptScreenRecordSelection(
  field: FlowScreenField, value: unknown, vars: Record<string, unknown>,
  resources: FlowScreenResource[],
  readRecord: (objectApi: string, id: string) => Promise<FlowScreenRecord>
): Promise<boolean> {
  const type = field.type;
  if (type !== 'Data Table' && type !== 'Choice Lookup') return false;
  const multi = type === 'Data Table' ? field.multiselect === true
    : field.multipleSelections === true;
  const key = String(field.apiName ?? '');
  const output = target(field);
  const destination = resources.find(item => item.name === output
    && item.type === 'Record Collection');
  if (!multi && !destination) return false;
  if (!destination || !identifier.test(destination.dataType))
    throw new Error('Screen selected rows require a typed Record Collection resource: ' + key);
  if (!multi && Array.isArray(value))
    throw new Error('Single-select Screen field cannot accept multiple records: ' + key);
  if (!Array.isArray(value) && typeof value !== 'string' && value !== null
    && value !== undefined)
    throw new Error('Invalid Screen selection: ' + key);
  const ids = selectedIds(value);
  if (Array.isArray(value) && ids.length !== value.length)
    throw new Error('Invalid Screen selection entries: ' + key);
  if (ids.length > 200 || new Set(ids).size !== ids.length
    || ids.some(id => !recordId.test(id)))
    throw new Error('Invalid or duplicate Screen selected record IDs: ' + key);
  const min = Math.max(field.required === true ? 1 : 0,
    typeof field.minimumSelections === 'number' ? field.minimumSelections : 0);
  const max = typeof field.maximumSelections === 'number' && field.maximumSelections > 0
    ? field.maximumSelections : 200;
  if (ids.length < min || ids.length > max || (!multi && ids.length > 1))
    throw new Error('Screen selection count is outside the configured limits: ' + key);
  let records: FlowScreenRecord[];
  if (type === 'Data Table') {
    const source = field.collection;
    if (typeof source !== 'string' || !resources.some(item =>
      item.name === source && item.type === 'Record Collection'
      && item.dataType === destination.dataType) || !Array.isArray(vars[source]))
      throw new Error('Screen source collection is unavailable or has an incompatible Object: ' + key);
    const available = new Map((vars[source] as unknown[]).filter(visibleRecord)
      .map(item => [item.Id as string, item]));
    records = ids.map(id => {
      const found = available.get(id);
      if (!found) throw new Error('Screen selection is not in the permitted record collection: ' + key);
      return found;
    });
  } else {
    if (field.objectApiName !== destination.dataType)
      throw new Error('Screen selected rows Object does not match the lookup: ' + key);
    records = [];
    for (const id of ids) records.push(await readRecord(destination.dataType, id));
  }
  vars[output] = records;
  if (output !== key && !multi) vars[key] = ids[0] ?? '';
  return true;
}
