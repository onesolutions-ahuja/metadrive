import * as React from 'react';
import {useEffect,useMemo,useState} from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import './acekiosk.css';

type RecordRow=Record<string,unknown>;
type ObjectInfo={apiName:string};
type Action={apiName:string;label:string};
type Item={id:string;name:string;description:string;price:number;image:string;category:string;active:boolean};
type CartLine={product:Item;quantity:number};
type Screen='welcome'|'menu'|'cart'|'checkout'|'confirmation';
const field=(r:RecordRow,...names:string[])=>{for(const n of names){const key=Object.keys(r).find(k=>k.toLowerCase()===n.toLowerCase());if(key&&r[key]!=null)return r[key];}return undefined;};
const money=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);
const productFrom=(r:RecordRow):Item|null=>{
  const id=String(field(r,'Id','id')??'');
  const name=String(field(r,'Name','name')??'');
  const price=Number(field(r,'Price','UnitPrice','SalePrice'));
  if(!id||!name||!Number.isFinite(price)||price<0)return null;
  const active=field(r,'Active','IsActive');
  return {id,name,price,description:String(field(r,'Description')??''),image:String(field(r,'ImageUrl','ImageURL','PhotoUrl')??''),category:String(field(r,'Category','CategoryName','MenuCategory')??'Menu'),active:active===undefined||active===true||String(active).toLowerCase()==='true'};
};
export default function AceKiosk({onLogout}:{onLogout:()=>void}){
  const [screen,setScreen]=useState<Screen>('welcome');
  const [products,setProducts]=useState<Item[]>([]);
  const [categories,setCategories]=useState<string[]>([]);
  const [category,setCategory]=useState('All');
  const [cart,setCart]=useState<CartLine[]>([]);
  const [actions,setActions]=useState<Action[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<RecordRow|null>(null);
  useEffect(()=>{
    let live=true;
    async function load(){
      try{
        const [metadata,available]=await Promise.all([
          apiRequest<{objects:ObjectInfo[]}>('/metadata/objects'),
          apiRequest<{actions:Action[]}>('/flows/available-actions?product=AceKiosk')
        ]);
        if(!live)return;
        setActions(available.actions??[]);
        const objects=metadata.objects??[];
        const product=objects.find(o=>o.apiName.toLowerCase()==='product');
        const menuCategories=objects.find(o=>o.apiName.toLowerCase()==='menucategory');
        if(!product)throw Error('Product object is not accessible to this user.');
        const [records,catRecords]=await Promise.all([
          apiRequest<{records:RecordRow[]}>(`/records/${encodeURIComponent(product.apiName)}?limit=200`),
          menuCategories?apiRequest<{records:RecordRow[]}>(`/records/${encodeURIComponent(menuCategories.apiName)}?limit=200`):Promise.resolve({records:[]})
        ]);
        if(!live)return;
        const items=(records.records??[]).map(productFrom).filter((p):p is Item=>p!==null&&p.active);
        setProducts(items);
        setCategories((catRecords.records??[]).filter(r=>field(r,'Active')!==false).sort((a,b)=>Number(field(a,'DisplayOrder')??0)-Number(field(b,'DisplayOrder')??0)).map(r=>String(field(r,'Name')??'')).filter(Boolean));
      }catch(e){if(live)setError(e instanceof Error?e.message:String(e));}
      finally{if(live)setLoading(false);}
    }
    void load();return()=>{live=false;};
  },[]);
  const quantity=cart.reduce((sum,line)=>sum+line.quantity,0);
  const subtotal=cart.reduce((sum,line)=>sum+line.quantity*line.product.price,0);
  const displayed=useMemo(()=>products.filter(p=>category==='All'||p.category.toLowerCase()===category.toLowerCase()),[products,category]);
  const add=(product:Item)=>setCart(lines=>{const existing=lines.find(l=>l.product.id===product.id);return existing?lines.map(l=>l.product.id===product.id?{...l,quantity:l.quantity+1}:l):[...lines,{product,quantity:1}];});
  const adjust=(id:string,delta:number)=>setCart(lines=>lines.map(l=>l.product.id===id?{...l,quantity:l.quantity+delta}:l).filter(l=>l.quantity>0));
  const checkout=async()=>{
    // Never write Orders directly or trust preview totals. Only an authorised tenant Flow may validate and commit.
    const action=actions.find(a=>/^(AceKioskCheckout|KioskCheckout)$/.test(a.apiName));
    if(!action){setError('Checkout is unavailable: configure and activate the AceKioskCheckout Flow in MetaDrive.');return;}
    setBusy(true);setError('');
    try{
      const response=await apiRequest<{outputs?:RecordRow;interviewId?:string}>(`/flows/${encodeURIComponent(action.apiName)}/execute`,{
        method:'POST',body:JSON.stringify({cartItems:cart.map(l=>({productId:l.product.id,quantity:l.quantity}))})
      });
      const outputs=response.outputs??{};
      const status=String(outputs.status??'').toLowerCase();
      if(status!=='complete'||!outputs.orderId)throw Error(response.interviewId?'Order processing is still pending. Do not retry until its status is confirmed.':String(outputs.message??'Checkout did not return a confirmed order. No success has been assumed.'));
      setResult(outputs);setCart([]);setScreen('confirmation');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const logout=async()=>{try{await apiRequest('/auth/logout',{method:'POST'});}catch{}onLogout();window.location.assign('/login');};
  return <div className="ak-shell">
    <header className="ak-header"><button type="button" className="ak-logo" onClick={()=>setScreen('welcome')} aria-label="AceKiosk home"><span className="ak-mark">A</span><strong>AceKiosk</strong></button>
      <span className="ak-header-label">FRESHLY MADE · ORDER YOUR WAY</span><button className="ak-signout" onClick={()=>void logout()}>Sign out</button></header>
    {error&&<div className="ak-error" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
    {screen==='welcome'&&<main className="ak-welcome"><div className="ak-welcome-copy"><p className="ak-overline">YOUR ORDER. YOUR WAY.</p><h1>Craving something <em>delicious?</em></h1><p>Discover the menu, customise your favourites, and order in just a few taps.</p><button className="ak-primary" onClick={()=>setScreen('menu')}>Start my order <span>→</span></button></div><div className="ak-hero-art" aria-hidden="true"><span>GOOD FOOD</span><strong>MADE FOR YOU.</strong><div className="ak-hero-disc">ENJOY<br/>EVERY<br/>BITE.</div></div></main>}
    {screen==='menu'&&<main className="ak-main"><div className="ak-title"><div><p className="ak-overline">MADE FOR YOUR CRAVINGS</p><h1>What are you hungry for?</h1></div><button className="ak-cartbutton" onClick={()=>setScreen('cart')}>Basket <span>{quantity}</span></button></div>
      <div className="ak-menu-layout"><nav className="ak-categories" aria-label="Menu categories">{['All',...(categories.length?categories:[...new Set(products.map(p=>p.category))])].map(c=><button key={c} className={c===category?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</nav>
      <section className="ak-products">{loading?<p role="status">Loading your menu…</p>:displayed.length===0?<p>No products are available in this category.</p>:displayed.map(item=><article className="ak-product" key={item.id}><div className="ak-image">{item.image?<img src={item.image} alt={item.name} loading="lazy"/>:<span aria-hidden="true">✦</span>}</div><div className="ak-product-body"><h2>{item.name}</h2><p>{item.description}</p><div><strong>{money(item.price)}</strong><button onClick={()=>add(item)} aria-label={`Add ${item.name}`}>Add +</button></div></div></article>)}</section></div>
      <div className="ak-floating"><span>{quantity} items · {money(subtotal)} preview</span><button onClick={()=>setScreen('cart')}>View basket →</button></div></main>}
    {screen==='cart'&&<main className="ak-order"><button className="ak-back" onClick={()=>setScreen('menu')}>← Back to menu</button><h1>Your basket</h1>{cart.length===0?<p>Your basket is empty.</p>:cart.map(l=><div className="ak-orderline" key={l.product.id}><div><strong>{l.product.name}</strong><p>{money(l.product.price)} each</p></div><div className="ak-counter"><button onClick={()=>adjust(l.product.id,-1)}>−</button><span>{l.quantity}</span><button onClick={()=>adjust(l.product.id,1)}>+</button></div></div>)}<div className="ak-subtotal"><span>Estimated subtotal</span><strong>{money(subtotal)}</strong></div><p className="ak-small">Tax, discounts, total and stock are calculated by MetaDrive at checkout.</p><button className="ak-primary" disabled={!cart.length} onClick={()=>setScreen('checkout')}>Continue to checkout →</button></main>}
    {screen==='checkout'&&<main className="ak-order"><button className="ak-back" onClick={()=>setScreen('cart')}>← Back to basket</button><p className="ak-overline">FINAL STEP</p><h1>Ready to order?</h1><p>{quantity} item(s) · Preview subtotal {money(subtotal)}</p><p className="ak-small">Your configured OneEngine checkout Flow will verify prices, tax, availability and payment before an order can be confirmed.</p><button className="ak-primary" disabled={busy||!cart.length} onClick={()=>void checkout()}>{busy?'Processing…':'Place order securely →'}</button></main>}
    {screen==='confirmation'&&<main className="ak-order ak-confirmed"><p className="ak-overline">ORDER CONFIRMED</p><h1>Thank you!</h1><p>Your order was confirmed by MetaDrive.</p><strong>Order: {String(result?.orderId??'')}</strong><button className="ak-primary" onClick={()=>{setResult(null);setScreen('welcome');}}>Start another order →</button></main>}
  </div>;
}
