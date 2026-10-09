/* MetaDrive standalone registerable component: KioskSpacer. No external imports. */
export default function KioskSpacer(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div aria-hidden="true" style={{height:p.height??24,minHeight:0}} /></div>;
}
