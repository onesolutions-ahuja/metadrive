export type CanvasOrientation = 'Portrait' | 'Landscape';

export function canvasOrientation(width: number, height: number): CanvasOrientation {
  return height > width ? 'Portrait' : 'Landscape';
}

export function canvasDimensionsForOrientation(width: number, height: number, orientation: CanvasOrientation): { width: number; height: number } {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  return orientation === 'Portrait'
    ? { width: shortSide, height: longSide }
    : { width: longSide, height: shortSide };
}

export function canvasScaleToFitWidth(canvasWidth: number, availableWidth: number): number {
  if (!Number.isFinite(canvasWidth) || canvasWidth <= 0 || !Number.isFinite(availableWidth)) return 1;
  return Math.min(1, Math.max(0.01, availableWidth / canvasWidth));
}

export function canvasUnitsFromScreenDelta(delta: number, scale: number): number {
  return delta / (Number.isFinite(scale) && scale > 0 ? scale : 1);
}
