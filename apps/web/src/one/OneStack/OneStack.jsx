import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneStack(props) {
  const p = { ...props, kind: props.kind || "Stack" };
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
      <div
        className="one-stack"
        data-phone-stack="true"
        style={{
          ...base,
          flexDirection: p.direction === "column" ? "column" : "row",
          flexWrap: p.wrap === false ? "nowrap" : "wrap",
        }}
      >
        {children}
      </div>
    </div>
  );
}
