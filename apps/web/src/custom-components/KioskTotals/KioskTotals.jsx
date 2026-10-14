/* MetaDrive standalone registerable component: KioskTotals. No external imports. */
export default function KioskTotals(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  const cart = Array.isArray(p.cartLines) ? p.cartLines : [];
  const subtotal = p.subtotal ?? cart.reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.unitPrice||0),0);
  return <div className="md-widget"><div className="md-card md-pad md-stack">{[["Subtotal",subtotal],["Tax",p.tax||0],["Discount",-(p.discount||0)]].map(([label,num])=><div key={label} className="md-row" style={{justifyContent:"space-between"}}><span>{label}</span><span>{p.currency||"£"}{Number(num).toFixed(2)}</span></div>)}<hr style={{border:0,borderTop:"1px solid #e0e8ef",width:"100%"}}/><div className="md-row" style={{justifyContent:"space-between",fontSize:20,fontWeight:800}}><span>Total</span><span>{p.currency||"£"}{Number(p.total??(subtotal+(p.tax||0)-(p.discount||0))).toFixed(2)}</span></div></div></div>;
}
