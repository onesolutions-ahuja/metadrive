export const pageBuilderPaletteCategories = [
  'All Components', 'Favourites', 'Layout', 'Display', 'Inputs',
  'Data', 'Navigation', 'Kiosk'
] as const;

export type PageBuilderPaletteCategory = (typeof pageBuilderPaletteCategories)[number];

export function getPageBuilderComponentCategories(
  apiName: string,
  label: string,
  description: string,
  _standard = false
): PageBuilderPaletteCategory[] {
  const name = `${apiName} ${label} ${description}`.toLowerCase();
  const categories: PageBuilderPaletteCategory[] = [];
  if (/kiosk|till|checkout|product tile/.test(name)) categories.push('Kiosk');
  if (/container|section|column|grid|layout|tab|accordion|split/.test(name)) categories.push('Layout');
  if (/form|input|checkbox|radio|select|dropdown|picker|slider|toggle/.test(name)) categories.push('Inputs');
  if (/record|table|list|chart|report|dashboard|related/.test(name)) categories.push('Data');
  if (/navigation|menu|top bar|bottom bar|header|footer|button|breadcrumb/.test(name)) categories.push('Navigation');
  if (/text|image|card|badge|carousel|label|icon|media/.test(name)) categories.push('Display');
  return categories.length ? categories : ['Display'];
}

export function createComponentPreviewProps(
  apiName: string,
  label: string,
  description?: string
): Record<string, unknown> {
  return {
    apiName,
    label,
    title: label,
    description: description || label,
    value: '',
    items: [],
    records: [],
    loading: false,
    disabled: true,
    preview: true,
    onAction: () => undefined,
    onChange: () => undefined,
    onNavigate: () => undefined
  };
}
