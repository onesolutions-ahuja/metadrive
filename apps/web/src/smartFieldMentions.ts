import type { ObjectMetadata } from './metadata';

export type MentionKind = 'text' | 'image' | 'url' | 'number' | 'formula';
export type MentionField = { objectApiName: string; objectLabel: string; fieldApiName: string; fieldLabel: string; dataType: string };
export type MentionGroup = { objectApiName: string; label: string; primary: boolean; fields: MentionField[] };

// Store API names in existing SQL-backed property metadata. Display labels may change
// without changing references; no executable expressions or tenant record data live here.
export function mentionGroups(
  objects: readonly ObjectMetadata[],
  primaryObjectApiName = '',
  appObjectApiNames: readonly string[] = [],
  query = '',
  kind: MentionKind = 'text'
): MentionGroup[] {
  const allowed = new Set([primaryObjectApiName, ...appObjectApiNames].filter(Boolean));
  const inScope = appObjectApiNames.length ? objects.filter(object => allowed.has(object.apiName)) : objects;
  const sorted = [...inScope].sort((a, b) =>
    (a.apiName === primaryObjectApiName ? -1 : b.apiName === primaryObjectApiName ? 1 : 0)
    || a.label.localeCompare(b.label));
  const q = query.trim().toLowerCase();
  return sorted.map(object => ({
    objectApiName: object.apiName,
    label: object.label,
    primary: object.apiName === primaryObjectApiName,
    fields: object.fields.filter(field =>
      isCompatibleField(field.dataType, kind) &&
      (!q || [object.label, object.apiName, field.label, field.apiName]
        .some(part => part.toLowerCase().includes(q)))
    ).map(field => ({
      objectApiName: object.apiName, objectLabel: object.label,
      fieldApiName: field.apiName, fieldLabel: field.label, dataType: field.dataType
    }))
  })).filter(group => group.fields.length > 0);
}

export function isCompatibleField(dataType: string, kind: MentionKind): boolean {
  if (kind === 'text' || kind === 'formula') return true;
  if (kind === 'number') return /^(number|integer|decimal|double|currency|percent)/i.test(dataType);
  if (kind === 'image') return /^(url|image|text|formula)/i.test(dataType);
  return /^(url|email|text|phone|formula)/i.test(dataType);
}

const REFERENCE = /@([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)/g;
export type MentionSegment = { text: string; reference: boolean };

/** Highlight only complete, existing Object.Field references; partial edits go plain. */
export function mentionSegments(
  value: string,
  objects: readonly ObjectMetadata[],
  kind: MentionKind = 'text'
): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let offset = 0;
  for (const match of value.matchAll(REFERENCE)) {
    const index = match.index;
    const end = index + match[0].length;
    if (index > 0 && /[A-Za-z0-9_@]/.test(value[index - 1])) continue; // not email
    if (end < value.length && /[A-Za-z0-9_.]/.test(value[end])) continue;
    const object = objects.find(item => item.apiName === match[1]);
    const field = object?.fields.find(item => item.apiName === match[2] && isCompatibleField(item.dataType, kind));
    if (!field) continue;
    if (index > offset) segments.push({ text: value.slice(offset, index), reference: false });
    segments.push({ text: match[0], reference: true });
    offset = end;
  }
  if (offset < value.length) segments.push({ text: value.slice(offset), reference: false });
  return segments.length ? segments : [{ text: value, reference: false }];
}

/**
 * Runtime resolves only permission-filtered records supplied by the caller.
 * Unavailable/missing object fields fail closed (empty), never query another tenant
 * or evaluate an expression. A whole reference keeps its native number/boolean type.
 */
export function resolveMentionValue(
  raw: unknown, recordsByObject: Readonly<Record<string, Record<string, unknown> | undefined>>,
  fieldsByObject: Readonly<Record<string, readonly string[]>>
): unknown {
  if (typeof raw !== 'string' || !raw.includes('@')) return raw;
  const resolve = (object: string, field: string): unknown => {
    if (!Object.prototype.hasOwnProperty.call(fieldsByObject, object)
      || !fieldsByObject[object].includes(field)) return undefined;
    const record = recordsByObject[object];
    if (!record || !Object.prototype.hasOwnProperty.call(record, field)) return undefined;
    const value = record[field];
    return ['string', 'number', 'boolean'].includes(typeof value) ? value : undefined;
  };
  const exact = /^@([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(raw);
  if (exact) return resolve(exact[1], exact[2]) ?? '';
  return raw.replace(/(^|[^A-Za-z0-9_@])@([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)(?![A-Za-z0-9_.])/g,
    (_whole, prefix: string, object: string, field: string) => prefix + String(resolve(object, field) ?? ''));
}

export function resolveMentionProperties(
  properties: Record<string, unknown>,
  recordsByObject: Readonly<Record<string, Record<string, unknown> | undefined>>,
  fieldsByObject: Readonly<Record<string, readonly string[]>>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) =>
    [key, resolveMentionValue(value, recordsByObject, fieldsByObject)]));
}
