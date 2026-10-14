/* MetaDrive standalone registerable component: KioskCategoryGrid. No external imports. */
export default function KioskCategoryGrid(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function' && p.actionFlows?.[event]) p.onAction({ event, value }); if (typeof p.onChange === 'function' && (event === 'change' || event === 'select')) p.onChange(value); };
  return <div className="md-widget"><div className="md-grid md-responsive-grid" style={{gridTemplateColumns:`repeat(${p.columns||4},minmax(0,1fr))`}}>{(p.categories||p.items||[]).map((x,i)=><button key={x.id||i} className="md-card" onClick={()=>fire("select",x)} style={{cursor:"pointer",padding:0,textAlign:"left"}}>{x.image?<img className="md-img" style={{height:100}} src={x.image} alt=""/>:<div style={{height:100,background:"#edf6f5",display:"grid",placeItems:"center",fontSize:32}}>{["🍔","🍟","🥤","🍦"][i%4]}</div>}<div className="md-pad"><strong>{x.name||x.label}</strong></div></button>)}</div></div>;
}
