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
  const chipMode = p.tabStyle === "pill" || p.showPanel === false || p.wrapTabs === false || p.showAllTab === true;
  return (
    <div {...css}>
      <div className="one-tabs" role="tablist" aria-label={p.label || "Tabs"}
        style={chipMode ? {display: "flex", flexWrap: p.wrapTabs === false ? "nowrap" : "wrap",
          overflowX: p.wrapTabs === false ? "auto" : "visible", gap: Number(p.gap) >= 0 ? Number(p.gap) : 8} : undefined}>
        {p.showAllTab === true && <button type="button" className="one-tab"
          role="tab" aria-selected={active === -1}
          onClick={() => {
            setActive(-1);
            if (p.pageSessionKey && p.filterKey && typeof window !== "undefined")
              window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected", {
                detail:{pageSessionKey:p.pageSessionKey,filterKey:p.filterKey,value:"",recordId:"",label:p.allTabLabel||"All",
                  sourceObjectApiName:p.objectApiName||""}
              }));
          }}
          style={{borderRadius:p.tabStyle==="pill"?999:undefined,
            backgroundColor:active===-1?(p.accentColor||"#E4002B"):undefined,
            color:active===-1?"#FFFFFF":undefined}}>
          {p.allTabLabel || "All"}
        </button>}
        {tabs.map((name, i) => (
          <button type="button" className="one-tab" key={i} role="tab"
            aria-selected={active === i} onClick={() => selectTab(name, i)}
            style={{borderRadius:p.tabStyle==="pill"?999:undefined,
              backgroundColor:active===i?(p.accentColor||"#E4002B"):undefined,
              color:active===i?"#FFFFFF":undefined}}>
            {name}
          </button>
        ))}
      </div>
      {p.showPanel !== false && <div className="one-surface" role="tabpanel" style={{marginTop:8}}>
        {Array.isArray(children)
          ? children[active]
          : (p.panels && p.panels[active]?.content) || children || tabs[active] || "No categories"}
      </div>}
    </div>
  );
}
