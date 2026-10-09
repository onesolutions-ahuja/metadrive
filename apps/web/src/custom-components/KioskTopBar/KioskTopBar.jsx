/* MetaDrive standalone registerable component: KioskTopBar. No external imports. */
export default function KioskTopBar(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><header className="md-card md-row md-compact-row" style={{padding:"10px 16px",justifyContent:"space-between",gap:12}}><div className="md-row">{p.logo&&<img src={p.logo} alt="" style={{width:38,height:38,objectFit:"contain"}}/>}<strong>{p.title||"Order Here"}</strong></div><div className="md-row"><button className="md-btn md-soft" onClick={()=>fire("language",p.language||"English")}>{p.language||"English"}</button><button className="md-btn" onClick={()=>fire("cart",null)}>Cart ({p.count??0})</button></div></header></div>;
}
