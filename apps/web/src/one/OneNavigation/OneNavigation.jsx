import {
  useOneActions,
  css,
  arr,
  label,
  value,
  fire,
} from "../shared/OneActions.jsx";

export default function OneNavigation(props) {
  const p = { ...props, kind: props.kind || "Navigation" };
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
    <nav {...root} aria-label={p.label || "Navigation"}>
      <div
        className="one-row"
        style={{
          flexDirection: p.orientation === "vertical" ? "column" : "row",
          alignItems: "stretch",
        }}
      >
        {options.map((o, i) => (
          <button
            className={
              "one-btn " +
              (selected === i ? "one-btn--primary" : "one-btn--ghost")
            }
            type="button"
            key={i}
            aria-current={selected === i ? "page" : undefined}
            onClick={() => {
              setSelected(i);
              fire(p, "navigate", value(o));
            }}
          >
            {label(o)}
          </button>
        ))}
      </div>
      {!options.length && <div className="one-empty" role="status">Add navigation items</div>}
    </nav>
  );
}
