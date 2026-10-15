import {commerceComponents} from './kiosk-phase4-components.mjs';

// The same library components remain independently editable; V3 is a versioned
// publication because existing tenant-owned V2 definitions must not be overwritten.
const railSource = \`
export default function CategoryRail({title='MENU',categories='RECOMMENDS,COUPONS,BUCKETS,BOX MEALS,BURGERS & WRAPS,JUST CHICKEN,KIDS MEALS,DESSERTS,VEGE,EXTRAS',accentColor='#ed002d',onAction}){
 const [selected,setSelected]=React.useState('BURGERS & WRAPS');
 const items=String(categories||'').split(',').map(x=>x.trim()).filter(Boolean);
 return <nav aria-label="Product categories" style={{display:'flex',flexDirection:'column',background:'#fff',height:'100%',boxSizing:'border-box',fontFamily:'Arial,sans-serif'}}>
  <div style={{padding:'27px 16px 30px',fontSize:28,fontWeight:900,textAlign:'center',borderBottom:'1px solid #eee'}}>{title}</div>
  {items.map((item,i)=><button type="button" key={item} aria-current={selected===item?'page':undefined}
   onClick={()=>{setSelected(item);void onAction({event:'catalog',value:{category:item}})}}
   style={{textAlign:'left',display:'flex',alignItems:'center',gap:12,background:selected===item?'#fff0f2':'#fff',
    border:0,borderBottom:'1px solid #eee',borderLeft:selected===item?'5px solid '+accentColor:'5px solid transparent',
    color:selected===item?accentColor:'#181818',fontWeight:selected===item?800:650,fontSize:13,
    padding:'18px 10px',minHeight:61,cursor:'pointer'}}>
   <span aria-hidden="true" style={{fontSize:22,width:29,textAlign:'center'}}>{['🍗','%','🍗','🍱','🍔','🍗','🍟','🍦','🥬','+'][i%10]}</span>
   <span>{item}</span>
  </button>)}
 </nav>;
}
\`;
const railCss=\`.md-commerce-rail{background:white}\`;
const cardCss=\`
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
\`;
const footerSource=\`
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
\`;
const version = (original, apiName, jsxSource, cssSource, settings) => ({
 ...original,apiName,jsxSource,cssSource,
 propertyDefinitions:settings ?? original.propertyDefinitions,
 publicationStatus:'Published'
});
const [nav,grid,basket,status]=commerceComponents;
const define=(key,label,kind,defaultValue,displayOrder)=>({propertyKey:key,label,kind,defaultValue,displayOrder,isBindable:true});
const productSource=grid.jsxSource
 .replace("return <section style={{padding:0,maxWidth:'none'}}>","return <section style={{padding:0,maxWidth:'none',fontFamily:'Arial,sans-serif'}}>") 
 .replace("fontSize:32,fontWeight:900","fontSize:30,fontWeight:900")
 .replace("height:215,objectFit:'cover'","height:170,objectFit:'contain'")
 .replace("fontSize:19,color:'#171717'","fontSize:15,color:'#171717'")
 .replace("borderRadius:16,boxSizing:'border-box'","borderRadius:8,boxSizing:'border-box'");
export const referenceComponents=[
 version(nav,'MD_CommerceNavigationV3',railSource,railCss,[
  define('title','Category rail title','TEXT','MENU',1),
  define('categories','Category labels','TEXT','RECOMMENDS,COUPONS,BUCKETS,BOX MEALS,BURGERS & WRAPS,JUST CHICKEN,KIDS MEALS,DESSERTS,VEGE,EXTRAS',2),
  define('accentColor','Active category colour','COLOR','#ed002d',3)
 ]),
 version(grid,'MD_CommerceProductGridV3',productSource,cardCss),
 version(basket,'MD_CommerceCheckoutBarV3',footerSource,cardCss,[
  define('title','Basket label','TEXT','SHOW BASKET',1),
  define('accentColor','Checkout colour','COLOR','#92b200',2),
  define('currencySymbol','Currency symbol','TEXT','£',3)
 ]),
 version(status,'MD_CommerceStatusV3',status.jsxSource,status.cssSource)
];
