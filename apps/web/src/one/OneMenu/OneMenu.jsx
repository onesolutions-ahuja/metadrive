import {
  useOneActions,
  css,
  arr,
  label,
  value,
  fire,
} from "../shared/OneActions.jsx";

export default function OneMenu(props) {
  const p = { ...props, kind: props.kind || "Menu" };
  const {
    kind,
    root,
    query,
    setQuery,
    selected,
    setSelected,
    open,
    setOpen,
    localPage,
    setPage,
    options,
  } = useOneActions(p);
  return (
    <div {...root}>
      <button
        type="button"
        className="one-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        {p.label || "Options"} ▾
      </button>
      {open && (
        <div
          className="one-surface"
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 20,
            minWidth: 180,
          }}
        >
          {options.map((o, i) => (
            <button
              role="menuitem"
              type="button"
              key={i}
              className="one-btn one-btn--ghost"
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "start",
              }}
              onClick={() => {
                fire(p, "select", value(o));
                setOpen(false);
              }}
            >
              {label(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
