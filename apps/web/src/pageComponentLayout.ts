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
