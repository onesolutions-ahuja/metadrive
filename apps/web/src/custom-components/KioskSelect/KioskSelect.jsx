/* MetaDrive standalone registerable component: KioskSelect. No external imports. */
export default function KioskSelect(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><label className="md-stack" style={{gap:5}}><span>{p.label||"Select option"}</span><select className="md-input" value={p.value??""} onChange={e=>fire("change",e.target.value)}><option value="">Choose...</option>{(p.options||["Option A","Option B"]).map(x=><option key={typeof x==="string"?x:x.value} value={typeof x==="string"?x:x.value}>{typeof x==="string"?x:x.label}</option>)}</select></label></div>;
}
