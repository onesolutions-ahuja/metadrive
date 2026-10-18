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
  return (
    <div {...css}>
      <button type="button" className="one-btn" onClick={() => setOpen(true)}>
        {p.openLabel || "Open"}
      </button>
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
