/* UNEEngine standalone registerable component: KioskBadge. No external imports. */
export default function KioskBadge(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><span style={{display:"inline-block",borderRadius:99,padding:"5px 11px",background:p.background||"#e6f8f1",color:p.color||"#126850",fontWeight:700}}>{p.text||"Popular"}</span></div>;
}
