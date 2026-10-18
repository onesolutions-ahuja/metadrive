import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

export default function OneRepeater(props) {
  const p = { ...props, kind: props.kind || "Repeater" };
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
  const rows = Array.isArray(current) ? current : [];
  return (
    <div {...root}>
      <div className="one-row" style={{ justifyContent: "space-between" }}>
        <strong>{label}</strong>
        <button
          className="one-btn"
          type="button"
          onClick={() => set([...rows, ""])}
        >
          + Add
        </button>
      </div>
      <div
        className="one-stack"
        style={{ flexDirection: "column", marginTop: 8 }}
      >
        {rows.map((item, i) => (
          <div className="one-row" key={i}>
            <input
              className="one-control"
              style={{ flex: 1 }}
              value={typeof item === "string" ? item : JSON.stringify(item)}
              onChange={(e) =>
                set(rows.map((r, j) => (j === i ? e.target.value : r)))
              }
            />
            <button
              className="one-btn"
              aria-label={"Remove row " + (i + 1)}
              onClick={() => set(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
