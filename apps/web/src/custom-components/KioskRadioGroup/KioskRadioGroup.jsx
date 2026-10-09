/* MetaDrive standalone registerable component: KioskRadioGroup. No external imports. */
export default function KioskRadioGroup(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><fieldset style={{border:0,padding:0}}><legend>{p.label||"Choose one"}</legend><div className="md-stack">{(p.options||["Small","Medium","Large"]).map(x=><label key={x} className="md-row"><input type="radio" name={p.name||"kiosk-radio"} checked={p.value===x} onChange={()=>fire("change",x)}/>{x}</label>)}</div></fieldset></div>;
}
