/* UNEEngine standalone registerable component: KioskRow. No external imports. */
export default function KioskRow(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-row" style={{justifyContent:p.justify||"flex-start",alignItems:p.align||"center",gap:p.gap??12,flexWrap:p.wrap===false?"nowrap":"wrap"}}>{p.children||"Row content"}</div></div>;
}
