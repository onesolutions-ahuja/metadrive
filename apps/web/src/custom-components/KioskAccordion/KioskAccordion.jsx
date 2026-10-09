/* MetaDrive standalone registerable component: KioskAccordion. No external imports. */
export default function KioskAccordion(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-card"><button className="md-row md-pad" aria-expanded={!!p.open} style={{border:0,background:"white",width:"100%",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>fire("change",!p.open)}><strong>{p.title||"More details"}</strong><span>{p.open?"−":"+"}</span></button>{p.open&&<div className="md-pad" style={{borderTop:"1px solid #eef2f6"}}>{p.children||p.content||"Details here"}</div>}</div></div>;
}
