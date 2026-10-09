/* MetaDrive standalone registerable component: KioskText. No external imports. */
export default function KioskText(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div style={{fontSize:p.fontSize||16,fontWeight:p.weight||400,color:p.color||"inherit",textAlign:p.align||"left",whiteSpace:"pre-wrap"}}>{p.text||"Add text here"}</div></div>;
}
