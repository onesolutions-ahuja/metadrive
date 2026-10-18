import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneAccordion(props) {
  const p = { ...props, kind: props.kind || "Accordion" };
  const {
    kind,
    css,
    active,
    setActive,
    expanded,
    setExpanded,
    open,
    setOpen,
    children,
    paneChildren,
    tabRecords,
    categoryField,
    derivedTabs,
    useRecordTabs,
    tabs,
    selectTab,
    safeCount,
    cols,
    tabletCols,
    mobileCols,
    align,
    base,
  } = useOneLayout(p);
  return (
    <div {...css}>
      <div className="one-surface">
        <button
          type="button"
          className="one-btn one-btn--ghost"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            fire(p, "toggle", !expanded);
          }}
        >
          {expanded ? "▾" : "▸"} {p.title || p.label || "Details"}
        </button>
        {expanded && (
          <div style={{ paddingTop: 8 }}>
            {children || p.description || "Details"}
          </div>
        )}
      </div>
    </div>
  );
}
