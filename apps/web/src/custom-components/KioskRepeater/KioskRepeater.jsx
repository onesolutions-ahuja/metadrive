/* MetaDrive standalone registerable component: KioskRepeater. No external imports. */
export default function KioskRepeater(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-grid md-responsive-grid" style={{gridTemplateColumns:`repeat(${p.columns||3},minmax(0,1fr))`}}>{(p.items||[{id:1,title:"Item 1"},{id:2,title:"Item 2"}]).map((x,i)=><button className="md-card md-pad md-stack" style={{cursor:"pointer",textAlign:"left"}} onClick={()=>fire("select",x)} key={x.id||i}><strong>{x.title||x.name||x.label||`Item ${i+1}`}</strong>{x.description&&<span className="md-muted">{x.description}</span>}</button>)}</div></div>;
}
