/* MetaDrive standalone registerable component: KioskProductGrid. No external imports. */
export default function KioskProductGrid(props) {
  const p = props || {};
  const fire = (event, value) => { if (typeof p.onAction === 'function') p.onAction({ event, value }); if (typeof p.onChange === 'function' && event === 'change') p.onChange(value); };
  const search = String(p.searchQuery||"").trim().toLowerCase();
  const category = String(p.selectedCategoryId||"");
  const products = (p.products||p.items||[]).filter(x=>(!category||x.categoryId===category)&&(!search||[x.name,x.description,x.barcode,x.sku].join(" ").toLowerCase().includes(search)));
  return <div className="md-widget"><div className="md-grid md-responsive-grid" style={{gridTemplateColumns:`repeat(${p.columns||3},minmax(0,1fr))`}}>{products.map((x,i)=><article className="md-card" key={x.id||i}>{x.image?<img src={x.image} alt={x.name} className="md-img" style={{height:p.imageHeight||120}}/>:<div style={{height:p.imageHeight||120,display:"grid",placeItems:"center",fontSize:44,background:"#eef4f6"}}>{["🍔","🍟","🥤"][i%3]}</div>}<div className="md-pad md-stack" style={{gap:8}}><strong>{x.name}</strong><div className="md-row" style={{justifyContent:"space-between"}}><span className="md-price">{p.currency||"£"}{Number(x.price||0).toFixed(2)}</span><button className="md-btn" onClick={()=>fire("add",{productId:x.id,quantity:1})}>+</button></div></div></article>)}</div></div>;
}
