import { useOneLayout, options, shared, fire } from "../shared/OneLayout.jsx";
import OneTenantImage from "../shared/OneTenantImage.jsx";

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
      {!p.imageSrc && p.showSurface !== false ? <div className="one-surface">
        <div className="one-heading">{p.title || p.label || "Card"}</div>
        {p.subtitle && <p className="one-muted">{p.subtitle}</p>}
        {p.description && <p className="one-muted">{p.description}</p>}
        {children}
      </div> : <div className={p.showSurface === false ? "" : "one-surface"}
        style={{display:p.imageSrc?"flex":undefined,
          flexDirection:p.imagePosition==="left"?"row-reverse":p.imagePosition==="right"?"row":"column",
          gap:Number(p.gap)>=0?Number(p.gap):12,alignItems:p.imageSrc?"center":undefined}}>
        <div style={{flex:"1 1 0",minWidth:0}}>
          {p.showHeading !== false && <div className="one-heading">{p.title || p.label || "Card"}</div>}
          {p.subtitle && <p className="one-muted">{p.subtitle}</p>}
          {p.description && <p className="one-muted">{p.description}</p>}
          {children}
        </div>
        {p.imageSrc && <OneTenantImage src={p.imageSrc} loadAsset={p.loadAsset} alt={p.imageAlt || ""}
          style={{width:(Math.min(80,Math.max(20,Number(p.imageWidthPercent)||46)))+"%",
            maxHeight:"100%",objectFit:p.imageFit||"contain",borderRadius:8}} />}
      </div>}
    </article>
  );
}
