import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
  recordChoiceOptions,
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
    options: staticOptions,
  } = useOneInputs(p);
  const options = recordChoiceOptions(p) ?? staticOptions;
  const [selectionError, setSelectionError] = React.useState("");
  const maxSelections = Number.isSafeInteger(Number(p.maxSelections)) &&
    Number(p.maxSelections) > 0 ? Number(p.maxSelections) : 0;
  const minSelections = Number.isSafeInteger(Number(p.minSelections)) &&
    Number(p.minSelections) > 0 ? Number(p.minSelections) : 0;
  const mode = p.mode || "select",
    chosen = Array.isArray(current)
      ? current.map(String)
      : current == null
        ? ""
        : String(current);
  const toggle = (v) => {
    if (mode === "checkbox" || Array.isArray(chosen)) {
      const values = Array.isArray(chosen) ? chosen : [];
      if (!values.includes(v) && maxSelections && values.length >= maxSelections) {
        setSelectionError("Select no more than " + maxSelections + " options.");
        return;
      }
      setSelectionError("");
      set(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
    } else { setSelectionError(""); set(v); }
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
        onChange={(e) => {
          const next = Array.from(e.target.selectedOptions, (x) => x.value);
          if (maxSelections && next.length > maxSelections) {
            setSelectionError("Select no more than " + maxSelections + " options.");
            return;
          }
          setSelectionError("");
          set(next);
        }}
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
      {p.optionSource === "records" && !p.optionLabelFieldApiName &&
        <p role="alert">Select the record label field for this choice.</p>}
      {(minSelections > 0 || maxSelections > 0) &&
        <small className="one-muted">
          {minSelections ? "Select at least " + minSelections : ""}
          {minSelections && maxSelections ? " and " : ""}
          {maxSelections ? "no more than " + maxSelections : ""} options
        </small>}
      {selectionError && <small role="alert">{selectionError}</small>}
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
