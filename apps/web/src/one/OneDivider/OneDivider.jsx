import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneDivider(props) {
  const p = { ...props, kind: props.kind || "Divider" };
  const { kind, root, textContent } = useOneDisplay(p);
  return (
    <div {...root} role="separator">
      <hr
        style={{
          border: 0,
          borderTop: "1px solid var(--one-border)",
          margin: "8px 0",
        }}
      />
    </div>
  );
}
