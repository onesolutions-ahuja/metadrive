/* MetaDrive standalone registerable component: KioskImage. No external imports. */
export default function KioskImage(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><img className="md-img" src={p.src||"https://placehold.co/800x480/e7eff5/465c71?text=Image"} alt={p.alt||""} style={{height:p.height||220,borderRadius:p.radius??16,objectFit:p.fit||"cover"}} /></div>;
}
