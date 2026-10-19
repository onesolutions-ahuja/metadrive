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
  const lastSelection = React.useRef(null);
  React.useEffect(() => {
    if (!selectionKey || !p.pageSessionKey || typeof window === "undefined") return;
    const receive = (event) => {
      const data = event.detail;
      if (data?.pageSessionKey !== p.pageSessionKey ||
          data.filterKey !== selectionKey) return;
      lastSelection.current = data.value || data.recordId ? data : null;
      setOpen(Boolean(lastSelection.current));
    };
    window.addEventListener("metadrive:page-filter-selected", receive);
    return () => window.removeEventListener("metadrive:page-filter-selected", receive);
  }, [selectionKey, p.pageSessionKey, setOpen]);
  // Child record components are mounted only after the overlay opens. Replay
  // the active selection once they have subscribed, without persisting a
  // potentially sensitive selection in global, shared, or durable storage.
  React.useEffect(() => {
    if (open && lastSelection.current && typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected", {
        detail: lastSelection.current,
      }));
  }, [open]);
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
