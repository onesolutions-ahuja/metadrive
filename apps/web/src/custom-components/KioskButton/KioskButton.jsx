/* MetaDrive standalone registerable component: KioskButton. No external imports. */
export default function KioskButton(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><button className={`md-btn ${p.variant==="secondary"?"md-soft":""}`} style={{width:p.fullWidth?"100%":"auto",background:p.background,color:p.color}} disabled={p.disabled} onClick={()=>fire("click",p.value??null)}>{p.label||"Tap to continue"}</button></div>;
}
