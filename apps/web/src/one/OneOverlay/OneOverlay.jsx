import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";
import OneTenantImage from "../shared/OneTenantImage.jsx";
import { useModalAccessibility } from "../shared/accessibilityHooks";

export default function OneOverlay(props) {
  const p = { ...props, kind: props.kind || "Overlay" };
  const { kind, css, active, setActive, expanded, setExpanded, open, setOpen, children, paneChildren, tabRecords, categoryField, derivedTabs, useRecordTabs, tabs, selectTab, safeCount, cols, tabletCols, mobileCols, align, base } = useOneLayout(p);
  const [selectedRecordId,setSelectedRecordId] = React.useState("");
  const triggerRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  React.useEffect(() => {
    if (!p.pageSessionKey || !p.openOnFilterKey || typeof window==="undefined") return;
    const selected = event => {
      const detail=event.detail;
      if(detail?.pageSessionKey!==p.pageSessionKey || detail?.filterKey!==p.openOnFilterKey)return;
      setSelectedRecordId(String(detail.recordId || detail.value || ""));
      setOpen(Boolean(detail.value || detail.recordId));
    };
    window.addEventListener("metadrive:page-filter-selected",selected);
    return () => window.removeEventListener("metadrive:page-filter-selected",selected);
  },[p.pageSessionKey,p.openOnFilterKey,setOpen]);
  const record = Array.isArray(p.records) ? p.records.find(r=>String(r.Id??r.id??"")===selectedRecordId) : null;
  const safeField = field => typeof field==="string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(field) ? field : "";
  const fieldValue = field => record?.[safeField(field)] ?? "";
  const title = String(fieldValue(p.selectedTitleFieldApiName) || p.title || "Details");
  const image = fieldValue(p.selectedImageFieldApiName);
  const description = String(fieldValue(p.selectedDescriptionFieldApiName)||"");
  const selectedPrice = fieldValue(p.selectedPriceFieldApiName);
  let priceLabel = "";
  try { if(p.selectedPriceFieldApiName && p.currencyCode && selectedPrice!=="") priceLabel = new Intl.NumberFormat(undefined,{style:"currency",currency:p.currencyCode}).format(Number(selectedPrice)); } catch { priceLabel = ""; }
  const close=React.useCallback(()=>{
    setOpen(false);
    if(p.openOnFilterKey && p.pageSessionKey && typeof window!=="undefined") window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected",{detail:{pageSessionKey:p.pageSessionKey,filterKey:p.openOnFilterKey,value:"",recordId:"",label:"",sourceObjectApiName:""}}));
  },[setOpen,p.openOnFilterKey,p.pageSessionKey]);
  useModalAccessibility(React,open,dialogRef,close);

  return <div {...css}>
    {p.hideTrigger !== true && <button ref={triggerRef} type="button" className="one-btn" onClick={() => setOpen(true)}>{p.openLabel || "Open"}</button>}
    {open && <div className="one-overlay-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={p.title || "Dialog"} className={"one-surface one-overlay-panel" + (p.mode === "drawer" ? " one-drawer" : "")}>
        <div className="one-row" style={{justifyContent:"space-between"}}>
          <strong>{p.title || "Dialog"}</strong>
          <button type="button" className="one-btn one-btn--ghost" aria-label="Close" onClick={close}>×</button>
        </div>
        <div style={{paddingTop:12}}>
          {p.showSelectedRecord === true && record && <section className="one-stack" style={{flexDirection:"column",gap:12}}>
            {typeof image==="string" && image && <OneTenantImage src={image} loadAsset={p.loadAsset} alt={title} style={{width:"100%",maxHeight:Math.max(80,Math.min(900,Number(p.imageHeight)||280)),objectFit:["contain","cover","fill","scale-down"].includes(p.imageFit)?p.imageFit:"contain",aspectRatio:["1/1","4/3","16/9","3/4"].includes(p.imageAspectRatio)?p.imageAspectRatio:undefined}} />}
            <h3 className="one-heading">{title}</h3>{description && <p>{description}</p>}{priceLabel && <strong>{priceLabel}</strong>}
            {["add","flow"].includes(p.confirmBehavior) && <button type="button" className="one-btn one-btn--primary" onClick={() => {
              if (p.confirmBehavior==="add" && p.cartTargetKey && p.pageSessionKey && typeof window!=="undefined") {
                window.dispatchEvent(new CustomEvent("metadrive:page-cart-add",{detail:{pageSessionKey:p.pageSessionKey,cartTargetKey:p.cartTargetKey,record}})); close();
              } else if (p.confirmBehavior==="flow" && p.actionFlows?.confirm) Promise.resolve(fire(p,"confirm",record)).then(close).catch(()=>{});
            }}>{p.confirmLabel||"Add to basket"}</button>}
          </section>}
          {children || (p.showSelectedRecord === true ? null : p.description || "Content")}
        </div>
      </div>
    </div>}
  </div>;
}