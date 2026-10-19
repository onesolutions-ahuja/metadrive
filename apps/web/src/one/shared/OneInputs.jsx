import {componentAppearance} from './componentAppearance.js';
export function css(p) { return componentAppearance(p, 'inputs'); }
export function fire(p, event, value) {
  if (typeof p.onChange === "function") p.onChange(value);
  if (typeof p.onAction === "function") p.onAction({ event, value });
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
/** Resolve choice options from the same tenant-scoped, permission-filtered record data
 * that the shared Page/Flow runtime already supplies. The server/Flow remains
 * responsible for validating prices, availability, and selection rules. */
export function recordChoiceOptions(p) {
  if (p.optionSource !== "records") return null;
  const rows = Array.isArray(p.records) ? p.records : [];
  const labelField = String(p.optionLabelFieldApiName || "").trim();
  const valueField = String(p.optionValueFieldApiName || "Id").trim();
  const availableField = String(p.optionAvailableFieldApiName || "").trim();
  const priceField = String(p.optionPriceFieldApiName || "").trim();
  const validField = (field) => /^[A-Za-z][A-Za-z0-9_]*$/.test(field);
  if (!validField(labelField) || !validField(valueField) ||
      (availableField && !validField(availableField)) ||
      (priceField && !validField(priceField))) return [];
  let currency;
  if (priceField && p.currencyCode) {
    try { currency = new Intl.NumberFormat(undefined, {
      style: "currency", currency: p.currencyCode,
    }); } catch { /* Invalid optional presentation currency does not change data */ }
  }
  return rows.slice(0, 200).flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        !Object.prototype.hasOwnProperty.call(row, labelField) ||
        !Object.prototype.hasOwnProperty.call(row, valueField) ||
        (availableField && row[availableField] !== true)) return [];
    const label = row[labelField], value = row[valueField];
    if (label === null || label === undefined || value === null || value === undefined ||
        !["string", "number"].includes(typeof value)) return [];
    const rawPrice = priceField ? row[priceField] : null;
    const price = typeof rawPrice === "number" && Number.isFinite(rawPrice)
      ? (currency ? currency.format(rawPrice) : String(rawPrice)) : "";
    return [{
      label: String(label) + (price ? " · " + price : ""),
      value: String(value),
    }];
  });
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
