import type { FlowDefinitionMetadata } from '../metadata';
import { flowCanvasBounds, storedFlowPosition } from '../flowCanvasLayout.mjs';

export function layoutFlowGraph(flow: FlowDefinitionMetadata, freeformLayout: boolean, dragPreview: {id:number;x:number;y:number}|null) {
  const graphNodeWidth = 320;
  const graphColumnGap = 115;
  const graphRowGap = 155;
  const graphPadding = 56;
  const graphLayers = new Map<number, number>();
  const start = flow.elements.find((element) => element.type === 'Start');
  const pending = start ? [start.id] : [];
  if (start) graphLayers.set(start.id, 0);
  while (pending.length) {
    const from = pending.shift();
    if (from === undefined) continue;
    for (const connector of flow.connectors.filter((item) => item.from === from)) {
      if (!graphLayers.has(connector.to)) {
        graphLayers.set(connector.to, (graphLayers.get(from) ?? 0) + 1);
        pending.push(connector.to);
      }
    }
  }
  const lastGraphLayer = Math.max(-1, ...graphLayers.values()) + 1;
  flow.elements.filter((element) => !graphLayers.has(element.id)).forEach((element, index) => {
    graphLayers.set(element.id, lastGraphLayer + index);
  });
  const elementsByLayer = new Map<number, FlowDefinitionMetadata['elements']>();
  flow.elements.forEach((element) => {
    const layer = graphLayers.get(element.id) ?? 0;
    elementsByLayer.set(layer, [...(elementsByLayer.get(layer) ?? []), element]);
  });
  const graphColumns = Math.max(1, ...Array.from(elementsByLayer.values(), (elements) => elements.length));
  const graphRows = Math.max(1, elementsByLayer.size);
  let graphWidth = graphPadding * 2 + graphColumns * graphNodeWidth + (graphColumns - 1) * graphColumnGap;
  let graphHeight = graphPadding * 2 + graphRows * graphRowGap;
  const autoGraphPositions = new Map<number, { x: number; y: number }>();
  elementsByLayer.forEach((elements, layer) => {
    const layerWidth = elements.length * graphNodeWidth + (elements.length - 1) * graphColumnGap;
    const offset = (graphWidth - layerWidth) / 2;
    elements.forEach((element, index) => autoGraphPositions.set(element.id, {
      x: offset + index * (graphNodeWidth + graphColumnGap),
      y: graphPadding + layer * graphRowGap
    }));
  });
  const graphPositions = new Map<number, { x: number; y: number }>();
  flow.elements.forEach((element) => {
    const automatic = autoGraphPositions.get(element.id) ?? { x: graphPadding, y: graphPadding };
    graphPositions.set(element.id, freeformLayout ? storedFlowPosition(element, automatic) : automatic);
  });
  if (dragPreview && freeformLayout && graphPositions.has(dragPreview.id)) {
    graphPositions.set(dragPreview.id, { x: dragPreview.x, y: dragPreview.y });
  }
  if (freeformLayout) {
    const bounds = flowCanvasBounds(graphPositions, graphWidth, graphHeight);
    graphWidth = bounds.width;
    graphHeight = bounds.height;
  }
  return { graphPadding, graphWidth, graphHeight, graphPositions, autoGraphPositions };
}
