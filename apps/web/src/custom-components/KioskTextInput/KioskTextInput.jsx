/* MetaDrive standalone registerable component: KioskTextInput. No external imports. */
export default function KioskTextInput(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><label className="md-stack" style={{gap:5}}><span>{p.label||"Your name"}</span><input className="md-input" type={p.type||"text"} placeholder={p.placeholder||"Enter text"} value={p.value??""} onChange={e=>fire("change",e.target.value)} /></label></div>;
}
