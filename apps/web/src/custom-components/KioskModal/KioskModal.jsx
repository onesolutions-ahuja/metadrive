/* MetaDrive standalone registerable component: KioskModal. No external imports. */
export default function KioskModal(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div style={{display:p.show===false?"none":"grid",placeItems:"center",background:"#102b4350",padding:20,borderRadius:14,minHeight:260}}><div className="md-card md-pad md-stack" style={{width:"min(100%,440px)",boxShadow:"0 15px 45px #0002"}}><div className="md-row" style={{justifyContent:"space-between"}}><h3 className="md-title">{p.title||"Details"}</h3><button className="md-btn md-soft" onClick={()=>fire("close",null)}>×</button></div><p>{p.content||"Configure your modal content."}</p>{p.children}</div></div></div>;
}
