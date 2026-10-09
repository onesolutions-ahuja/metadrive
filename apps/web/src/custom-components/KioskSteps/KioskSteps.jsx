/* MetaDrive standalone registerable component: KioskSteps. No external imports. */
export default function KioskSteps(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-row md-compact-row" style={{justifyContent:"space-between"}}>{(p.steps||["Choose","Review","Pay"]).map((step,i)=><div className="md-row" key={i}><span style={{display:"grid",placeItems:"center",width:30,height:30,borderRadius:"50%",background:i<=(p.current??0)?"#087e79":"#e8eef4",color:i<=(p.current??0)?"white":"#476"}}>{i+1}</span><span>{step}</span></div>)}</div></div>;
}
