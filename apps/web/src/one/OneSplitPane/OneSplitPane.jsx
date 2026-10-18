import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneSplitPane(props) {
  const p = { ...props, kind: props.kind || "SplitPane" };
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
        style={{ alignItems: "stretch", flexWrap: "nowrap" }}
      >
        <div
          style={{
            flex:
              "0 0 " +
              Math.min(85, Math.max(15, Number(p.splitRatio) || 50)) +
              "%",
            minWidth: 0,
          }}
        >
          {p.left || p.first || paneChildren[0] || null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {p.right || p.second || paneChildren.slice(1)}
        </div>
      </div>
    </div>
  );
}
