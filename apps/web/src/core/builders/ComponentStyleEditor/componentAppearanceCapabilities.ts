/**
 * Shared component-aware appearance capabilities for Page Builder property editors.
 * Keep these rules aligned with the component catalogue and renderer contracts.
 */
export type ComponentAppearanceCapabilities = {
  text: boolean;
  image: boolean;
  shape: boolean;
  container: boolean;
  data: boolean;
  common: boolean;
};

export function componentAppearanceCapabilities(componentType: string): ComponentAppearanceCapabilities {
  const type = componentType.trim().toLowerCase();
  const text = /text|heading|paragraph|rich text|label|button|link|badge/.test(type);
  const image = /image|picture|avatar|logo/.test(type);
  const shape = /shape|rectangle|square|circle|ellipse|line|divider/.test(type);
  const container = /container|layout|grid|columns|column|row|section|tabs|accordion|card|split pane|navigation/.test(type);
  const data = /record|field|related list|table|chart|metric|dashboard|report|activities|chatter|highlights/.test(type);
  return { text, image, shape, container, data, common: true };
}

export function supportsAppearanceProperty(
  componentType: string,
  property: string
): boolean {
  const capabilities = componentAppearanceCapabilities(componentType);
  const key = property.toLowerCase();
  if (['padding', 'margin', 'borderwidth', 'borderradius', 'backgroundcolor', 'bordercolor', 'opacity', 'hidden', 'zindex'].includes(key)) {
    return capabilities.common;
  }
  if (['color', 'fontsize', 'fontweight', 'textalign'].includes(key)) return capabilities.text || capabilities.data;
  if (['gap', 'desktopcolumns', 'tabletcolumns', 'mobilecolumns', 'align', 'justify', 'alignitems', 'justifycontent', 'overflowy'].includes(key)) return capabilities.container;
  if (['top', 'bottom', 'left', 'right', 'position'].includes(key)) return true;
  if (key === 'boxshadow') return capabilities.common;
  return false;
}
