/* MetaDrive standalone registerable component: KioskBottomBar. No external imports. */
export default function KioskBottomBar(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><footer className="md-card md-row" style={{padding:12,justifyContent:"space-between"}}><button className="md-btn md-soft" onClick={()=>fire("back",null)}>{p.backLabel||"← Back"}</button><span className="md-muted">{p.message||"Review your selection"}</span><button className="md-btn" onClick={()=>fire("next",null)}>{p.nextLabel||"Continue →"}</button></footer></div>;
}
