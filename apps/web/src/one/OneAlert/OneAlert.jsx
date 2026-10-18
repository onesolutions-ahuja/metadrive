import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneAlert(props) {
  const p = { ...props, kind: props.kind || "Alert" };
  const { kind, root, textContent } = useOneDisplay(p);
  return (
    <aside {...root} role={p.tone === "danger" ? "alert" : "status"}>
      <div className="one-surface one-alert">
        <strong>{p.title || "Notice"}</strong>
        <div>{text(p.message || p.description || "")}</div>
      </div>
    </aside>
  );
}
