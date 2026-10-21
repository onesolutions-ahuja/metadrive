import * as React from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import './acetill-terminal.css';

type Row=Record<string,unknown>;
type Action={apiName:string;label:string};
type Item={id:string;name:string;price:number;image:string;category:string;categoryId:string;quantity:number};
type Category={id:string;name:string;order:number};
type Result={outputs?:Row;records?:Row[];interviewId?:string};
const asText=(v:unknown)=>v==null?'':String(v);
const amount=(v:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(v);
function product(row:Row):Item|null {
  const id=asText(row.Id??row.id??row.ProductId);
  const name=asText(row.Name??row.name);
  const price=Number(row.Price??row.UnitPrice??row.SalePrice);
  if(!id||!name||!Number.isFinite(price)||price<0)return null;
  return {id,name,price,image:asText(row.ImageUrl??row.Image??row.PhotoUrl??row.ProductImage),category:asText(row.CategoryName??row.Category??row.ProductCategory??''),categoryId:asText(row.MenuCategory??row.MenuCategoryId??row.CategoryId),quantity:1};
}
function parseCategory(row:Row):Category|null {
  const id=asText(row.Id??row.id??row.CategoryId);
  const name=asText(row.Name??row.name);
  if(!id||!name||row.Active===false||row.Active==='false')return null;
  const order=Number(row.DisplayOrder??0);
  return {id,name,order:Number.isFinite(order)?order:0};
}
function extractRows(result:Result):Row[] {
  const output=result.outputs??{};
  for(const key of ['records','Records','products','Products','categories','Categories','result','Result']) {
    const candidate=output[key]??(result as Row)[key];
    if(Array.isArray(candidate))return candidate.filter((v):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v));
  }
  return [];
}
/** Presentation and ephemeral cart only. Every server operation is an entitled OneEngine Flow. */
export default function AcetillTerminal(){
  const [actions,setActions]=React.useState<Action[]>([]);
  const [products,setProducts]=React.useState<Item[]>([]);
  const [categories,setCategories]=React.useState<Category[]>([]);
  const [catalogueLoading,setCatalogueLoading]=React.useState(false);
  const [cart,setCart]=React.useState<Item[]>([]);
  const [category,setCategory]=React.useState('');
  const [search,setSearch]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [message,setMessage]=React.useState('');
  const [loading,setLoading]=React.useState(true);
  const [receipt,setReceipt]=React.useState<Row|null>(null);
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
  const getCategories=find('GetCategories');
  const checkout=find('Checkout')??find('CompleteSale');
  // Read-only catalogue flows may run simultaneously; checkout and write actions remain serialized.
  const executeRead=React.useCallback(async(action:Action,inputs:Row)=>{
    return apiRequest<Result>('/flows/'+encodeURIComponent(action.apiName)+'/execute',{
      method:'POST',body:JSON.stringify(inputs)
    });
  },[]);
  // Category tabs and product data come exclusively from entitled OneEngine Flows.
  // A selection always invokes GetProducts with the selected category and search input.
  const latestRequest=React.useRef(0);
  React.useEffect(()=>{
    if(!getCategories)return;
    let active=true;
    void executeRead(getCategories,{active:true,sortField:'DisplayOrder',sortOrder:'Ascending'})
      .then(result=>{if(active)setCategories(extractRows(result).map(parseCategory)
        .filter((c):c is Category=>c!==null).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name)));})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));});
    return()=>{active=false;};
  },[getCategories?.apiName]);
  React.useEffect(()=>{
    if(!getProducts)return;
    const request=++latestRequest.current;
    const handle=window.setTimeout(()=>{
      setCatalogueLoading(true);
      const selected=categories.find(c=>c.id===category);
      void executeRead(getProducts,{
        search:search.trim(),categoryId:category,categoryName:selected?.name??'',limit:100
      }).then(result=>{
        if(request!==latestRequest.current)return;
        const rows=extractRows(result).map(product).filter((p):p is Item=>p!==null);
        // Keep the selected category accurate even when a tenant has not yet
        // added categoryId as a Flow input/filter; no direct CRUD fallback.
        setProducts(category?rows.filter(p=>p.categoryId===category||
          (selected&&p.category===selected.name)):rows);
      }).catch(e=>{
        if(request===latestRequest.current)setError(e instanceof Error?e.message:String(e));
      }).finally(()=>{if(request===latestRequest.current)setCatalogueLoading(false);});
    },search.trim()?350:0);
    return()=>{latestRequest.current++;window.clearTimeout(handle);};
  },[getProducts?.apiName,category,search,categories]);
  const shown=products;
  const count=cart.reduce((n,x)=>n+x.quantity,0);
  const subtotal=cart.reduce((n,x)=>n+x.quantity*x.price,0);
  const add=(item:Item)=>setCart(v=>{const exists=v.some(x=>x.id===item.id);return exists?v.map(x=>x.id===item.id?{...x,quantity:x.quantity+1}:x):[...v,{...item}];});
  const change=(id:string,delta:number)=>setCart(v=>v.map(x=>x.id===id?{...x,quantity:x.quantity+delta}:x).filter(x=>x.quantity>0));
  const runCheckout=async()=>{
    if(!checkout||!cart.length)return;
    try {
      const result=await execute(checkout,{cartItems:cart.map(x=>({productId:x.id,quantity:x.quantity})),cartTotal:subtotal});
      const status=asText(result.outputs?.status).toLowerCase();
      const completed=!result.interviewId&&(status==='complete'||status==='completed'||status==='success');
      setMessage(completed?'Sale confirmed.':result.interviewId?'Checkout workflow started; sale is not yet confirmed.':asText(result.outputs?.message??'Checkout is not confirmed.'));
      // Never clear the basket or offer a receipt until the Flow confirms the sale.
      if(completed){setReceipt(result.outputs??{});setCart([]);}
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  return receipt?<main className="acetill-receipt-screen" aria-label="Sale completed">
    <section className="acetill-receipt-panel"><div className="acetill-receipt-icon" aria-hidden="true">✓</div>
      <h1>Payment complete</h1><p>Your OneEngine checkout Flow confirmed this transaction.</p>
      <dl><div><dt>Order reference</dt><dd>{asText(receipt.orderId??receipt.orderNumber??receipt.OrderId)||'Confirmed'}</dd></div>
      {receipt.total!=null&&<div><dt>Final total</dt><dd>{amount(Number(receipt.total))}</dd></div>}</dl>
      <div className="acetill-receipt-actions">
        {find('PrintReceipt')&&<button type="button" disabled={busy} onClick={()=>void execute(find('PrintReceipt')!,{orderId:receipt.orderId??receipt.OrderId}).then(()=>setMessage('Receipt print Flow submitted.')).catch(e=>setError(String(e)))}>Print receipt</button>}
        {find('EmailReceipt')&&<button type="button" disabled={busy} onClick={()=>void execute(find('EmailReceipt')!,{orderId:receipt.orderId??receipt.OrderId}).then(()=>setMessage('Receipt email Flow submitted.')).catch(e=>setError(String(e)))}>Email receipt</button>}
        <button type="button" className="acetill-charge" onClick={()=>{setReceipt(null);setMessage('');setError('');}}>New sale</button>
      </div>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    </section></main>:<main className="acetill-terminal">
    <section className="acetill-shop" aria-label="Acetill product catalogue">
      <div className="acetill-topline">
        <nav aria-label="Product categories" className="acetill-category-tabs">
          <button type="button" className={!category?'selected':''} aria-pressed={!category} onClick={()=>setCategory('')}>All items</button>
          {categories.map(c=><button key={c.id} type="button" className={c.id===category?'selected':''} aria-pressed={c.id===category} onClick={()=>setCategory(c.id)}>{c.name}</button>)}
        </nav>
        <label className="acetill-search"><span aria-hidden="true">⌕</span><input aria-label="Find products" placeholder="Search products" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      </div>
      {loading?<p role="status">Loading permitted workflows…</p>:!getProducts?<p className="acetill-state" role="status">Configure and activate the AcetillGetProducts Flow to populate your catalogue using Get Records.</p>:null}
      {error&&<p role="alert" className="acetill-error">{error}</p>}
      {message&&<p role="status" className="acetill-state">{message}</p>}
      <div className="acetill-catalogue-scroll" tabIndex={0} aria-label="Scrollable product catalogue">
      {!getCategories&&!loading&&<p className="acetill-state">Configure AcetillGetCategories Flow to load category tabs.</p>}
      {catalogueLoading&&<p role="status" className="acetill-state">Loading products…</p>}
      <div className="acetill-product-grid">
        {shown.map(p=><button type="button" key={p.id} className="acetill-product" onClick={()=>add(p)} disabled={busy}>
          <div className="acetill-product-art">{p.image?<img src={p.image} alt="" loading="lazy"/>:<span aria-hidden="true">◻</span>}</div>
          <div className="acetill-product-meta"><strong>{p.name}</strong><span>{amount(p.price)}</span></div>
        </button>)}
      </div>
      {getProducts&&!catalogueLoading&&!shown.length&&<p className="acetill-state">No matching products returned by your Flow.</p>}
      </div>
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
