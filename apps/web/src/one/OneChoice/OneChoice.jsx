import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

export default function OneChoice(props) {
  const p = { ...props, kind: props.kind || "Choice" };
  const {
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
  } = useOneInputs(p);
  const mode = p.mode || "select",
    chosen = Array.isArray(current)
      ? current.map(String)
      : current == null
        ? ""
        : String(current);
  const toggle = (v) => {
    if (mode === "checkbox" || Array.isArray(chosen)) {
      const values = Array.isArray(chosen) ? chosen : [];
      set(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
    } else set(v);
  };
  if (mode === "multiple")
    return wrap(
      <select
        className="one-control"
        multiple
        required={p.required === true}
        id={p.inputId}
        aria-describedby={p.helpId}
        value={Array.isArray(chosen) ? chosen : []}
        onChange={(e) =>
          set(Array.from(e.target.selectedOptions, (x) => x.value))
        }
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>,
    );
  if (mode === "select")
    return wrap(
      <select
        className="one-control"
        required={p.required === true}
        id={p.inputId}
        aria-describedby={p.helpId}
        value={typeof chosen === "string" ? chosen : ""}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">Select</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>,
    );
  return (
    <fieldset {...root} style={{ ...root.style, border: 0, padding: 0 }}>
      <legend>{label}</legend>
      <div className="one-row">
        {options.map((o) => (
          <label
            className={mode === "segmented" ? "one-btn" : "one-row"}
            key={o.value}
          >
            <input
              type={mode === "checkbox" ? "checkbox" : "radio"}
              name={p.name || label}
              required={p.required === true && mode !== "checkbox"}
              value={o.value}
              checked={
                Array.isArray(chosen)
                  ? chosen.includes(o.value)
                  : chosen === o.value
              }
              onChange={() => toggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
