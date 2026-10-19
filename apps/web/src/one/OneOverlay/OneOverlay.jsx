import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneOverlay(props) {
  const p = { ...props, kind: props.kind || "Overlay" };
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
  // The same session-scoped selection event used by reusable navigation/grids.
  React.useEffect(() => {
    if (!p.pageSessionKey || !p.openOnFilterKey || typeof window==="undefined") return;
    const selected = (event) => {
      const detail=event.detail;
      if(detail?.pageSessionKey!==p.pageSessionKey
        ||detail?.filterKey!==p.openOnFilterKey)return;
      setOpen(Boolean(detail.value || detail.recordId));
    };
    window.addEventListener("metadrive:page-filter-selected",selected);
    return () => window.removeEventListener("metadrive:page-filter-selected",selected);
  },[p.pageSessionKey,p.openOnFilterKey,setOpen]);
  const close=()=>{
    setOpen(false);
    if(p.openOnFilterKey && p.pageSessionKey && typeof window!=="undefined")
      window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected",{
        detail:{pageSessionKey:p.pageSessionKey,filterKey:p.openOnFilterKey,
          value:"",recordId:"",label:"",sourceObjectApiName:""}
      }));
  };
  return (
    <div {...css}>
      {p.hideTrigger !== true && <button type="button" className="one-btn" onClick={() => setOpen(true)}>
        {p.openLabel || "Open"}
      </button>}
      {open && (
        <div
          className="one-overlay-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={p.title || "Dialog"}
            className={
              "one-surface one-overlay-panel" +
              (p.mode === "drawer" ? " one-drawer" : "")
            }
          >
            <div
              className="one-row"
              style={{ justifyContent: "space-between" }}
            >
              <strong>{p.title || "Dialog"}</strong>
              <button
                type="button"
                className="one-btn one-btn--ghost"
                aria-label="Close"
                onClick={close}
              >
                ×
              </button>
            </div>
            <div style={{ paddingTop: 12 }}>
              {children || p.description || "Content"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
