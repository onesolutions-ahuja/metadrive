import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneIcon(props) {
  const p = { ...props, kind: props.kind || "Icon" };
  const { kind, root, textContent } = useOneDisplay(p);
  return (
    <span
      {...root}
      role="img"
      aria-label={p.label || "Icon"}
      style={{
        ...root.style,
        display: "inline-block",
        width: "auto",
        fontSize: p.fontSize || 22,
      }}
    >
      {p.icon || "★"}
    </span>
  );
}
