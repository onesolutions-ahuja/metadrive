import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneContainer(props) {
  const p = { ...props, kind: props.kind || "Container" };
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
    <section {...css} aria-label={p.label || "Container"}>
      <div
        className="one-surface"
        style={{
          ...base,
          display: "flex",
          flexDirection: p.direction === "row" ? "row" : "column",
          gap: "var(--one-gap)",
        }}
      >
        {children}
      </div>
    </section>
  );
}
