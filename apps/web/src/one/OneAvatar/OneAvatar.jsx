import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneAvatar(props) {
  const p = { ...props, kind: props.kind || "Avatar" };
  const { kind, root, textContent } = useOneDisplay(p);
  const name = text(p.name || p.label || "User");
  const safe = typeof p.src === "string" && /^https:\/\//i.test(p.src);
  return (
    <div
      {...root}
      style={{
        ...root.style,
        width: "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        className="one-item"
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 44,
          height: 44,
          borderRadius: "50%",
          overflow: "hidden",
          padding: 0,
        }}
      >
        {safe ? (
          <img
            src={p.src}
            alt={name}
            width="44"
            height="44"
            style={{ objectFit: "cover" }}
          />
        ) : (
          name.slice(0, 2).toUpperCase()
        )}
      </span>
      <span>{name}</span>
    </div>
  );
}
