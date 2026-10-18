import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneMetric(props) {
  const p = { ...props, kind: props.kind || "Metric" };
  const { kind, root, textContent } = useOneDisplay(p);
  return (
    <div {...root}>
      <div className="one-surface">
        <div className="one-muted">{p.label || "Total"}</div>
        <div className="one-metric">{text(p.value ?? "0")}</div>
        {p.subtitle && <div className="one-muted">{p.subtitle}</div>}
      </div>
    </div>
  );
}
