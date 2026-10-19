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
  // A reusable selection-triggered overlay can contain arbitrary nested Page
  // components. The selected record is carried by the shared filter context.
  const selectionKey = String(p.openOnSelectionKey || "");
  React.useEffect(() => {
    if (!selectionKey || !p.pageSessionKey || typeof window === "undefined") return;
    const receive = (event) => {
      const data = event.detail;
      if (data?.pageSessionKey !== p.pageSessionKey ||
          data.filterKey !== selectionKey) return;
      setOpen(Boolean(data.value || data.recordId));
    };
    window.addEventListener("metadrive:page-filter-selected", receive);
    return () => window.removeEventListener("metadrive:page-filter-selected", receive);
  }, [selectionKey, p.pageSessionKey, setOpen]);
  return (
    <div {...css}>
      {!selectionKey && <button type="button" className="one-btn" onClick={() => setOpen(true)}>
        {p.openLabel || "Open"}
      </button>}
      {open && (
        <div
          className="one-overlay-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
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
                onClick={() => setOpen(false)}
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
