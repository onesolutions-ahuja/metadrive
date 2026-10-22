import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function Chart({ p, rows }) {
  const entries = rows
    .slice(0, 16)
    .map((r, i) => ({
      name: view(r.label ?? r.name ?? r.Name ?? r.x ?? i + 1),
      n: Number(r.value ?? r.count ?? r.y ?? 0) || 0,
    }));
  const max = Math.max(1, ...entries.map((x) => Math.abs(x.n))),
    type = p.chartType || "bar";
  if (!entries.length) return <div className="one-empty" role="status">No chart data</div>;
  if (type === "donut") {
    const total = entries.reduce((s, x) => s + Math.max(0, x.n), 0) || 1;
    let acc = 0;
    const circles = entries.map((e, i) => {
      const pct = (100 * Math.max(0, e.n)) / total,
        offset = -acc;
      acc += pct;
      return (
        <circle
          key={i}
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke={i % 2 ? "#83bbdc" : "var(--one-accent)"}
          strokeWidth="18"
          strokeDasharray={pct + " " + (100 - pct)}
          strokeDashoffset={offset}
          pathLength="100"
          transform="rotate(-90 50 50)"
        />
      );
    });
    return (
      <svg
        width="100%"
        viewBox="0 0 100 100"
        role="img"
        aria-label={p.label || "Donut chart"}
      >
        {circles}
        <text
          x="50"
          y="53"
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
        >
          {view(p.title || "Total")}
        </text>
      </svg>
    );
  }
  const points = entries.map((x, i) => [
    ((i + 0.5) * 320) / entries.length,
    170 - (Math.max(0, x.n) * 145) / max,
  ]);
  return (
    <svg
      viewBox="0 0 320 210"
      width="100%"
      role="img"
      aria-label={p.label || "Data chart"}
    >
      {type === "line" ? (
        <polyline
          fill="none"
          stroke="var(--one-accent)"
          strokeWidth="3"
          points={points.map((q) => q.join(",")).join(" ")}
        />
      ) : (
        entries.map((x, i) => (
          <rect
            key={i}
            x={(i * 320) / entries.length + 3}
            y={points[i][1]}
            width={Math.max(3, 320 / entries.length - 6)}
            height={170 - points[i][1]}
            rx="3"
            fill="var(--one-accent)"
          />
        ))
      )}
      {entries.map((e, i) => (
        <text
          key={i}
          x={((i + 0.5) * 320) / entries.length}
          y="192"
          textAnchor="middle"
          fontSize="8"
          fill="currentColor"
        >
          {e.name.slice(0, 12)}
        </text>
      ))}
    </svg>
  );
}

export default function OneChart(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <div className="one-surface">
        <Chart p={p} rows={rows} />
      </div>
    </div>
  );
}
