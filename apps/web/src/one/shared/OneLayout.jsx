import {componentAppearance} from './componentAppearance.js';
export const options = (value, fallback = []) =>
  Array.isArray(value)
    ? value
    : String(value || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean).length
      ? String(value || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : fallback;
export function shared(p) { return componentAppearance(p, 'layout'); }
export function fire(p, event, value) {
  if (typeof p.onAction === "function") return p.onAction({ event, value });
}
export function useOneLayout(p) {
  const kind = p.kind || "Container",
    css = shared(p);
  const [active, setActive] = React.useState(0),
    [expanded, setExpanded] = React.useState(true),
    [open, setOpen] = React.useState(false);
  const children = p.children || p.content || null;
  const paneChildren = React.Children.toArray(children).flatMap((child) =>
    child?.type === React.Fragment
      ? React.Children.toArray(child.props.children)
      : [child],
  );
  const tabRecords = Array.isArray(p.records) ? p.records : [];
  const categoryField =
    typeof p.categoryFieldApiName === "string" && p.categoryFieldApiName.trim()
      ? p.categoryFieldApiName.trim()
      : null;
  const derivedTabs =
    p.dynamicTabs === true
      ? [
          ...new Set(
            tabRecords
              .map(
                (row) =>
                  row?.[categoryField || "Name"] ?? row?.Name ?? row?.label,
              )
              .filter((value) => typeof value === "string" && value.trim())
              .map((value) => value.trim()),
          ),
        ]
      : [];
  const useRecordTabs =
    p.dynamicTabs === true ||
    (Boolean(p.objectApiName) && tabRecords.length > 0);
  const tabs = useRecordTabs
    ? derivedTabs
    : options(p.tabs, ["Overview", "Details"]);
  const selectTab = (name, i) => {
    setActive(i);
    const record = useRecordTabs
      ? tabRecords.find(
          (row) =>
            String(
              row?.[categoryField || "Name"] ?? row?.Name ?? row?.label,
            ) === name,
        )
      : null;
    const value = record?.[p.categoryValueFieldApiName || "Name"] ?? name;
    const payload = {
      index: i,
      label: name,
      value,
      recordId: record?.Id ?? record?.id ?? "",
      sourceObjectApiName: p.objectApiName || "",
    };
    if (
      useRecordTabs &&
      p.filterKey &&
      p.pageSessionKey &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(
        new CustomEvent("metadrive:page-filter-selected", {
          detail: {
            pageSessionKey: p.pageSessionKey,
            filterKey: p.filterKey,
            value: String(value),
            label: name,
            recordId: String(payload.recordId),
            sourceObjectApiName: payload.sourceObjectApiName,
          },
        }),
      );
    if (
      p.actionFlows?.tabChange &&
      !(p.previewOnly && p.actionFlows.tabChange.actionType !== "SetFilter")
    )
      Promise.resolve(fire(p, "tabChange", payload)).catch(() => {});
  };
  const safeCount = (v) => Math.max(1, Math.min(12, Number(v) || 1));
  const cols = safeCount(p.columns || p.desktopColumns || 3),
    tabletCols = safeCount(p.tabletColumns || 2),
    mobileCols = safeCount(p.mobileColumns || 1);
  const align =
    {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      stretch: "stretch",
    }[p.align] || "flex-start";
  const base = { alignItems: align };
  return {
    kind,
    css,
    active,
    setActive,
    expanded,
    setExpanded,
    open,
    setOpen,
    children,
    paneChildren,
    tabRecords,
    categoryField,
    derivedTabs,
    useRecordTabs,
    tabs,
    selectTab,
    safeCount,
    cols,
    tabletCols,
    mobileCols,
    align,
    base,
  };
}
