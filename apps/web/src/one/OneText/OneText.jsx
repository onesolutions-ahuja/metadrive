import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneText(props) {
  const p = { ...props, kind: props.kind || "Text" };
  const { kind, root, textContent } = useOneDisplay(p);
  return (
    <div
      {...root}
      style={{
        ...root.style,
        fontSize: Math.max(10, Number(p.fontSize) || 16),
        whiteSpace: "pre-wrap",
      }}
    >
      {text(textContent) || "Text"}
    </div>
  );
}
