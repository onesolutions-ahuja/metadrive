import type { CSSProperties } from 'react';
import type { PageComponentMetadata } from './metadata';

export const layoutTypes = ['Container', 'Row', 'Column', 'Card', 'Grid'] as const;
export type LayoutType = typeof layoutTypes[number];
export const isLayoutType = (type: string): type is LayoutType => layoutTypes.some((value) => value === type);
export type VisualProperties = {
  padding: number; margin: number; gap: number; borderWidth: number; borderRadius: number;
  backgroundColor: string; color: string; borderColor: string;
  align: 'start' | 'center' | 'end' | 'stretch';
  justify: 'start' | 'center' | 'end' | 'space-between';
  desktopColumns: number; tabletColumns: number; mobileColumns: number;
};
export const visualDefaults: VisualProperties = {
  padding: 12, margin: 0, gap: 12, borderWidth: 0, borderRadius: 8,
  backgroundColor: '', color: '', borderColor: '#d0d5dd',
  align: 'stretch', justify: 'start', desktopColumns: 3, tabletColumns: 2, mobileColumns: 1
};
const numbers = { padding: [0, 128], margin: [0, 128], gap: [0, 128], borderWidth: [0, 16], borderRadius: [0, 128], desktopColumns: [1, 12], tabletColumns: [1, 12], mobileColumns: [1, 12] } as const;
const colorPattern = /^(?:#[0-9a-f]{3,8}|transparent|[a-z]+)$/i;
export function normalizeVisualProperties(input: unknown): VisualProperties {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const result = { ...visualDefaults };
  for (const key of Object.keys(numbers) as Array<keyof typeof numbers>) {
    const candidate = value[key];
    const [min, max] = numbers[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) (result as unknown as Record<string, unknown>)[key] = Math.max(min, Math.min(max, Math.round(candidate)));
  }
  for (const key of ['backgroundColor', 'color', 'borderColor'] as const) {
    if (typeof value[key] === 'string' && (value[key] === '' || colorPattern.test(value[key] as string))) result[key] = value[key] as string;
  }
  if (['start','center','end','stretch'].includes(String(value.align))) result.align = value.align as VisualProperties['align'];
  if (['start','center','end','space-between'].includes(String(value.justify))) result.justify = value.justify as VisualProperties['justify'];
  return result;
}
export function componentVisualStyle(visual: unknown, type: string, viewport: 'Desktop' | 'Tablet' | 'Phone' = 'Desktop'): CSSProperties {
  const v = normalizeVisualProperties(visual);
  const layout = isLayoutType(type);
  const cols = viewport === 'Phone' ? v.mobileColumns : viewport === 'Tablet' ? v.tabletColumns : v.desktopColumns;
  return {
    padding: v.padding, margin: v.margin, gap: layout ? v.gap : undefined,
    borderWidth: v.borderWidth, borderStyle: v.borderWidth ? 'solid' : undefined, borderColor: v.borderColor,
    borderRadius: v.borderRadius, backgroundColor: v.backgroundColor || undefined, color: v.color || undefined,
    ...(layout ? { display: type === 'Grid' ? 'grid' : 'flex',
      flexDirection: type === 'Row' ? 'row' : 'column',
      flexWrap: type === 'Row' ? 'wrap' : undefined,
      gridTemplateColumns: type === 'Grid' ? `repeat(${cols}, minmax(0, 1fr))` : undefined,
      alignItems: v.align === 'start' ? 'flex-start' : v.align === 'end' ? 'flex-end' : v.align,
      justifyContent: v.justify === 'start' ? 'flex-start' : v.justify === 'end' ? 'flex-end' : v.justify,
      minHeight: 64, minWidth: 0 } : {})
  };
}
export function canNestComponent(components: PageComponentMetadata[], childId: string, parentId: string): boolean {
  if (childId === parentId) return false;
  const parent = components.find((item) => item.id === parentId);
  if (!parent || !isLayoutType(parent.type)) return false;
  const visited = new Set<string>([childId]);
  let cursor: PageComponentMetadata | undefined = parent;
  while (cursor) {
    if (visited.has(cursor.id)) return false;
    visited.add(cursor.id);
    cursor = components.find((item) => item.id === cursor?.parentId);
  }
  return true;
}
export function directChildren(components: PageComponentMetadata[], parentId?: string): PageComponentMetadata[] {
  return components.filter((component) => (component.parentId || undefined) === parentId);
}

export function isDescendantOf(components: PageComponentMetadata[], childId: string, ancestorId: string): boolean {
  const visited = new Set<string>();
  let cursor = components.find((item) => item.id === childId);
  while (cursor?.parentId && !visited.has(cursor.id)) {
    if (cursor.parentId === ancestorId) return true;
    visited.add(cursor.id);
    cursor = components.find((item) => item.id === cursor?.parentId);
  }
  return false;
}

export type LayoutDevice = 'Desktop' | 'Tablet' | 'Phone';
export type LayoutSettingKey = 'padding' | 'margin' | 'backgroundColor' | 'borderColor'
  | 'borderWidth' | 'borderRadius' | 'alignItems' | 'justifyContent' | 'gap' | 'opacity' | 'hidden';
export type LayoutSettings = Partial<Record<LayoutSettingKey, string | number | boolean>>;
export const layoutContainerTypes = new Set(['Container', 'Row', 'Column', 'Card', 'Grid']);

export function isLayoutContainer(component: PageComponentMetadata): boolean {
  return isLayoutType(component.type)
    || (component.type.startsWith('Custom:') && component.properties?.layoutContainer !== false);
}
export function rawLayoutParentId(component: PageComponentMetadata): string | null {
  return typeof component.properties?.layoutParentId === 'string' && component.properties.layoutParentId
    ? component.properties.layoutParentId : (component.parentId || null);
}

function validParentId(components: PageComponentMetadata[], component: PageComponentMetadata): string | null {
  const parentId = rawLayoutParentId(component);
  if (!parentId) return null;
  const byId = new Map(components.map((item) => [item.id, item]));
  const visited = new Set([component.id]);
  let currentId: string | null = parentId;
  while (currentId) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);
    const parent = byId.get(currentId);
    if (!parent || !isLayoutContainer(parent)) return null;
    currentId = rawLayoutParentId(parent);
  }
  return parentId;
}

