import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneBadge(props) {
  const p = { ...props, kind: props.kind || "Badge" };
  const { kind, root, textContent } = useOneDisplay(p);
  return (
    <span
      {...root}
      style={{ ...root.style, width: "auto", display: "inline-flex" }}
    >
      <span className="one-badge" role="status">
        {text(p.text || p.label || p.value || "Status")}
      </span>
    </span>
  );
}
