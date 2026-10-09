/* MetaDrive standalone registerable component: KioskIconTile. No external imports. */
export default function KioskIconTile(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><button className="md-card md-stack" style={{padding:16,alignItems:"center",cursor:"pointer",width:"100%"}} onClick={()=>fire("click",p.value||p.label)}><span style={{fontSize:34}}>{p.icon||"🍔"}</span><strong>{p.label||"Category"}</strong></button></div>;
}
