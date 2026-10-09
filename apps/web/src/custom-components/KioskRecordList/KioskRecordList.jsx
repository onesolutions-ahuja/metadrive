/* MetaDrive standalone registerable component: KioskRecordList. No external imports. */
export default function KioskRecordList(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-card md-stack" style={{gap:0}}>{(p.items||[{id:1,name:"Record 1"},{id:2,name:"Record 2"}]).map((x,i)=><button className="md-row md-pad" key={x.id||i} style={{justifyContent:"space-between",background:"white",border:0,borderBottom:"1px solid #edf1f4",cursor:"pointer",textAlign:"left"}} onClick={()=>fire("select",x)}><span>{x.name||x.label||x.title}</span><span>›</span></button>)}</div></div>;
}
