import * as React from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import './acetill-terminal.css';

type Row=Record<string,unknown>;
type Action={apiName:string;label:string};
type Item={id:string;name:string;price:number;image:string;category:string;quantity:number};
type Result={outputs?:Row;records?:Row[];interviewId?:string};
const asText=(v:unknown)=>v==null?'':String(v);
const amount=(v:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(v);
function product(row:Row):Item|null {
  const id=asText(row.Id??row.id??row.ProductId);
  const name=asText(row.Name??row.name);
  const price=Number(row.Price??row.UnitPrice??row.SalePrice);
  if(!id||!name||!Number.isFinite(price)||price<0)return null;
  return {id,name,price,image:asText(row.ImageUrl??row.Image??row.PhotoUrl??row.ProductImage),category:asText(row.CategoryName??row.Category??row.ProductCategory??'Other'),quantity:1};
}
function extractRows(result:Result):Row[] {
  const output=result.outputs??{};
  for(const key of ['records','Records','products','Products','result','Result']) {
    const candidate=output[key]??(result as Row)[key];
    if(Array.isArray(candidate))return candidate.filter((v):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v));
  }
  return [];
}
/** Presentation and ephemeral cart only. Every server operation is an entitled OneEngine Flow. */
export default function AcetillTerminal(){
  const [actions,setActions]=React.useState<Action[]>([]);
  const [products,setProducts]=React.useState<Item[]>([]);
  const [cart,setCart]=React.useState<Item[]>([]);
  const [category,setCategory]=React.useState('All items');
  const [search,setSearch]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [message,setMessage]=React.useState('');
  const [loading,setLoading]=React.useState(true);
  const pending=React.useRef(false);
  React.useEffect(()=>{
    let active=true;
    void apiRequest<{actions:Action[]}>('/flows/available-actions?product=Acetill')
      .then(r=>{if(active)setActions(r.actions??[]);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  const execute=React.useCallback(async(action:Action,inputs:Row)=>{
    if(pending.current)throw Error('A workflow is already running');
    pending.current=true;setBusy(true);setError('');
    try {
      return await apiRequest<Result>('/flows/'+encodeURIComponent(action.apiName)+'/execute',{
        method:'POST',body:JSON.stringify(inputs)
      });
    }finally{pending.current=false;setBusy(false);}
  },[]);
  const find=(suffix:string)=>actions.find(a=>a.apiName.toLowerCase()==='acetill'+suffix.toLowerCase());
  const getProducts=find('GetProducts');
  const checkout=find('Checkout')??find('CompleteSale');
  const refresh=React.useCallback(async (query='')=>{
    if(!getProducts)return;
    try {
      const result=await execute(getProducts,{search:query,limit:100});
      setProducts(extractRows(result).map(product).filter((v):v is Item=>v!==null));
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  },[getProducts?.apiName,execute]);
  React.useEffect(()=>{if(getProducts)void refresh();},[getProducts?.apiName]);
  const categories=['All items',...new Set(products.map(p=>p.category).filter(Boolean))];
  const shown=products.filter(p=>(category==='All items'||p.category===category)&&p.name.toLowerCase().includes(search.toLowerCase()));
  const count=cart.reduce((n,x)=>n+x.quantity,0);
  const subtotal=cart.reduce((n,x)=>n+x.quantity*x.price,0);
  const add=(item:Item)=>setCart(v=>{const exists=v.some(x=>x.id===item.id);return exists?v.map(x=>x.id===item.id?{...x,quantity:x.quantity+1}:x):[...v,{...item}];});
  const change=(id:string,delta:number)=>setCart(v=>v.map(x=>x.id===id?{...x,quantity:x.quantity+delta}:x).filter(x=>x.quantity>0));
  const runCheckout=async()=>{
    if(!checkout||!cart.length)return;
    try {
      const result=await execute(checkout,{cartItems:cart.map(x=>({productId:x.id,quantity:x.quantity})),cartTotal:subtotal});
      setMessage(result.interviewId?'Checkout workflow started.':asText(result.outputs?.message??'Checkout workflow returned.'));
      // Never clear the basket without authoritative Flow completion confirmation.
      if(result.outputs?.status==='complete'||result.outputs?.status==='completed')setCart([]);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  return <main className="acetill-terminal">
    <section className="acetill-shop" aria-label="Acetill product catalogue">
      <div className="acetill-topline">
        <nav aria-label="Product categories" className="acetill-category-tabs">
          {categories.map(c=><button key={c} type="button" className={c===category?'selected':''} aria-pressed={c===category} onClick={()=>setCategory(c)}>{c}</button>)}
        </nav>
        <label className="acetill-search"><span aria-hidden="true">⌕</span><input aria-label="Find products" placeholder="Search products" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      </div>
      {loading?<p role="status">Loading permitted workflows…</p>:!getProducts?<p className="acetill-state" role="status">Configure and activate the AcetillGetProducts Flow to populate your catalogue using Get Records.</p>:null}
      {error&&<p role="alert" className="acetill-error">{error}</p>}
      {message&&<p role="status" className="acetill-state">{message}</p>}
      <div className="acetill-product-grid">
        {shown.map(p=><button type="button" key={p.id} className="acetill-product" onClick={()=>add(p)} disabled={busy}>
          <div className="acetill-product-art">{p.image?<img src={p.image} alt="" loading="lazy"/>:<span aria-hidden="true">◻</span>}</div>
          <div className="acetill-product-meta"><strong>{p.name}</strong><span>{amount(p.price)}</span></div>
        </button>)}
      </div>
      {getProducts&&!busy&&!shown.length&&<p className="acetill-state">No matching products returned by your Flow.</p>}
      <div className="acetill-quick-actions">
        {['Discount','Rewards','GiftCards','More'].map(label=>{
          const action=find(label);
          return <button key={label} type="button" disabled={!action||busy} title={!action?'Configure Acetill'+label+' Flow':undefined}
            onClick={()=>action&&void execute(action,{cartItems:cart.map(x=>({productId:x.id,quantity:x.quantity}))}).then(()=>setMessage(label+' workflow started')).catch(e=>setError(String(e)))}>
            {label==='Discount'?'◇':label==='Rewards'?'♧':label==='GiftCards'?'▣':'•••'} &nbsp;{label==='GiftCards'?'Gift cards':label}
          </button>;
        })}
      </div>
    </section>
    <aside className="acetill-current-order" aria-label="Current order">
      <div className="acetill-order-heading"><strong>Current order ({count})</strong><button type="button" aria-label="Clear order" disabled={!count||busy} onClick={()=>setCart([])}>⌫</button></div>
      <div className="acetill-lines">{cart.length?cart.map(p=><div className="acetill-line" key={p.id}>
        <div className="acetill-line-art">{p.image?<img src={p.image} alt=""/>:<span aria-hidden="true">◻</span>}</div>
        <div className="acetill-line-details"><strong>{p.name}</strong><div className="acetill-qty">
          <button type="button" aria-label={'Remove '+p.name} onClick={()=>change(p.id,-1)}>−</button><span>{p.quantity}</span>
          <button type="button" aria-label={'Add '+p.name} onClick={()=>change(p.id,1)}>+</button>
        </div></div><span className="acetill-line-price">{amount(p.price*p.quantity)}</span>
      </div>):<div className="acetill-empty">Select a product to start an order.</div>}</div>
      <div className="acetill-checkout"><div className="acetill-subtotal"><span>Estimated subtotal</span><span>{amount(subtotal)}</span></div>
        <p>Final tax, discounts and payment are calculated by OneEngine Flows.</p>
        <div className="acetill-total"><strong>Subtotal</strong><strong>{amount(subtotal)}</strong></div>
        <button className="acetill-charge" disabled={!checkout||!cart.length||busy} type="button" onClick={()=>void runCheckout()}>
          {busy?'Processing…':checkout?'Charge '+amount(subtotal):'Connect checkout Flow'} →
        </button>
      </div>
    </aside>
  </main>;
}
