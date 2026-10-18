import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneTabs(props) {
  const p = { ...props, kind: props.kind || "Tabs" };
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
      <div className="one-tabs" role="tablist" aria-label={p.label || "Tabs"}>
        {tabs.map((name, i) => (
          <button
            type="button"
            className="one-tab"
            key={i}
            role="tab"
            aria-selected={active === i}
            onClick={() => selectTab(name, i)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="one-surface" role="tabpanel" style={{ marginTop: 8 }}>
        {Array.isArray(children)
          ? children[active]
          : (p.panels && p.panels[active]?.content) ||
            children ||
            tabs[active] ||
            "No categories"}
      </div>
    </div>
  );
}
