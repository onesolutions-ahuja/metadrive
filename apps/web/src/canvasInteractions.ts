import type { PageComponentMetadata } from './metadata';

export type CanvasPosition = NonNullable<PageComponentMetadata['position']>;
export type CanvasGuides = { x: boolean; y: boolean };
export type SnapResult = { position: CanvasPosition; guides: CanvasGuides };
export const CANVAS_GRID = 8;
const MAGNET_RANGE = 6;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/** Pure geometric snapping. No extra React state or history entries during a drag. */
export function snapCanvasPosition(
  draft: CanvasPosition,
  canvas: { width: number; height: number },
  neighbours: ReadonlyArray<CanvasPosition>,
  gridEnabled = true
): SnapResult {
  let x = clamp(Math.round(draft.x), 0, canvas.width - draft.width);
  let y = clamp(Math.round(draft.y), 0, canvas.height - draft.height);
  const guides = { x: false, y: false };
  if (gridEnabled) {
    x = clamp(Math.round(x / CANVAS_GRID) * CANVAS_GRID, 0, canvas.width - draft.width);
    y = clamp(Math.round(y / CANVAS_GRID) * CANVAS_GRID, 0, canvas.height - draft.height);
  }
  const xAnchors = neighbours.flatMap(p => [p.x, p.x + p.width, p.x + p.width / 2]);
  const yAnchors = neighbours.flatMap(p => [p.y, p.y + p.height, p.y + p.height / 2]);
  const nearest = (value: number, offsets: number[], anchors: number[]) => {
    let best = value;
    let distance = MAGNET_RANGE + 1;
    for (const anchor of anchors) for (const offset of offsets) {
      const diff = Math.abs(anchor - (value + offset));
      if (diff < distance) { best = anchor - offset; distance = diff; }
    }
    return { value: best, matched: distance <= MAGNET_RANGE };
  };
  const horizontal = nearest(x, [0, draft.width, draft.width / 2], xAnchors);
  const vertical = nearest(y, [0, draft.height, draft.height / 2], yAnchors);
  if (horizontal.matched) { x = clamp(Math.round(horizontal.value), 0, canvas.width - draft.width); guides.x = true; }
  if (vertical.matched) { y = clamp(Math.round(vertical.value), 0, canvas.height - draft.height); guides.y = true; }
  return { position: { ...draft, x, y }, guides };
}

export function snapCanvasSize(
  position: CanvasPosition,
  width: number,
  height: number,
  canvas: { width: number; height: number },
  min: { width: number; height: number },
  gridEnabled: boolean
): CanvasPosition {
  const scaled = (n: number) => gridEnabled ? Math.round(n / CANVAS_GRID) * CANVAS_GRID : Math.round(n);
  return {
    ...position,
    width: clamp(scaled(width), Math.min(min.width, canvas.width - position.x), canvas.width - position.x),
    height: clamp(scaled(height), Math.min(min.height, canvas.height - position.y), canvas.height - position.y)
  };
}

export const isCanvasLocked = (component: Pick<PageComponentMetadata, 'properties'>) =>
  component.properties.editorLocked === true;

/** A group is an existing layout container, so no new metadata/runtime engine. */
export function wrapCanvasComponent(
  components: readonly PageComponentMetadata[],
  id: string,
  groupId: string
): PageComponentMetadata[] {
  const child = components.find(component => component.id === id);
  if (!child || !child.position || isCanvasLocked(child) || child.parentId) return [...components];
  const group: PageComponentMetadata = {
    id: groupId, type: 'Container', label: child.label + ' Group', visible: true,
    region: child.region ?? 'main',
    position: { ...child.position },
    properties: { visualStyle: { padding: 0, margin: 0, gap: 0 }, layoutContainer: true }
  };
  return components.flatMap(component => component.id === id
    ? [group, { ...component, parentId: groupId, properties: { ...component.properties, layoutParentId: groupId },
      position: { ...component.position!, x: 0, y: 0 } }]
    : [component]);
}