export function childrenOf(
  components: PageComponentMetadata[],
  parentId: string | null
): PageComponentMetadata[] {
  return components.filter((item) => validParentId(components, item) === parentId);
}

export function canNest(
  components: PageComponentMetadata[],
  movingId: string,
  newParentId: string | null
): boolean {
  if (newParentId === null) return true;
  const parent = components.find((item) => item.id === newParentId);
  if (!parent || !isLayoutContainer(parent) || newParentId === movingId) return false;
  const visited = new Set([movingId]);
  let next: string | null = newParentId;
  while (next) {
    if (visited.has(next)) return false;
    visited.add(next);
    const item = components.find((candidate) => candidate.id === next);
    next = item ? rawLayoutParentId(item) : null;
  }
  return true;
}

export function reparentComponent(
  components: PageComponentMetadata[],
  movingId: string,
  parentId: string | null
): PageComponentMetadata[] {
  if (!components.some((item) => item.id === movingId) || !canNest(components, movingId, parentId))
    return components;
  return components.map((item) => {
    if (item.id !== movingId) return item;
    const properties = { ...item.properties };
    if (parentId) properties.layoutParentId = parentId;
    else delete properties.layoutParentId;
    return { ...item, parentId: parentId || undefined, properties };
  });
}

const settingsKeys: LayoutSettingKey[] = [
  'padding', 'margin', 'backgroundColor', 'borderColor', 'borderWidth',
  'borderRadius', 'alignItems', 'justifyContent', 'gap', 'opacity', 'hidden'
];
const numberLimits: Partial<Record<LayoutSettingKey, [number, number]>> = {
  padding: [0, 160], margin: [0, 160], borderWidth: [0, 24],
  borderRadius: [0, 160], gap: [0, 160], opacity: [0, 100]
};
const alignmentOptions: Record<string, string[]> = {
  alignItems: ['stretch', 'flex-start', 'center', 'flex-end'],
  justifyContent: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around']
};
const cssColorPattern = /^(transparent|#[0-9a-f]{3}(?:[0-9a-f]{3})?|rgba?\([0-9.,\s%]+\))$/i;

export function validateLayoutSetting(key: LayoutSettingKey, value: unknown): string {
  if (key === 'hidden') return typeof value === 'boolean' ? '' : 'Must be true or false';
  if (key === 'backgroundColor' || key === 'borderColor') return typeof value === 'string' && cssColorPattern.test(value)
    ? '' : 'Choose a valid hex or RGB colour';
  if (key in alignmentOptions) return typeof value === 'string' && alignmentOptions[key].includes(value)
    ? '' : 'Choose a supported alignment';
  const limits = numberLimits[key];
  return limits && typeof value === 'number' && Number.isFinite(value) && value >= limits[0] && value <= limits[1]
    ? '' : 'Enter a number within the allowed range';
}

export function layoutSettings(properties: Record<string, unknown>, device: LayoutDevice = 'Desktop'): LayoutSettings {
  const base = properties.layoutStyle && typeof properties.layoutStyle === 'object' && !Array.isArray(properties.layoutStyle)
    ? properties.layoutStyle as Record<string, unknown> : {};
  const responsive = properties.layoutResponsive && typeof properties.layoutResponsive === 'object' && !Array.isArray(properties.layoutResponsive)
    ? properties.layoutResponsive as Record<string, unknown> : {};
  const override = responsive[device];
  const merged = {
    ...base,
    ...(override && typeof override === 'object' && !Array.isArray(override) ? override : {})
  };
  const safe: LayoutSettings = {};
  for (const key of settingsKeys) {
    const value = merged[key];
    if (value !== undefined && !validateLayoutSetting(key, value)) {
      (safe as Record<string, unknown>)[key] = value;
    }
  }
  return safe;
}
export function updateLayoutSettings(
  properties: Record<string, unknown>,
  device: 'Base' | LayoutDevice,
  setting: LayoutSettingKey,
  value: string | number | boolean | null
): Record<string, unknown> {
  if (value !== null) {
    const validation = validateLayoutSetting(setting, value);
    if (validation) throw new Error(validation);
  }
  if (device === 'Base') {
    const base = { ...(properties.layoutStyle as Record<string, unknown> || {}) };
    if (value === null) delete base[setting]; else base[setting] = value;
    return { ...properties, layoutStyle: base };
  }
  const responsive = { ...(properties.layoutResponsive as Record<string, unknown> || {}) };
  const updated = { ...(responsive[device] as Record<string, unknown> || {}) };
  if (value === null) delete updated[setting]; else updated[setting] = value;
  if (Object.keys(updated).length) responsive[device] = updated; else delete responsive[device];
  return { ...properties, layoutResponsive: responsive };
}

export function componentLayoutProps(
  properties: Record<string, unknown>,
  device: LayoutDevice = 'Desktop'
): Record<string, string | number> {
  const s = layoutSettings(properties, device);
  return {
    ...(s.alignItems ? { align: String(s.alignItems) } : {}),
    ...(s.justifyContent ? { justify: String(s.justifyContent) } : {}),
    ...(s.gap !== undefined ? { gap: Number(s.gap) } : {})
  };
}

export function resolveLayoutStyle(
  properties: Record<string, unknown>,
  device: LayoutDevice = 'Desktop'
): Record<string, string | number | undefined> {
  const s = layoutSettings(properties, device);
  return {
    ...(s.padding !== undefined ? { padding: Number(s.padding) } : {}),
    ...(s.margin !== undefined ? { margin: Number(s.margin) } : {}),
    ...(s.backgroundColor ? { backgroundColor: String(s.backgroundColor) } : {}),
    ...(s.borderColor ? { borderColor: String(s.borderColor) } : {}),
    ...(s.borderWidth !== undefined ? { borderWidth: Number(s.borderWidth), borderStyle: s.borderWidth ? 'solid' : 'none' } : {}),
    ...(s.borderRadius !== undefined ? { borderRadius: Number(s.borderRadius) } : {}),
    ...(s.alignItems ? { alignItems: String(s.alignItems) } : {}),
    ...(s.justifyContent ? { justifyContent: String(s.justifyContent) } : {}),
    ...(s.gap !== undefined ? { gap: Number(s.gap) } : {}),
    ...(s.opacity !== undefined ? { opacity: Number(s.opacity) / 100 } : {}),
    ...(s.hidden ? { display: 'none' } : {})
  };
}
