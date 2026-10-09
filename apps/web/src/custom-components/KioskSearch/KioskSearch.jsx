/* MetaDrive standalone registerable component: KioskSearch. No external imports. */
export default function KioskSearch(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><input aria-label={p.label||"Search"} className="md-input" type="search" placeholder={p.placeholder||"Search menu..."} value={p.value??""} onChange={e=>fire("change",e.target.value)} /></div>;
}
