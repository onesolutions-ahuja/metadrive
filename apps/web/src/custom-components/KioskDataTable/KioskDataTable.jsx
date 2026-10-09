/* MetaDrive standalone registerable component: KioskDataTable. No external imports. */
export default function KioskDataTable(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-scroll md-card"><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}><thead><tr>{(p.columns||[{key:"name",label:"Name"},{key:"status",label:"Status"}]).map(x=><th key={x.key} style={{padding:12,background:"#edf4f9"}}>{x.label}</th>)}</tr></thead><tbody>{(p.rows||[{id:1,name:"Example",status:"Active"}]).map((row,i)=><tr key={row.id||i} onClick={()=>fire("select",row)} style={{cursor:"pointer"}}>{(p.columns||[{key:"name"},{key:"status"}]).map(col=><td key={col.key} style={{padding:12,borderTop:"1px solid #edf1f4"}}>{String(row[col.key]??"")}</td>)}</tr>)}</tbody></table></div></div>;
}
