/**
 * Insert an element on an existing Flow connector without changing its
 * outcome/fault/scheduled/async semantics. Flow execution follows connectors,
 * not the order in the editor's elements array.
 *
 * Ambiguous branches deliberately fail closed. The caller must select the
 * specific connector to split rather than silently rewiring a Decision.
 */
export function insertFlowElementAtPath(flow, fromId, element, connectorId, continuationId) {
  const previousIndex = flow.elements.findIndex(item => item.id === fromId);
  if (previousIndex < 0) throw Error('Select a valid Flow element before adding another.');
  if (flow.elements.some(item => item.id === element.id)) throw Error('Flow element IDs must be unique.');
  if (flow.elements[previousIndex].type === 'End') throw Error('Cannot add after an End element.');
  const outgoing = flow.connectors.filter(connector => connector.from === fromId);
  const selected = connectorId
    ? outgoing.find(connector => connector.id === connectorId)
    : outgoing.length === 1 ? outgoing[0] : undefined;
  if (connectorId && !selected) throw Error('Selected Flow connector no longer belongs to this element.');
  if (!connectorId && outgoing.length > 1) {
    throw Error('Select an outcome path before inserting an element on a branching Flow.');
  }
  if (!continuationId || flow.connectors.some(connector => connector.id === continuationId)) {
    throw Error('New Flow connector ID must be unique.');
  }
  const elements = [
    ...flow.elements.slice(0, previousIndex + 1),
    element,
    ...flow.elements.slice(previousIndex + 1)
  ];
  if (!selected) {
    return {
      ...flow, elements,
      connectors: [...flow.connectors, { id: continuationId, from: fromId, to: element.id, label: '', kind: 'normal' }]
    };
  }
  const connectorIndex = flow.connectors.findIndex(connector => connector.id === selected.id);
  const connectors = [
    ...flow.connectors.slice(0, connectorIndex),
    { ...selected, to: element.id },
    { id: continuationId, from: element.id, to: selected.to, label: '', kind: 'normal' },
    ...flow.connectors.slice(connectorIndex + 1)
  ];
  return { ...flow, elements, connectors };
}
