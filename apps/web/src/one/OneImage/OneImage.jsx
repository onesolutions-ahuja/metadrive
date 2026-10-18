import { useOneDisplay, css, text } from "../shared/OneDisplay.jsx";

export default function OneImage(props) {
  const p = { ...props, kind: props.kind || "Image" };
  const { kind, root, textContent } = useOneDisplay(p);
  const src = p.src || p.imageUrl;
  const safe = typeof src === "string" && /^https:\/\//i.test(src);
  return (
    <figure {...root} style={{ ...root.style, margin: 0 }}>
      {safe ? (
        <img
          src={src}
          alt={p.alt || p.label || ""}
          loading="lazy"
          className="one-file-preview"
          style={{ width: "100%", objectFit: p.fit || "contain" }}
        />
      ) : (
        <div className="one-item one-empty">Image not configured</div>
      )}
      {p.caption && <figcaption className="one-muted">{p.caption}</figcaption>}
    </figure>
  );
}
