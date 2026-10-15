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

// Existing component identities, with metadata-controlled kiosk presentation updates.

// The same library components remain independently editable; V3 is a versioned
// publication because existing tenant-owned V2 definitions must not be overwritten.
const railSource = `

export default function CategoryRail({title='MENU',records=[],pageState={},nameField='Name',imageField='ImageUrl',
 brandLogoUrl='',brandLabel='YOUR BRAND',accentColor='#ed002d',backgroundColor='#ffffff',onAction,preview=false}){
 const categories=(records||[]).filter(item=>item.IsActive!==false).slice().sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
 const selected=pageState.selectedCategoryId||categories[0]?.Id;
 React.useEffect(()=>{
  if(!preview && !pageState.selectedCategoryId && categories.length){
   const first=categories[0];
   void onAction({event:'selectCategory',value:{categoryId:first.Id,categoryName:first[nameField]||first.Name}});
  }
 },[categories.length,pageState.selectedCategoryId,preview]);
 return <nav aria-label="Product categories" style={{height:'100%',minHeight:0,boxSizing:'border-box',background:backgroundColor,fontFamily:'Arial,sans-serif'}}>
  <div style={{height:145,display:'grid',placeItems:'center',borderBottom:'1px solid #f0f0f0',padding:12,boxSizing:'border-box'}}>
   {brandLogoUrl?<img src={brandLogoUrl} referrerPolicy="no-referrer" alt={brandLabel} style={{maxWidth:'82%',maxHeight:118,objectFit:'contain'}}/>
    :<strong style={{fontSize:21,fontWeight:900,color:accentColor,textAlign:'center'}}>{brandLabel}</strong>}
  </div>
  {categories.map((item,index)=><button type="button" key={item.Id||index}
   aria-current={selected===item.Id?'page':undefined}
   onClick={()=>onAction({event:'selectCategory',value:{categoryId:item.Id,categoryName:item[nameField]||item.Name}})}
   style={{display:'flex',width:'100%',alignItems:'center',gap:10,padding:'14px 12px',
    minHeight:69,background:selected===item.Id?'#fff0f2':'transparent',border:0,borderBottom:'1px solid #ededed',
    borderLeft:'5px solid '+(selected===item.Id?accentColor:'transparent'),cursor:'pointer',
    color:selected===item.Id?accentColor:'#181818',textAlign:'left'}}>
    {item[imageField]?<img src={String(item[imageField])} alt="" referrerPolicy="no-referrer"
      style={{height:44,width:44,objectFit:'contain'}}/>
      :<span aria-hidden="true" style={{height:44,width:44,display:'grid',placeItems:'center',fontSize:25}}>🍗</span>}
    <span style={{fontWeight:800,textTransform:'uppercase',fontSize:12,lineHeight:1.2}}>{item[nameField]||item.Name}</span>
   </button>)}
  {!categories.length&&<p style={{padding:14,fontSize:12}}>No product categories available.</p>}
 </nav>;
}

`;
const railCss=`.md-commerce-rail{background:white}`;
const cardCss=`
.md-commerce-grid{display:grid;grid-template-columns:repeat(var(--commerce-columns,3),minmax(0,1fr));gap:12px}
.md-commerce-card{background:#fff;border:1px solid #eee;border-radius:3px;overflow:hidden;box-shadow:none;min-width:0}
.md-commerce-card img{width:100%;height:170px;object-fit:contain}
.md-commerce-btn{background:#ec002e;color:#fff;border:0;border-radius:5px;padding:12px;font-weight:800;cursor:pointer}
.md-commerce-btn:disabled{opacity:.45;cursor:not-allowed}
.md-commerce-small{font-size:12px;color:#777}
.md-commerce-price{color:#1b1b1b;font-weight:900}
.md-commerce-error{color:#a62424}
@media(max-width:780px){.md-commerce-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:510px){.md-commerce-grid{grid-template-columns:repeat(1,minmax(0,1fr))}}
`;
const footerSource=`
export default function CheckoutBar({title='SHOW BASKET',accentColor='#92b200',currencySymbol='£',onAction,sessionId}){
 const [basket,setBasket]=React.useState({Lines:[],Basket:null});
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const refresh=async()=>{const r=await onAction({event:'load',value:{}});setBasket({Lines:r?.outputs?.Lines||[],Basket:r?.outputs?.Basket||null})};
 React.useEffect(()=>{void refresh().catch(e=>setError(String(e)))},[sessionId]);
 const lines=basket.Lines||[];const total=Number(basket.Basket?.Total||lines.reduce((v,l)=>v+Number(l.LineTotal||0),0));
 const checkout=async()=>{if(busy||!lines.length)return;setBusy(true);setError('');
 try{const r=await onAction({event:'submit',value:{}});if(!r?.outputs?.Submitted)throw Error('Order could not be submitted');
 await onAction({event:'confirmation',value:{}})}
 catch(e){setError(e?.message||String(e))}finally{setBusy(false)}};
 return <footer style={{height:'100%',boxSizing:'border-box',background:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 20px',fontFamily:'Arial,sans-serif'}}>
  <button type="button" onClick={()=>onAction({event:'basket',value:{}})} style={{background:'#fff',color:'#171717',border:0,fontSize:17,fontWeight:800,cursor:'pointer'}}>{title} ({lines.length}) ▲</button>
  {error&&<span role="alert" style={{color:'#b11',fontSize:12}}>{error}</span>}
  <button type="button" disabled={!lines.length||busy} onClick={checkout}
   style={{background:accentColor,color:'#fff',border:0,borderRadius:8,fontSize:18,fontWeight:900,padding:'16px 28px',minWidth:220,cursor:'pointer'}}>
   {busy?'SUBMITTING…':'PLACE ORDER'}　{currencySymbol}{total.toFixed(2)}
  </button>
 </footer>;
}
`;

