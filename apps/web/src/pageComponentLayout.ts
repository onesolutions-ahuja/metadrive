import {appearanceNumberFields,appearanceColorFields,appearanceChoiceFields,responsiveNumberFields,responsiveOptionFields,responsiveColorFields,responsiveSettingKeys} from './metadataAppearanceSchema';
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
const colorPattern = /^(?:#[0-9a-f]{3,8}|transparent|[a-z]+)$/i;
export function normalizeVisualProperties(input: unknown): VisualProperties {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const result = { ...visualDefaults };
  for (const {key,min,max} of appearanceNumberFields) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate))
      result[key] = Math.max(min,Math.min(max,Math.round(candidate)));
  }
  for (const {key} of appearanceColorFields) {
    if (typeof value[key] === 'string' && (value[key] === '' || colorPattern.test(value[key] as string)))
      result[key] = value[key] as string;
  }
  for (const {key,options} of appearanceChoiceFields) {
    if ((options as readonly string[]).includes(String(value[key])))
      (result as unknown as Record<string,unknown>)[key] = value[key];
  }
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
/**
 * Unified component appearance resolver.
 * `visualStyle` is the original Page Builder metadata; `layoutStyle` and
 * `layoutResponsive` are its newer, per-device overrides. Preserve both so
 * pages created before this change continue to render unchanged.
 *
 * Generic custom components start unstyled unless their author actually
 * configures appearance. Layout primitives retain their existing defaults.
 */
/** Do not add new wrapper DOM for existing unstyled standard pages. */
export function hasPageComponentAppearance(properties: Record<string, unknown>): boolean {
  return properties.visualStyle !== undefined
    || properties.layoutStyle !== undefined
    || properties.layoutResponsive !== undefined;
}

export function resolvePageComponentStyle(
  properties: Record<string, unknown>,
  type: string,
  device: LayoutDevice = 'Desktop'
): CSSProperties {
  const legacy = properties.visualStyle !== undefined || isLayoutType(type)
    ? componentVisualStyle(properties.visualStyle, type, device)
    : {};
  return { ...legacy, ...resolveLayoutStyle(properties, device) };
}

/** Compatibility API for legacy page components. Use the same cycle checker
 * as responsive layouts, while retaining the legacy built-in-parent restriction.
 */
export function canNestComponent(components: PageComponentMetadata[], childId: string, parentId: string): boolean {
  const parent = components.find(item=>item.id===parentId);
  return Boolean(parent && isLayoutType(parent.type) && canNest(components,childId,parentId));
}
export function directChildren(components: PageComponentMetadata[], parentId?: string): PageComponentMetadata[] {
  return components.filter((component) => (component.parentId || undefined) === parentId);
}

export function isDescendantOf(components: PageComponentMetadata[], childId: string, ancestorId: string): boolean {
  const visited = new Set<string>();
  const byId = new Map(components.map(item=>[item.id,item]));
  let cursor = byId.get(childId);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    const parentId = rawLayoutParentId(cursor);
    if (!parentId) return false;
    if (parentId === ancestorId) return true;
    cursor = byId.get(parentId);
  }
  return false;
}

export type LayoutDevice = 'Desktop' | 'Tablet' | 'Phone';
export type LayoutSettingKey = 'padding' | 'margin' | 'backgroundColor' | 'borderColor'
  | 'borderWidth' | 'borderRadius' | 'alignItems' | 'justifyContent' | 'gap' | 'opacity' | 'hidden'
  | 'fontSize' | 'fontWeight' | 'textAlign' | 'boxShadow';
export type LayoutSettings = Partial<Record<LayoutSettingKey, string | number | boolean>>;
export const layoutContainerTypes = new Set(['Container', 'Row', 'Column', 'Card', 'Grid']);

export function isLayoutContainer(component: PageComponentMetadata): boolean {
  return isLayoutType(component.type)
    || (component.type.startsWith('Custom:') && (component.properties?.layoutContainer === true
      || ['OneContainer','OneStack','OneGrid','OneSplitPane','OneCard'].includes(component.type.slice('Custom:'.length))));
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

const settingsKeys: readonly LayoutSettingKey[] = responsiveSettingKeys;
const numberLimits: Partial<Record<LayoutSettingKey,[number,number]>> =
  Object.fromEntries(responsiveNumberFields.map(({key,min,max})=>[key,[min,max]]));
const supportedOptions: Partial<Record<LayoutSettingKey,readonly string[]>> =
  Object.fromEntries(responsiveOptionFields.map(({key,options})=>[key,options]));
const colorKeys = new Set<string>(responsiveColorFields.map(item=>item.key));
const safeShadows: Record<string, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(15, 23, 42, .12)',
  md: '0 4px 12px rgba(15, 23, 42, .14)',
  lg: '0 10px 24px rgba(15, 23, 42, .17)'
};
const cssColorPattern = /^(transparent|#[0-9a-f]{3}(?:[0-9a-f]{3})?|rgba?\([0-9.,\s%]+\))$/i;

export function validateLayoutSetting(key: LayoutSettingKey, value: unknown): string {
  if (key === 'hidden') return typeof value === 'boolean' ? '' : 'Must be true or false';
  if (colorKeys.has(key)) return typeof value === 'string' && cssColorPattern.test(value)
    ? '' : 'Choose a valid hex or RGB colour';
  if (supportedOptions[key]) return typeof value === 'string' && supportedOptions[key]?.includes(value)
    ? '' : (key === 'alignItems' || key === 'justifyContent' ? 'Choose a supported alignment' : 'Choose a supported appearance value');
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
    ...(s.fontSize !== undefined ? { fontSize: Number(s.fontSize) } : {}),
    ...(s.fontWeight ? { fontWeight: Number(s.fontWeight) } : {}),
    ...(s.textAlign ? { textAlign: String(s.textAlign) } : {}),
    ...(s.boxShadow ? { boxShadow: safeShadows[String(s.boxShadow)] } : {}),
    ...(s.hidden ? { display: 'none' } : {})
  };
}
