import {componentAppearance} from './componentAppearance.js';
export function css(p) { return componentAppearance(p, 'actions'); }
export const arr = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
export function label(o) {
  return typeof o === "object" && o !== null
    ? String(o.label ?? o.name ?? o.title ?? o.value ?? "")
    : String(o);
}
export function value(o) {
  return typeof o === "object" && o !== null
    ? (o.value ?? o.id ?? o.apiName ?? label(o))
    : o;
}
export function fire(p, event, v) {
  if (event === "change" && p.actionFlows?.change && typeof p.onAction === "function")
    return p.onAction({ event, value: v });
  if (typeof p.onAction === "function") p.onAction({ event, value: v });
  if (event === "change" && typeof p.onChange === "function") return p.onChange(v);
}
export function useOneActions(p) {
  const kind = p.kind || "Button",
    root = css(p);
  const [query, setQuery] = React.useState(String(p.value || "")),
    [selected, setSelected] = React.useState(0),
    [open, setOpen] = React.useState(false),
    [localPage, setPage] = React.useState(Number(p.page) || 1);
  const options = arr(p.items || p.options || p.links);
  return {
    kind,
    root,
    query,
    setQuery,
    selected,
    setSelected,
    open,
    setOpen,
    localPage,
    setPage,
    options,
  };
}
