/* MetaDrive standalone registerable component: KioskColumn. No external imports. */
export default function KioskColumn(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-stack" style={{gap:p.gap??12,alignItems:p.align||"stretch"}}>{p.children||"Column content"}</div></div>;
}
