import {
  css,
  records,
  view,
  title,
  fire,
  columns,
} from "../shared/OneData.jsx";

function TreeNode({ node, p, depth = 0 }) {
  const [open, setOpen] = React.useState(true);
  const kids = Array.isArray(node.children) ? node.children : [];
  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      <div className="one-row">
        <button
          type="button"
          className="one-btn one-btn--ghost"
          style={{ minHeight: 28, padding: 2 }}
          onClick={() => {
            if (kids.length) setOpen(!open);
            else fire(p, "select", node);
          }}
          aria-expanded={kids.length ? open : undefined}
        >
          {kids.length ? (open ? "▾" : "▸") : "•"} {title(node)}
        </button>
      </div>
      {open &&
        kids.map((kid, i) => (
          <TreeNode
            key={kid.Id ?? kid.id ?? i}
            node={kid}
            p={p}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export default function OneTree(p) {
  const root = css(p),
    rows = records(p);
  return (
    <div {...root}>
      <div className="one-surface">
        {rows.map((r, i) => (
          <TreeNode key={r.Id ?? r.id ?? i} node={r} p={p} />
        ))}
      </div>
    </div>
  );
}
