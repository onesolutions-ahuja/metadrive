/* MetaDrive standalone registerable component: KioskCard. No external imports. */
export default function KioskCard(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><article className="md-card">{p.image&&<img className="md-img" style={{height:p.imageHeight||130}} src={p.image} alt=""/>}<div className="md-pad md-stack"><strong className="md-title">{p.title||"Card title"}</strong><span className="md-muted">{p.description||"Card content"}</span>{p.children}</div></article></div>;
}
