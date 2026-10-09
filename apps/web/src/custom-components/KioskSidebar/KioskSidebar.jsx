/* MetaDrive standalone registerable component: KioskSidebar. No external imports. */
export default function KioskSidebar(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><nav className="md-stack" aria-label="Category navigation">{(p.items||["Popular","Burgers","Sides","Drinks"]).map((x,i)=><button key={i} className="md-btn" style={{background:(p.active??0)===i?"var(--md-accent,#087e79)":"#edf3fa",color:(p.active??0)===i?"white":"#22354e",textAlign:"left"}} onClick={()=>fire("select",x)}>{typeof x==="string"?x:x.label}</button>)}</nav></div>;
}
