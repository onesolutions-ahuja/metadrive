import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneGrid(props) {
  const p = { ...props, kind: props.kind || "Grid" };
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
        className="one-grid"
        style={{
          "--one-grid-desktop": cols,
          "--one-grid-tablet": tabletCols,
          "--one-grid-mobile": mobileCols,
        }}
      >
        {children ||
          options(p.items).map((v, i) => (
            <div className="one-item" key={i}>
              {v}
            </div>
          ))}
      </div>
    </div>
  );
}
