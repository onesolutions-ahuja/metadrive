import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function Board({ p, rows }) {
  const field = p.groupField || "status",
    groups = Array.isArray(p.groups)
      ? p.groups
      : [...new Set(rows.map((x) => view(x[field] || "Unassigned")))];
  return (
    <div
      role="region"
      aria-label={p.label || "Board"}
      className="one-grid"
      style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}
    >
      {groups.length === 0 ? <div className="one-empty" role="status">{p.emptyText || "No items to display"}</div> : groups.map((g) => (
        <section className="one-surface" key={String(g)} aria-label={String(view(g))}>
          <h3 className="one-heading">{view(g)}</h3>
          <div
            className="one-stack"
            style={{ flexDirection: "column", marginTop: 10 }}
          >
            {rows
              .filter((r) => view(r[field] || "Unassigned") === String(g))
              .map((r, i) => (
                <button
                  className="one-item one-item--interactive"
                  type="button"
                  key={r.Id ?? r.id ?? i}
                  onClick={() => fire(p, "itemSelect", r)}
                >
                  {title(r)}
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function OneBoard(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <Board p={p} rows={rows} />
    </div>
  );
}
