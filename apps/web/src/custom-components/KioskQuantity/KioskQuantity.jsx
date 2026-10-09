/* MetaDrive standalone registerable component: KioskQuantity. No external imports. */
export default function KioskQuantity(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-row"><button className="md-btn md-soft" aria-label="Decrease quantity" onClick={()=>fire("change",Math.max(p.min??0,(p.value??1)-1))}>−</button><strong aria-live="polite" style={{minWidth:28,textAlign:"center"}}>{p.value??1}</strong><button className="md-btn md-soft" aria-label="Increase quantity" onClick={()=>fire("change",Math.min(p.max??99,(p.value??1)+1))}>+</button></div></div>;
}
