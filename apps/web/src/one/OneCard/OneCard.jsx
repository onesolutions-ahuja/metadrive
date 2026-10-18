import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";

export default function OneCard(props) {
  const p = { ...props, kind: props.kind || "Card" };
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
    <article {...css}>
      <div className="one-surface">
        <div className="one-heading">{p.title || p.label || "Card"}</div>
        {p.subtitle && <p className="one-muted">{p.subtitle}</p>}
        {p.description && <p className="one-muted">{p.description}</p>}
        {children}
      </div>
    </article>
  );
}
