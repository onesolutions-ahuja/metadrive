import {componentAppearance} from './componentAppearance.js';
export function css(p) { return componentAppearance(p, 'data'); }
export const records = (p) =>
  Array.isArray(p.records)
    ? p.records
    : Array.isArray(p.items)
      ? p.items
      : Array.isArray(p.data)
        ? p.data
        : [];
export const view = (v) =>
  v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
export const title = (r) =>
  view(r?.label ?? r?.title ?? r?.Name ?? r?.name ?? r?.id ?? "Record");
export function fire(p, event, value) {
  if (typeof p.onAction === "function") return p.onAction({ event, value });
}
export function columns(p, rows) {
  const choices = Array.isArray(p.columns)
    ? p.columns
    : typeof p.columns === "string"
      ? p.columns
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return choices.length
    ? choices.map((v) =>
        typeof v === "string"
          ? { key: v, label: v }
          : {
              key: v.key ?? v.apiName ?? v.fieldApiName,
              label: v.label ?? v.key ?? v.apiName,
            },
      )
    : Object.keys(rows[0] || {})
        .filter((x) => !x.startsWith("_"))
        .slice(0, 8)
        .map((k) => ({ key: k, label: k }));
}
