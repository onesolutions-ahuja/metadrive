/* UNEEngine standalone registerable component: KioskCart. No external imports. */
export default function KioskCart(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  const lines = Array.isArray(p.cartLines) ? p.cartLines : (Array.isArray(p.items) ? p.items : []);
  return <div className="md-widget"><div className="md-card md-pad md-stack"><h3 className="md-title">{p.title||"Your Order"}</h3>{lines.length===0?<p className="md-muted">Your basket is empty.</p>:lines.map((x,i)=><div className="md-row" key={x.id||i} style={{justifyContent:"space-between",borderBottom:"1px solid #eef1f6",paddingBottom:8}}><div><strong>{x.name}</strong><div className="md-muted">Qty: {x.quantity||1}</div></div><strong>{p.currency||"£"}{(Number(x.unitPrice??x.price??0)*Number(x.quantity||1)).toFixed(2)}</strong><button className="md-btn md-soft" aria-label={`Remove ${x.name}`} onClick={()=>fire("remove",{lineId:x.id})}>×</button></div>)}</div></div>;
}
