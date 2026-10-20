import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

export default function OneRepeater(props) {
  const p = { ...props, kind: props.kind || "Repeater" };
  const {
    kind,
    root,
    local,
    setLocal,
    filter,
    setFilter,
    current,
    set,
    label,
    wrap,
    options,
  } = useOneInputs(p);
  const rows = Array.isArray(current) ? current : [];
  const recordRows=Array.isArray(p.records)?p.records:[];
  if(p.recordTitleFieldApiName){
    const titleField=String(p.recordTitleFieldApiName);
    const valueField=String(p.recordValueFieldApiName||"Id");
    const subtitleField=String(p.recordSubtitleFieldApiName||"");
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(titleField)
      || !/^[A-Za-z][A-Za-z0-9_]*$/.test(valueField)
      || (subtitleField&&!/^[A-Za-z][A-Za-z0-9_]*$/.test(subtitleField)))
      return <div {...root} role="alert">Select valid record fields for this repeater.</div>;
    return (
      <div {...root} className={String(root.className||"")+" one-stack"}>
        {label && <strong>{label}</strong>}
        {recordRows.map((record,index)=>{
          const id=String(record?.[valueField]??"");
          const title=String(record?.[titleField]??"");
          const subtitle=subtitleField?String(record?.[subtitleField]??""):"";
          if(!id||!title)return null;
          return <button className="one-item one-item--interactive" type="button"
            key={id||index} onClick={()=>{
              if(p.pageSessionKey&&p.selectionFilterKey&&typeof window!=="undefined")
                window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected",{
                  detail:{pageSessionKey:p.pageSessionKey,filterKey:p.selectionFilterKey,
                    value:id,recordId:id,label:title,sourceObjectApiName:p.objectApiName||""}
                }));
              if(p.pageSessionKey&&p.selectionFilterKey
                &&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p.selectionFilterKey)
                &&typeof window!=="undefined")
                window.dispatchEvent(new CustomEvent("metadrive:page-local-state",{
                  detail:{pageSessionKey:p.pageSessionKey,key:p.selectionFilterKey,value:id}
                }));
              if(p.actionFlows?.itemSelect)fire(p,"itemSelect",record);
            }}>
              <strong>{title}</strong>
              {subtitle&&<small className="one-muted">{subtitle}</small>}
            </button>;
        })}
        {!recordRows.length && <span className="one-muted">{p.emptyText||"No records"}</span>}
      </div>
    );
  }
  return (
    <div {...root}>
      <div className="one-row" style={{ justifyContent: "space-between" }}>
        <strong>{label}</strong>
        <button
          className="one-btn"
          type="button"
          onClick={() => set([...rows, ""])}
        >
          + Add
        </button>
      </div>
      <div
        className="one-stack"
        style={{ flexDirection: "column", marginTop: 8 }}
      >
        {rows.map((item, i) => (
          <div className="one-row" key={i}>
            <input
              className="one-control"
              style={{ flex: 1 }}
              value={typeof item === "string" ? item : JSON.stringify(item)}
              onChange={(e) =>
                set(rows.map((r, j) => (j === i ? e.target.value : r)))
              }
            />
            <button
              className="one-btn"
              aria-label={"Remove row " + (i + 1)}
              onClick={() => set(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
