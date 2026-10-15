// Each reusable component is a small independent Page Builder block with typed settings.
// React is provided by the existing sandbox compiler; external packages are forbidden.
const setting=(propertyKey,label,kind,defaultValue,displayOrder)=>({
 propertyKey,label,kind,defaultValue,displayOrder,isBindable:true
});
const component=(apiName,label,description,jsxSource,cssSource,propertyDefinitions,resize={defaultWidth:560,defaultHeight:440,minWidth:180,minHeight:90})=>({
 apiName,label,description,surfaces:['page'],resize,jsxSource,cssSource,
 publicationStatus:'Published',propertyDefinitions
});
const buttonStyles=`
.md-commerce-grid{display:grid;grid-template-columns:repeat(var(--commerce-columns,3),minmax(0,1fr));gap:18px}
@media(max-width:760px){.md-commerce-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:480px){.md-commerce-grid{grid-template-columns:minmax(0,1fr)}}
.md-commerce-btn{border:0;background:#e4002b;color:white;padding:15px 20px;border-radius:10px;cursor:pointer;font-weight:700}
.md-commerce-btn:disabled{cursor:default;opacity:.5}
.md-commerce-ghost{background:#fff;color:#e4002b;border:1px solid #bfd2dc}
.md-commerce-card{border:1px solid #ededed;background:white;border-radius:18px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.055)}
.md-commerce-small{color:#586672;font-size:13px}
.md-commerce-error{color:#a62424;font-size:13px}
.md-commerce-price{font-weight:750;color:#202020}
`;
const navSource=`
export default function CommerceNav({title='Order kiosk',subtitle='Choose your favourites',accentColor='#e4002b',onAction}){
 const [busy,setBusy]=React.useState('');
 const act=async(event)=>{setBusy(event);try{await onAction({event,value:{}})}finally{setBusy('')}};
 return <header style={{padding:'12px 24px',background:'#fff',borderBottom:'1px solid #e5e5e5',minHeight:74,boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
  <div><strong style={{fontSize:29,fontWeight:900,color:'#161616',letterSpacing:'-.02em'}}>{title}</strong><div className="md-commerce-small">{subtitle}</div></div>
  <nav style={{display:'flex',gap:8}} aria-label="Kiosk navigation">
   <button type="button" className="md-commerce-btn md-commerce-ghost" disabled={!!busy} onClick={()=>act('catalog')}>Menu</button>
   <button type="button" className="md-commerce-btn" disabled={!!busy} style={{background:accentColor}} onClick={()=>act('basket')}>Your basket</button>
  </nav>
 </header>
}
`;
const menuSource=`
export default function CommerceProductGrid({title='Choose your meal',records=[],loading=false,columns=3,
 currencySymbol='£',nameField='Name',priceField='DefaultPrice',imageField='ImageUrl',
 primaryButtonLabel='Customise',accentColor='#e4002b',onAction}){
 const [selected,setSelected]=React.useState(null),[groups,setGroups]=React.useState([]),
 [options,setOptions]=React.useState([]),[chosen,setChosen]=React.useState([]),
 [qty,setQty]=React.useState(1),[pending,setPending]=React.useState(false),[error,setError]=React.useState(''),[info,setInfo]=React.useState('');
 const readField=(p,k)=>p?.[k]??p?.DefaultPrice??p?.Price__c??0;
 const active=(records||[]).filter(p=>p.IsActive!==false);
 const money=(v)=>currencySymbol+Number(v||0).toFixed(2);
 const open=async(p)=>{
  setSelected(p);setChosen([]);setGroups([]);setOptions([]);setQty(1);setError('');setInfo('');
  try{const r=await onAction({event:'options',value:{productId:p.Id}});
   const data=r?.outputs||{};const linked=new Set((data.Assignments||[]).map(a=>a.GroupId));
   setGroups((data.Groups||[]).filter(g=>linked.has(g.Id)).sort((a,b)=>(a.SortOrder||0)-(b.SortOrder||0)));
   setOptions((data.Options||[]).filter(o=>linked.has(o.GroupId)));
  }catch(e){setError(e.message||String(e))}
 };
 const toggle=(id,group)=>{
  setChosen(current=>{
   if(current.includes(id))return current.filter(x=>x!==id);
   const max=Number(group.MaxSelections||999);
   const existing=current.filter(x=>options.find(o=>o.Id===x)?.GroupId===group.Id);
   return existing.length>=max?current:[...current,id];
  })
 };
 const valid=groups.every(g=>{
  const n=chosen.filter(id=>options.find(o=>o.Id===id)?.GroupId===g.Id).length;
  return n>=Number(g.MinSelections||0)&&n<=Number(g.MaxSelections||999);
 });
 const add=async()=>{
  if(!selected||!valid||pending)return;
  setPending(true);setError('');
  try{
   const selections=chosen.map(Id=>({Id}));
   const response=await onAction({event:'add',value:{productId:selected.Id,quantity:qty,selections}});
   if(!response?.outputs?.Added)throw Error('This item could not be added. Check your selections.');
   setSelected(null);setInfo('Added to your basket');
  }catch(e){setError(e.message||String(e))}
  finally{setPending(false)}
 };
 return <section style={{padding:0,maxWidth:'none'}}>
  <h2 style={{color:'#171717',fontSize:32,fontWeight:900,letterSpacing:'-.025em',margin:'0 0 20px'}}>{title}</h2>
  {loading&&<p role="status">Loading menu…</p>}
  {info&&<p role="status" style={{color:'#17664b'}}>{info}</p>}
  {error&&!selected&&<p role="alert" className="md-commerce-error">{error}</p>}
  <div className="md-commerce-grid" style={{'--commerce-columns':String(Math.max(1,Math.min(5,Number(columns)||3)))}}>
   {active.map(p=><article className="md-commerce-card" key={p.Id}>
    {p[imageField]&&<img src={String(p[imageField])} referrerPolicy="no-referrer" alt="" style={{width:'100%',height:215,objectFit:'cover'}}/>}
    <div style={{padding:12}}>
     <strong style={{display:'block',fontSize:19,color:'#171717'}}>{p[nameField]||'Product'}</strong>
     <p className="md-commerce-small">{p.Description||''}</p>
     <p className="md-commerce-price">{money(readField(p,priceField))}</p>
     <button type="button" className="md-commerce-btn" style={{background:accentColor,width:'100%'}} onClick={()=>open(p)}>{primaryButtonLabel}</button>
    </div>
   </article>)}
  </div>
  {!loading&&!active.length&&<p>No available products.</p>}
  {selected&&<div role="dialog" aria-modal="true" aria-label={'Customise '+(selected[nameField]||'product')}
    style={{position:'fixed',inset:0,zIndex:50,background:'#0009',display:'grid',placeItems:'center',padding:12}}>
    <div style={{width:'min(540px,100%)',maxHeight:'90vh',overflowY:'auto',background:'white',padding:20,borderRadius:16,boxSizing:'border-box'}}>
     <h3>Customise {selected[nameField]}</h3>
     {groups.map(g=><fieldset key={g.Id} style={{border:'1px solid #e2e7e9',borderRadius:10,marginBottom:10}}>
      <legend style={{fontWeight:700}}>{g.Name} <span className="md-commerce-small">({g.MinSelections||0}–{g.MaxSelections||'any'})</span></legend>
      {options.filter(o=>o.GroupId===g.Id).map(o=><label key={o.Id} style={{display:'flex',gap:8,padding:'7px 0',alignItems:'center'}}>
       <input type="checkbox" checked={chosen.includes(o.Id)} onChange={()=>toggle(o.Id,g)} />
       <span style={{flex:1}}>{o.Name}</span><span className="md-commerce-price">{Number(o.PriceAdjustment)>0?'+'+money(o.PriceAdjustment):'Included'}</span>
      </label>)}
     </fieldset>)}
     <label>Quantity <input type="number" min="1" max="20" step="1" value={qty}
       onChange={e=>setQty(Math.min(20,Math.max(1,Number(e.target.value)||1)))}
       style={{width:70,padding:8,borderRadius:8,border:'1px solid #ccc'}} /></label>
     <p className="md-commerce-price">Total: {money((Number(readField(selected,priceField))+chosen.reduce((t,id)=>t+Number(options.find(o=>o.Id===id)?.PriceAdjustment||0),0))*qty)}</p>
     {!valid&&<p className="md-commerce-error">Complete all required selections.</p>}
     {error&&<p className="md-commerce-error" role="alert">{error}</p>}
     <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}>
      <button type="button" className="md-commerce-btn md-commerce-ghost" onClick={()=>{setSelected(null);setError('')}}>Cancel</button>
      <button type="button" className="md-commerce-btn" style={{background:accentColor}}
       disabled={!valid||pending} onClick={add}>{pending?'Adding…':'Add to basket'}</button>
     </div>
    </div>
   </div>}
 </section>
}
`;
const basketSource=`
export default function CommerceBasketPanel({title='Your basket',currencySymbol='£',accentColor='#e4002b',
 emptyText='Your basket is empty',onAction,sessionId}){
 const [data,setData]=React.useState({Basket:null,Lines:[]}),[busy,setBusy]=React.useState(''),
 [error,setError]=React.useState(''),[success,setSuccess]=React.useState('');
 const load=React.useCallback(async()=>{
  const r=await onAction({event:'load',value:{}});
  setData({Basket:r?.outputs?.Basket||null,Lines:r?.outputs?.Lines||[]})
 },[onAction]);
 React.useEffect(()=>{let active=true;(async()=>{try{if(active)await load()}catch(e){if(active)setError(e.message||String(e))}})();
 return ()=>{active=false}},[sessionId]);
 const action=async(event,value={})=>{
  setBusy(event);setError('');
  try{const r=await onAction({event,value});
   if(event==='remove'&&!r?.outputs?.Removed)throw Error('Could not remove the item');
   if(event==='submit'){
    if(!r?.outputs?.Submitted)throw Error('Add an item before submitting your order');
    setSuccess('Order submitted. Payment will be collected separately.');
   }
   if(event==='submit')await onAction({event:'confirmation',value:{}});
   else await load()
  }catch(e){setError(e.message||String(e))}
  finally{setBusy('')}
 };
 const lines=data.Lines||[];const total=Number(data.Basket?.Total||lines.reduce((v,l)=>v+Number(l.LineTotal||0),0));
 return <section style={{padding:24,background:'#fff',minHeight:'100%',boxSizing:'border-box'}}>
  <h2 style={{color:'#161616',fontSize:26,fontWeight:900}}>{title}</h2>
  {error&&<p className="md-commerce-error" role="alert">{error}</p>}
  {success&&<p role="status" style={{color:'#14664a'}}>{success}</p>}
  {!lines.length&&<p>{emptyText}</p>}
  {lines.map(l=><article className="md-commerce-card" key={l.Id}
   style={{padding:14,marginBottom:10,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
   <div><strong>{l.Name}</strong><div className="md-commerce-small">{l.Quantity||1} × {currencySymbol}{Number(l.UnitPrice||0).toFixed(2)}</div></div>
   <div><strong className="md-commerce-price">{currencySymbol}{Number(l.LineTotal||0).toFixed(2)}</strong>
    <button type="button" className="md-commerce-btn md-commerce-ghost" style={{display:'block',marginTop:5}}
     disabled={!!busy} onClick={()=>action('remove',{lineId:l.Id})}>Remove</button>
   </div>
  </article>)}
  <div style={{display:'flex',justifyContent:'space-between',fontSize:20,fontWeight:800,padding:'18px 0'}}>
   <span>Total</span><span>{currencySymbol}{total.toFixed(2)}</span>
  </div>
  <button type="button" className="md-commerce-btn" style={{width:'100%',background:accentColor}}
   disabled={!lines.length||!!busy} onClick={()=>action('submit')}>{busy==='submit'?'Submitting…':'Place order'}</button>
  <p className="md-commerce-small">No payment is taken here. Order status changes to Submitted.</p>
 </section>
}
`;
const infoSource=`
export default function CommerceStatus({title='Order received',message='Your order is being prepared',
 accentColor='#e4002b',onAction}){
 return <div style={{textAlign:'center',padding:26}}>
  <div style={{fontSize:44}} aria-hidden="true">✓</div>
  <h2 style={{color:accentColor}}>{title}</h2>
  <p>{message}</p>
  <button type="button" className="md-commerce-btn" style={{background:accentColor}} onClick={()=>onAction({event:'catalog',value:{}})}>Back to menu</button>
 </div>
}
`;
export const commerceComponents=[
 component('MD_CommerceNavigationV2','Commerce Navigation','Reusable responsive menu/basket navigation block.',
 navSource,buttonStyles,[
  setting('title','Heading','TEXT','Order kiosk',1),setting('subtitle','Subtitle','TEXT','Choose your favourites',2),
  setting('accentColor','Accent colour','COLOR','#e4002b',3)
 ],{defaultWidth:900,defaultHeight:88,minWidth:180,minHeight:60}),
 component('MD_CommerceProductGridV2','Commerce Product Grid','Object-backed product list with live modifier editor and Flow events.',
 menuSource,buttonStyles,[
  setting('title','Heading','TEXT','Choose your meal',1),setting('columns','Cards per row','NUMBER',3,2),
  setting('currencySymbol','Currency symbol','TEXT','£',3),setting('nameField','Product name field','OBJECT_FIELD','Name',4),
  setting('priceField','Price field','OBJECT_FIELD','DefaultPrice',5),setting('imageField','Image field','OBJECT_FIELD','ImageUrl',6),
  setting('primaryButtonLabel','Button label','TEXT','Customise',7),setting('accentColor','Accent colour','COLOR','#e4002b',8)
 ],{defaultWidth:1050,defaultHeight:640,minWidth:260,minHeight:240}),
 component('MD_CommerceBasketPanelV2','Commerce Basket Panel','Draft Order basket with server-managed lines, removal and submission.',
 basketSource,buttonStyles,[
  setting('title','Heading','TEXT','Your basket',1),setting('currencySymbol','Currency symbol','TEXT','£',2),
  setting('emptyText','Empty state','TEXT','Your basket is empty',3),setting('accentColor','Accent colour','COLOR','#e4002b',4)
 ],{defaultWidth:560,defaultHeight:620,minWidth:260,minHeight:240}),
 component('MD_CommerceStatusV2','Commerce Status','Reusable status and return navigation.',
 infoSource,buttonStyles,[
  setting('title','Heading','TEXT','Order received',1),setting('message','Message','TEXT','Your order is being prepared',2),
  setting('accentColor','Accent colour','COLOR','#e4002b',3)
 ],{defaultWidth:540,defaultHeight:300,minWidth:200,minHeight:140})
];
