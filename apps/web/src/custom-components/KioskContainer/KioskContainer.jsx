/* MetaDrive standalone registerable component: KioskContainer. No external imports. */
export default function KioskContainer(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div style={{maxWidth:p.maxWidth||"1200px",margin:"auto",padding:p.padding??20,background:p.background||"transparent",borderRadius:p.radius||0,minHeight:p.minHeight||0}}>{p.children||p.text||"Container — place your content here"}</div></div>;
}
