/* MetaDrive standalone registerable component: KioskTotals. No external imports. */
export default function KioskTotals(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  return <div className="md-widget"><div className="md-card md-pad md-stack">{[["Subtotal",p.subtotal||0],["Tax",p.tax||0],["Discount",-(p.discount||0)]].map(([label,num])=><div key={label} className="md-row" style={{justifyContent:"space-between"}}><span>{label}</span><span>{p.currency||"£"}{Number(num).toFixed(2)}</span></div>)}<hr style={{border:0,borderTop:"1px solid #e0e8ef",width:"100%"}}/><div className="md-row" style={{justifyContent:"space-between",fontSize:20,fontWeight:800}}><span>Total</span><span>{p.currency||"£"}{Number(p.total??((p.subtotal||0)+(p.tax||0)-(p.discount||0))).toFixed(2)}</span></div></div></div>;
}