const composeVariant=(baseline,alternative,baseName,alternativeName)=>{
 const original=baseline.replace('export default function '+baseName,'function Original'+baseName);
 const variant=alternative.replace('export default function '+alternativeName,'function Alternate'+baseName);
 return original+'\n'+variant+'\nexport default function '+baseName+'(props){return props.presentationVariant==="portrait" ? <Alternate'+baseName+' {...props}/> : <Original'+baseName+' {...props}/>;}';
};
const [nav,grid,basket,status]=commerceComponents;
const variantSetting=setting('presentationVariant','Presentation variant','TEXT','standard',99);
const productSource=grid.jsxSource
 .replace("imageField='ImageUrl',\n primaryButtonLabel", "imageField='ImageUrl',pageState={},categoryField='CategoryId',filterField='Subcategory',\n bestsellerField='IsBestseller',featuredBorderColor='#92b000',chipColor='#ed002d',imageHeight=168,\n primaryButtonLabel")
 .replace(" const active=(records||[]).filter(p=>p.IsActive!==false);",
   " const categoryId=pageState?.selectedCategoryId;\n const [filter,setFilter]=React.useState('ALL');\n const active=(records||[]).filter(p=>p.IsActive!==false && (!categoryId || String(p[categoryField])===String(categoryId)));\n const filters=['ALL',...new Set(active.map(p=>p[filterField]).filter(Boolean).map(String))];\n const visible=active.filter(p=>filter==='ALL'||String(p[filterField])===filter);")
 .replace(" return <section style={{padding:0,maxWidth:'none'}}>",
   " return <section className='md-kiosk-products' style={{padding:0,maxWidth:'none',fontFamily:'Arial,sans-serif'}}>") 
 .replace("  <h2 style={{color:'#171717',fontSize:32,fontWeight:900,letterSpacing:'-.025em',margin:'0 0 20px'}}>{title}</h2>",
   "  <div style={{display:'flex',alignItems:'start',justifyContent:'space-between',marginBottom:10}}><h2 style={{color:'#171717',fontSize:38,fontFamily:'Impact,Arial Narrow,sans-serif',fontWeight:900,textTransform:'uppercase',letterSpacing:'-.025em',margin:0}}>{pageState?.selectedCategoryName||title}</h2><div aria-hidden='true' style={{display:'flex',gap:10,marginTop:-20}}>{[0,1,2].map(i=><span key={i} style={{width:22,height:55,background:chipColor}}/>)}</div></div>\n  <div role='group' aria-label='Product filters' style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:18}}>{filters.map(name=><button type='button' key={name} onClick={()=>setFilter(name)} style={{border:'1px solid '+(filter===name?chipColor:'#e5e5e5'),background:'#fff',color:filter===name?chipColor:'#161616',borderRadius:5,padding:'10px 19px',fontSize:12,fontWeight:800,cursor:'pointer'}}>{name.toUpperCase()}</button>)}</div>")
 .replace("{active.map(p=><article className=\"md-commerce-card\" key={p.Id}>",
   "{visible.map(p=><article className={'md-commerce-card'+(p[bestsellerField]===true?' md-kiosk-featured':'')} key={p.Id} style={p[bestsellerField]===true?{border:'2px solid '+featuredBorderColor}:undefined}>")
 .replace("    {p[imageField]&&<img src={String(p[imageField])} referrerPolicy=\"no-referrer\" alt=\"\" style={{width:'100%',height:215,objectFit:'cover'}}/>}",
   "    {p[bestsellerField]===true&&<div className='md-kiosk-ribbon' style={{background:featuredBorderColor}}>BESTSELLER</div>}\n    {p[imageField]?<img src={String(p[imageField])} referrerPolicy='no-referrer' alt='' style={{width:'100%',height:imageHeight,objectFit:'contain',padding:10,boxSizing:'border-box'}}/>:<div role='img' aria-label='Product image unavailable' style={{height:imageHeight,background:'#fff',display:'grid',placeItems:'center',color:'#aaa',fontSize:12}}>PRODUCT IMAGE</div>}")
 .replace("     <strong style={{display:'block',fontSize:19,color:'#171717'}}>",
   "     <strong style={{display:'block',fontSize:15,color:'#171717',minHeight:32}}>")
 .replace("     <p className=\"md-commerce-small\">{p.Description||''}</p>",
   "     {p.Description&&<p className='md-commerce-small' style={{fontSize:11}}>{p.Description}</p>}")
 .replace("     <p className=\"md-commerce-price\">{money(readField(p,priceField))}</p>",
   "     <p className='md-commerce-price' style={{fontSize:16,margin:'6px 0'}}>{money(readField(p,priceField))}</p>")
 .replace("style={{background:accentColor,width:'100%'}}",
   "style={{background:accentColor,width:'100%',borderRadius:3,fontSize:12,padding:9}}")
 .replace("  {!loading&&!active.length&&<p>No available products.</p>}",
   "  {!loading&&!visible.length&&<p>No products in this category.</p>}");

