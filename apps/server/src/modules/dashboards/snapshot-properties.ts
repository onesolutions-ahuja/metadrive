/** Common snapshot columns are selected once from metadata, never copied per component type. */
export const dashboardSnapshotSharedPropertyNames = [
  "title",
  "subtitle",
  "footer",
  "width",
  "height",
  "chartSortOrder",
  "chartColorPalette",
  "chartLimit",
  "chartXAxisMinimum",
  "chartXAxisMaximum",
  "chartYAxisMinimum",
  "chartYAxisMaximum",
  "chartValueFormat",
  "chartCurrencyCode",
  "chartDecimalPlaces",
  "legendPosition",
  "aggregation",
  "gaugeMin",
  "gaugeMax",
  "gaugeRange1EndPercent",
  "gaugeRange2EndPercent",
  "chartDataLabelPosition"
] as const;

type SharedProperty = typeof dashboardSnapshotSharedPropertyNames[number];

export function pickDashboardSnapshotProperties<T extends Record<SharedProperty, unknown>>(
  component: T
): Pick<T, SharedProperty> {
  return Object.fromEntries(dashboardSnapshotSharedPropertyNames.map((key) => [key, component[key]])) as Pick<T, SharedProperty>;
}
