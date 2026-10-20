import {componentAppearance} from './componentAppearance.js';
export function css(p) { return componentAppearance(p, 'inputs'); }
export function fire(p, event, value) {
  // A metadata-bound change is one logical event. The page runtime supplies
  // both callbacks, but invoking both would start the same Flow twice.
  if (event === "change" && p.actionFlows?.change && typeof p.onAction === "function")
    return p.onAction({ event, value });
  if (typeof p.onChange === "function") p.onChange(value);
  if (typeof p.onAction === "function") return p.onAction({ event, value });
}
export const list = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
export function normalizeChoice(o) {
  return typeof o === "object" && o !== null
    ? {
        label: String(o.label ?? o.name ?? o.value ?? ""),
        value: String(o.value ?? o.id ?? o.Id ?? o.label ?? ""),
      }
    : { label: String(o), value: String(o) };
}
export function useOneInputs(p) {
  const kind = p.kind || "Input",
    root = css(p),
    [local, setLocal] = React.useState(
      p.value ?? p.defaultValue ?? (kind === "Toggle" ? false : ""),
    ),
    [filter, setFilter] = React.useState("");
  const current = p.value !== undefined ? p.value : local;
  const set = (value) => {
    setLocal(value);
    fire(p, "change", value);
  };
  const label = p.label || kind;
  const wrap = (child) => (
    <div {...root}>
      <label className="one-label">
        {label}
        {child}
        {p.helpText && <small id={p.helpId}>{p.helpText}</small>}
      </label>
      {p.description && <small className="one-muted">{p.description}</small>}
    </div>
  );
  const options = list(p.options || p.choices).map(normalizeChoice);
  return {
    kind,
    root,
    local,
    setLocal,
    filter,
    setFilter,
    current,
    set,
    label,
    wrap,
    options,
  };
}
