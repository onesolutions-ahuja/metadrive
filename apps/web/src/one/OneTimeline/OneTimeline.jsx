import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function Timeline({ p, rows }) {
  return (
    <div className="one-surface">
      {rows.map((r, i) => (
        <div
          className="one-row"
          key={r.Id ?? r.id ?? i}
          style={{
            padding: "12px 0",
            borderBottom: "1px solid var(--one-border)",
            alignItems: "start",
          }}
        >
          <span className="one-dot" />
          <div>
            <strong>{title(r)}</strong>
            <div className="one-muted">
              {view(r[p.dateField || "date"] ?? r.createdAt ?? "")}
            </div>
            <div>{view(r.description ?? "")}</div>
          </div>
        </div>
      ))}
      {!rows.length && <div className="one-empty" role="status">No activity</div>}
    </div>
  );
}

export default function OneTimeline(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <Timeline p={p} rows={rows} />
    </div>
  );
}
