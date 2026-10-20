import {projectRecordChoices,toggleChoiceSelection} from "../shared/recordChoices.mjs";
import OneTenantImage from "../shared/OneTenantImage.jsx";
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
    options: staticOptions,
  } = useOneInputs(p);
  const recordOptions=projectRecordChoices(p.records,p.optionLabelFieldApiName || "",
    p.optionValueFieldApiName || "Id",p.optionPriceFieldApiName || "",
    p.optionImageFieldApiName || "");
  const options=p.optionLabelFieldApiName ? recordOptions : staticOptions;
  const [selectionError,setSelectionError]=React.useState("");
  const maxSelections=Number(p.maxSelections);
  const bounded=Number.isSafeInteger(maxSelections)&&maxSelections>0;
  const markLimited=()=>setSelectionError("You may choose at most "+maxSelections+" options.");
  const renderOptionLabel=(option)=>{
    if(typeof option.price!=="number")return option.label;
    return option.label+" ("+formatOptionPrice(option.price)+")";
  };
  const formatOptionPrice=(value)=>{
    let price=String(value);
    try{if(p.currencyCode)price=new Intl.NumberFormat(undefined,{style:"currency",
      currency:p.currencyCode}).format(value);}catch{}
    return "+"+price;
  };
  const mode = p.mode || "select",
    chosen = Array.isArray(current)
      ? current.map(String)
      : current == null
        ? ""
        : String(current);
  const optionLayout = ["inline", "stacked", "cards"].includes(p.optionLayout)
    ? p.optionLayout
    : "inline";
  const optionColumns = Math.max(1, Math.min(6, Number(p.optionColumns) || 2));
  const optionMinHeight = Math.max(44, Math.min(240, Number(p.optionMinHeight) || 64));
  const optionImageHeight = Math.max(32, Math.min(180, Number(p.optionImageHeight) || 64));
  const optionImageFit = ["contain", "cover", "fill", "scale-down"].includes(p.optionImageFit)
    ? p.optionImageFit
    : "cover";
  const optionStyle = {
    "--one-choice-columns": optionColumns,
    "--one-choice-min-height": optionMinHeight + "px",
    "--one-choice-selected-bg": p.selectedOptionBackgroundColor || "color-mix(in srgb, var(--one-accent) 10%, white)",
    "--one-choice-selected-fg": p.selectedOptionTextColor || "inherit",
  };
  const toggle = (v) => {
    if (mode === "checkbox" || Array.isArray(chosen)) {
      const values = Array.isArray(chosen) ? chosen : [];
      const next=toggleChoiceSelection(values,v,p.maxSelections);
      if(next.limited){markLimited();return;}
      setSelectionError("");set(next.values);
    } else set(v);
  };
  if (mode === "multiple")
    return <React.Fragment>
      {wrap(<select
        className="one-control"
        multiple
        required={p.required === true}
        id={p.inputId}
        aria-describedby={p.helpId}
        value={Array.isArray(chosen) ? chosen : []}
        onChange={(e) => {
          const next=Array.from(e.target.selectedOptions, (x) => x.value);
          if(bounded&&next.length>maxSelections){markLimited();return;}
          setSelectionError("");set(next);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {renderOptionLabel(o)}
          </option>
        ))}
      </select>)}
      {p.minSelections>0 && <small className="one-muted">Select at least {p.minSelections}.</small>}
      {selectionError && <div role="alert" className="one-muted">{selectionError}</div>}
    </React.Fragment>;
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
            {renderOptionLabel(o)}
          </option>
        ))}
      </select>,
    );
  return (
    <fieldset {...root} style={{ ...root.style, border: 0, padding: 0 }}>
      <legend>{label}</legend>
      <div
        className={"one-choice-options one-choice-options--" + optionLayout}
        style={optionStyle}
      >
        {options.map((o) => (
          <label
            className={[
              "one-choice-option",
              mode === "segmented" ? "one-btn" : "",
              optionLayout === "cards" ? "one-choice-option--card" : "",
              (Array.isArray(chosen) ? chosen.includes(o.value) : chosen === o.value)
                ? "one-choice-option--selected"
                : "",
            ].filter(Boolean).join(" ")}
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
              disabled={bounded && Array.isArray(chosen) && chosen.length>=maxSelections && !chosen.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            {o.image && <OneTenantImage
              src={o.image}
              loadAsset={p.loadAsset}
              alt=""
              className="one-choice-option__image"
              style={{
                height: optionImageHeight,
                objectFit: optionImageFit,
              }}
            />}
            <span className="one-choice-option__label">{o.label}</span>
            {typeof o.price === "number" && <small className="one-choice-option__price">
              {formatOptionPrice(o.price)}
            </small>}
          </label>
        ))}
      </div>
      {p.minSelections>0 && <small className="one-muted">Select at least {p.minSelections}.</small>}
      {selectionError && <div role="alert" className="one-muted">{selectionError}</div>}
    </fieldset>
  );
}
