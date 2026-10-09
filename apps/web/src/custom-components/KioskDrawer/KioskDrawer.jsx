/* MetaDrive standalone registerable component: KioskDrawer. No external imports. */
export default function KioskDrawer(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div style={{display:p.show===false?"none":"flex",justifyContent:p.side==="left"?"flex-start":"flex-end",background:"#17304726",minHeight:260,borderRadius:14}}><div className="md-card md-pad md-stack" style={{width:"min(100%,360px)"}}><div className="md-row" style={{justifyContent:"space-between"}}><h3 className="md-title">{p.title||"Your options"}</h3><button className="md-btn md-soft" onClick={()=>fire("close",null)}>×</button></div>{p.children||p.content||"Drawer content"}</div></div></div>;
}
