/* MetaDrive standalone registerable component: KioskConfirmation. No external imports. */
export default function KioskConfirmation(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-card md-pad md-stack" style={{alignItems:"center",textAlign:"center"}}><div style={{fontSize:50}}>✅</div><h2 style={{margin:0}}>{p.title||"Order confirmed!"}</h2><span className="md-muted">{p.message||"Thank you. Your order is being prepared."}</span><strong style={{fontSize:26}}>{p.orderNumber||"#0001"}</strong><button className="md-btn" onClick={()=>fire("restart",null)}>{p.buttonLabel||"Start new order"}</button></div></div>;
}
