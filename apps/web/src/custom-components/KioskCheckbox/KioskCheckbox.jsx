/* MetaDrive standalone registerable component: KioskCheckbox. No external imports. */
export default function KioskCheckbox(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><label className="md-row"><input type="checkbox" checked={!!p.checked} onChange={e=>fire("change",e.target.checked)}/><span>{p.label||"I agree"}</span></label></div>;
}
