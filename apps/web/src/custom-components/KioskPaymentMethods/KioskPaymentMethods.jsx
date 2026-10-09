/* MetaDrive standalone registerable component: KioskPaymentMethods. No external imports. */
export default function KioskPaymentMethods(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-stack">{(p.methods||["Card","Cash","Pay at Counter"]).map(x=><button key={x} className="md-card md-row md-pad" style={{cursor:"pointer",borderColor:p.value===x?"#087e79":"#e1e8ee",justifyContent:"space-between"}} onClick={()=>fire("change",x)}><span>{x==="Card"?"💳":x==="Cash"?"💷":"🧾"} {x}</span><span>{p.value===x?"●":"○"}</span></button>)}</div></div>;
}
