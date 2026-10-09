/* MetaDrive standalone registerable component: KioskDivider. No external imports. */
export default function KioskDivider(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div role="separator" style={{height:p.vertical? (p.height||32):1,width:p.vertical?1:"100%",background:p.color||"#dde6ef",margin:p.margin||0}} /></div>;
}
