import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneTabs(props) {
  const p = { ...props, kind: props.kind || "Tabs" };
  const { kind, css, active, setActive, expanded, setExpanded, open, setOpen, children, paneChildren, tabRecords, categoryField, derivedTabs, useRecordTabs, tabs, selectTab, safeCount, cols, tabletCols, mobileCols, align, base } = useOneLayout(p);
  const chipMode = p.tabStyle === "pill" || p.showPanel === false || p.wrapTabs === false || p.showAllTab === true;
  const id = React.useId().replace(/[^A-Za-z0-9_-]/g,"");
  const panelId = "one-tabs-panel-" + id;
  const tabId = index => "one-tabs-tab-" + id + "-" + index;
  const moveTab = (event,index) => {
    const count=tabs.length+(p.showAllTab===true?1:0);
    if (!count) return;
    let next=index;
    if(event.key==="ArrowRight") next=(index+1)%count;
    else if(event.key==="ArrowLeft") next=(index-1+count)%count;
    else if(event.key==="Home") next=0;
    else if(event.key==="End") next=count-1;
    else return;
    event.preventDefault();
    if(p.showAllTab===true && next===0) setActive(-1);
    else { const actual=next-(p.showAllTab===true?1:0); selectTab(tabs[actual],actual); }
    document.getElementById(tabId(next))?.focus();
  };
  const activeTabId=p.showAllTab===true && active===-1 ? tabId(0) : tabId((p.showAllTab===true?1:0)+active);
  return <div {...css}>
    <div className="one-tabs" role="tablist" aria-label={p.label || "Tabs"} style={chipMode?{display:"flex",flexWrap:p.wrapTabs===false?"nowrap":"wrap",overflowX:p.wrapTabs===false?"auto":"visible",gap:Number(p.gap)>=0?Number(p.gap):8}:undefined}>
      {p.showAllTab===true && <button id={tabId(0)} type="button" className="one-tab" role="tab" aria-selected={active===-1} aria-controls={p.showPanel!==false?panelId:undefined} tabIndex={active===-1?0:-1} onKeyDown={event=>moveTab(event,0)} onClick={()=>{
        setActive(-1);
        if(p.pageSessionKey&&p.filterKey&&typeof window!=="undefined") window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected",{detail:{pageSessionKey:p.pageSessionKey,filterKey:p.filterKey,value:"",recordId:"",label:p.allTabLabel||"All",sourceObjectApiName:p.objectApiName||""}}));
      }} style={{borderRadius:p.tabStyle==="pill"?999:undefined,backgroundColor:active===-1?(p.accentColor||"#E4002B"):undefined,color:active===-1?"#FFFFFF":undefined}}>{p.allTabLabel||"All"}</button>}
      {tabs.map((name,i)=>{const index=i+(p.showAllTab===true?1:0);return <button id={tabId(index)} type="button" className="one-tab" key={i} role="tab" aria-selected={active===i} aria-controls={p.showPanel!==false?panelId:undefined} tabIndex={active===i?0:-1} onKeyDown={event=>moveTab(event,index)} onClick={()=>selectTab(name,i)} style={p.tabStyle==="pill"?{borderRadius:999,backgroundColor:active===i?(p.accentColor||"#E4002B"):undefined,color:active===i?"#FFFFFF":undefined}:undefined}>{name}</button>;})}
    </div>
    {p.showPanel!==false && <div id={panelId} className="one-surface" role="tabpanel" tabIndex={0} aria-labelledby={activeTabId} style={{marginTop:8}}>
      {Array.isArray(children)?children[active]:(p.panels&&p.panels[active]?.content)||children||tabs[active]||"No categories"}
    </div>}
  </div>;
}