/* MetaDrive standalone registerable component: KioskTabs. No external imports. */
export default function KioskTabs(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div role="tablist" className="md-row md-scroll">{(p.items||["Menu","Offers","About"]).map((x,i)=><button role="tab" aria-selected={(p.active??0)===i} key={i} className="md-btn" style={{background:(p.active??0)===i?"#087e79":"#edf3fa",color:(p.active??0)===i?"white":"#22354e"}} onClick={()=>fire("select",i)}>{typeof x==="string"?x:x.label}</button>)}</div></div>;
}
