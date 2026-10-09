/* MetaDrive standalone registerable component: KioskOrderType. No external imports. */
export default function KioskOrderType(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-grid" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}>{(p.options||["Eat In","Takeaway"]).map(x=><button key={x} className="md-card md-pad" style={{cursor:"pointer",borderColor:p.value===x?"#087e79":"#e1e8ee",background:p.value===x?"#e7f9f4":"white",minHeight:90}} onClick={()=>fire("change",x)}><div style={{fontSize:26}}>{x==="Eat In"?"🍽️":"🛍️"}</div><strong>{x}</strong></button>)}</div></div>;
}
