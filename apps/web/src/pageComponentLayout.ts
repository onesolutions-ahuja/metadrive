import type { PageComponentMetadata } from './metadata';

export type LayoutDevice = 'Desktop' | 'Tablet' | 'Phone';
export type LayoutSettingKey = 'padding' | 'margin' | 'backgroundColor' | 'borderColor'
  | 'borderWidth' | 'borderRadius' | 'alignItems' | 'justifyContent' | 'gap' | 'opacity' | 'hidden';
export type LayoutSettings = Partial<Record<LayoutSettingKey, string | number | boolean>>;
export const layoutContainerTypes = new Set([
  'Custom:KioskContainer', 'Custom:KioskRow', 'Custom:KioskColumn',
  'Custom:KioskCard', 'Custom:KioskGrid'
]);

export function isLayoutContainer(component: PageComponentMetadata): boolean {
  return layoutContainerTypes.has(component.type);
}
export function rawLayoutParentId(component: PageComponentMetadata): string | null {
  return typeof component.properties?.layoutParentId === 'string' && component.properties.layoutParentId
    ? component.properties.layoutParentId : null;
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
    return { ...item, properties };
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
