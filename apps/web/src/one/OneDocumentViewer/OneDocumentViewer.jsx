import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function Document({ p }) {
  const url = p.src || p.url || p.documentUrl,
    valid = typeof url === "string" && /^https:\/\//i.test(url);
  if (!valid) return <div className="one-empty" role="status">Select a document</div>;
  const isImage = /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url);
  return (
    <section className="one-surface">
      <h3 className="one-heading">{p.title || "Document"}</h3>
      {isImage ? (
        <img
          src={url}
          alt={p.title || "Document"}
          className="one-file-preview"
          loading="lazy"
        />
      ) : (
        <iframe
          src={url}
          title={p.title || "Document"}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{
            display: "block",
            width: "100%",
            height: Math.max(200, Number(p.viewerHeight) || 380),
            border: 0,
          }}
        />
      )}
    </section>
  );
}

export default function OneDocumentViewer(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <Document p={p} rows={rows} />
    </div>
  );
}