const portraitCss=cardCss.replace(/(^|\n)(\.[^{\n]+)\{/g, '$1.md-kiosk-reference $2{');
const wrapProduct=grid.jsxSource.replace('export default function CommerceProductGrid','function OriginalCommerceProductGrid')
 +'\n'+productSource.replace('export default function CommerceProductGrid','function PortraitCommerceProductGrid')
 +'\nexport default function CommerceProductGrid(props){return props.presentationVariant==="portrait" ? <div className="md-kiosk-reference"><PortraitCommerceProductGrid {...props}/></div> : <OriginalCommerceProductGrid {...props}/>;}';
export const kioskPresentationComponents=[
 {...nav,jsxSource:composeVariant(nav.jsxSource,railSource,'CommerceNav','CategoryRail'),cssSource:nav.cssSource+railCss,
  propertyDefinitions:[...nav.propertyDefinitions,variantSetting,setting('categories','Categories','TEXT','RECOMMENDS,COUPONS,BUCKETS,BOX MEALS,BURGERS & WRAPS,JUST CHICKEN,KIDS MEALS,DESSERTS,VEGE,EXTRAS',100)]},
 {...grid,jsxSource:wrapProduct,cssSource:grid.cssSource+portraitCss,propertyDefinitions:[...grid.propertyDefinitions,variantSetting]},
 {...basket,jsxSource:composeVariant(basket.jsxSource,footerSource,'CommerceBasketPanel','CheckoutBar'),cssSource:basket.cssSource,
  propertyDefinitions:[...basket.propertyDefinitions,variantSetting]},
 status
];
