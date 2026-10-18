import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneProgress(props) {
  const p = { ...props, kind: props.kind || "Progress" };
  const { kind, root, textContent } = useOneDisplay(p);
  const max = Math.max(1, Number(p.max) || 100),
    value = Math.min(max, Math.max(0, Number(p.value) || 0));
  return (
    <div {...root}>
      <div className="one-row" style={{ justifyContent: "space-between" }}>
        <span>{p.label || "Progress"}</span>
        <span>{Math.round((100 * value) / max)}%</span>
      </div>
      <progress
        className="one-progress"
        max={max}
        value={value}
        aria-label={p.label || "Progress"}
      />
    </div>
  );
}
