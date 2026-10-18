import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

export default function OneLookup(props) {
  const p = { ...props, kind: props.kind || "Lookup" };
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
  const all = list(p.records || p.options),
    filtered = all.filter((v) =>
      String(
        typeof v === "object"
          ? (v[p.displayField || "Name"] ?? v.Name ?? v.name ?? v.label ?? "")
          : v,
      )
        .toLowerCase()
        .includes(filter.toLowerCase()),
    );
  return (
    <div {...root}>
      <label className="one-label">
        {label}
        <input
          className="one-control"
          type="search"
          placeholder={p.placeholder || "Find record"}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <div
        role="listbox"
        className="one-surface"
        style={{ maxHeight: 180, overflowY: "auto", marginTop: 6 }}
      >
        {filtered.map((v, i) => {
          const id = String(
              typeof v === "object" ? (v.Id ?? v.id ?? v.value ?? "") : v,
            ),
            txt = String(
              typeof v === "object" ? (v.Name ?? v.name ?? v.label ?? id) : v,
            );
          return (
            <button
              key={id}
              className="one-btn one-btn--ghost"
              type="button"
              role="option"
              aria-selected={current === id}
              style={{ width: "100%", justifyContent: "start" }}
              onClick={() => {
                const existing = Array.isArray(current)
                  ? current.map(String)
                  : current
                    ? [String(current)]
                    : [];
                set(
                  p.multiple === true
                    ? existing.includes(id)
                      ? existing.filter((x) => x !== id)
                      : [...existing, id]
                    : id,
                );
                setFilter("");
              }}
            >
              {txt}
            </button>
          );
        })}
        {filtered.length === 0 && <span className="one-muted">No matches</span>}
      </div>
    </div>
  );
}
