import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function Dashboard({ p, rows }) {
  return (
    <section className="one-surface">
      <h3 className="one-heading">{p.title || "Dashboard"}</h3>
      <div
        className="one-grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          marginTop: 12,
        }}
      >
        {rows.map((r, i) => (
          <div className="one-item" key={r.id ?? i}>
            <div className="one-muted">{title(r)}</div>
            <div className="one-metric">{view(r.value ?? r.count ?? "")}</div>
          </div>
        ))}
      </div>
      {!rows.length && (
        <div className="one-empty" role="status">Bind dashboard widgets or records</div>
      )}
    </section>
  );
}

export default function OneDashboardEmbed(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <Dashboard p={p} rows={rows} />
    </div>
  );
}
