/* MetaDrive standalone registerable component: KioskProductDetail. No external imports. */
export default function KioskProductDetail(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><article className="md-card md-pad md-stack">{p.image&&<img className="md-img" src={p.image} alt="" style={{height:220}}/>}<h2 style={{margin:0}}>{p.name||"Selected Product"}</h2><p className="md-muted">{p.description||"Customize your item before adding it."}</p><strong className="md-price">{p.currency||"£"}{Number(p.price||0).toFixed(2)}</strong><button className="md-btn" onClick={()=>fire("add",{id:p.id,quantity:p.quantity||1})}>Add to order</button></article></div>;
}
