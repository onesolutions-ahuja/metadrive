import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function Form({ p, rows }) {
  const fields = Array.isArray(p.fields) ? p.fields : columns(p, rows);
  const [values, setValues] = React.useState(
    p.value && typeof p.value === "object" ? p.value : rows[0] || {},
  );
  return (
    <form
      className="one-surface one-stack"
      style={{ flexDirection: "column" }}
      onSubmit={(e) => {
        e.preventDefault();
        fire(p, "submit", values);
      }}
    >
      <h3 className="one-heading">{p.title || "Details"}</h3>
      {fields.map((f, i) => {
        const key = f.apiName || f.key || f.name || String(f),
          name = f.label || key,
          type = f.inputType || f.type || "text";
        return (
          <label key={key || i} className="one-label">
            {name}
            <input
              className="one-control"
              type={
                [
                  "number",
                  "date",
                  "email",
                  "tel",
                  "url",
                  "time",
                  "password",
                ].includes(type)
                  ? type
                  : "text"
              }
              value={values[key] ?? ""}
              disabled={p.disabled === true || f.readOnly === true}
              required={f.required === true}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [key]:
                    type === "number"
                      ? e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                      : e.target.value,
                }))
              }
            />
          </label>
        );
      })}
      <button
        type="submit"
        className="one-btn one-btn--primary"
        disabled={p.disabled === true}
      >
        {p.submitLabel || "Save"}
      </button>
    </form>
  );
}

export default function OneRecordForm(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <Form p={p} rows={rows} />
    </div>
  );
}
