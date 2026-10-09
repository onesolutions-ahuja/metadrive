/* MetaDrive standalone registerable component: KioskProgress. No external imports. */
export default function KioskProgress(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-stack" style={{gap:6}}><div className="md-row" style={{justifyContent:"space-between"}}><span>{p.label||"Progress"}</span><span>{Math.round(Math.min(100,Math.max(0,p.value??40)))}%</span></div><div role="progressbar" aria-valuenow={p.value??40} aria-valuemin={0} aria-valuemax={100} style={{height:10,borderRadius:20,background:"#e1eaf1",overflow:"hidden"}}><div style={{width:`${Math.min(100,Math.max(0,p.value??40))}%`,height:"100%",background:"#087e79"}}/></div></div></div>;
}
