import type { FieldMetadata, FlowDefinitionMetadata, FlowResourceMetadata } from './metadata';

export type InputSourceKind = 'Unmapped' | 'Literal' | 'Event' | 'Event Field' | 'Record Field' | 'Session' | 'Legacy';
export type InputSource = { kind: InputSourceKind; detail: string; value: unknown };
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
const eventPath = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;

/** Read the resources that the active Flow version actually exposes. */
export function declaredFlowInputs(flow?: FlowDefinitionMetadata): FlowResourceMetadata[] {
  if (!flow) return [];
  const version = flow.versions?.find(item => item.versionNumber === flow.activeVersion);
  const resources = version?.resources ?? flow.resources ?? [];
  return resources.filter(item => item.availableForInput && identifier.test(item.name));
}

export function decodeInputSource(value: unknown, hasMapping = true): InputSource {
  if (!hasMapping) return { kind: 'Unmapped', detail: '', value: undefined };
  if (value === '$session') return { kind: 'Session', detail: '', value };
  if (value === '$event') return { kind: 'Event', detail: '', value };
  if (typeof value === 'string' && value.startsWith('$event.')) {
    const path = value.slice(7);
    return eventPath.test(path)
      ? { kind: 'Event Field', detail: path, value }
      : { kind: 'Legacy', detail: '', value };
  }
  if (typeof value === 'string' && value.startsWith('$record.')) {
    const field = value.slice(8);
    return identifier.test(field)
      ? { kind: 'Record Field', detail: field, value }
      : { kind: 'Legacy', detail: '', value };
  }
  if (value && typeof value === 'object') return { kind: 'Legacy', detail: '', value };
  return { kind: 'Literal', detail: String(value ?? ''), value };
}

export function encodeInputSource(
  kind: Exclude<InputSourceKind, 'Legacy'>,
  detail: string,
  fields: ReadonlyArray<Pick<FieldMetadata, 'apiName'>>,
  dataType = ''
): unknown {
  if (kind === 'Unmapped') return undefined;
  if (kind === 'Session') return '$session';
  if (kind === 'Event') return '$event';
  if (kind === 'Event Field') {
    if (!eventPath.test(detail)) throw new Error('Choose a valid event property (for example item.id).');
    return '$event.' + detail;
  }
  if (kind === 'Record Field') {
    if (!fields.some(field => field.apiName === detail)) {
      throw new Error('Select an available field from the component data object.');
    }
    return '$record.' + detail;
  }
  // The existing runtime treats special $ prefixes as expressions; do not
  // let a text literal masquerade as an event, record or session reference.
  if (detail.startsWith('$event') || detail.startsWith('$record') || detail === '$session') {
    throw new Error('This literal is reserved for a metadata reference.');
  }
  const type = dataType.toLowerCase().trim();
  if (type === 'boolean' || type === 'checkbox') {
    if (detail !== 'true' && detail !== 'false') throw new Error('Boolean literals must be true or false.');
    return detail === 'true';
  }
  if (/^(number|currency|percent|integer|decimal|double)(\(|$)/.test(type)) {
    if (detail.trim() === '' || !Number.isFinite(Number(detail))) throw new Error('Enter a finite numeric value.');
    return Number(detail);
  }
  return detail;
}

export function mappedInputNames(flow: FlowDefinitionMetadata | undefined, inputs: Record<string, unknown>): string[] {
  const declared = declaredFlowInputs(flow).map(item => item.name);
  return [...new Set([...declared, ...Object.keys(inputs)])];
}
