/* MetaDrive standalone registerable component: KioskCarousel. No external imports. */
export default function KioskCarousel(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-row md-scroll" style={{alignItems:"stretch",paddingBottom:10}}>{(p.items||[{id:1,title:"Promotion 1"},{id:2,title:"Promotion 2"},{id:3,title:"Promotion 3"}]).map((x,i)=><button key={x.id||i} className="md-card" style={{flex:"0 0 200px",textAlign:"left",cursor:"pointer"}} onClick={()=>fire("select",x)}>{x.image?<img className="md-img" style={{height:110}} src={x.image} alt=""/>:<div style={{height:110,background:"#dcf5ef"}}/>}<div className="md-pad"><strong>{x.title||x.name}</strong></div></button>)}</div></div>;
}
