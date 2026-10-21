import * as React from 'react';
import {useEffect,useMemo,useState} from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import './acekiosk.css';
import ProductCustomiser,{type OptionGroup,type Selection} from './ProductCustomiser';

type RecordRow=Record<string,unknown>;
type Action={apiName:string;label:string};
type Item={id:string;name:string;description:string;price:number;image:string;category:string;subcategory:string;badge:string;active:boolean};
type CartLine={key:string;product:Item;quantity:number;selections:Selection[]};
type Screen='welcome'|'menu'|'cart'|'checkout'|'confirmation';
const field=(r:RecordRow,...names:string[])=>{for(const n of names){const key=Object.keys(r).find(k=>k.toLowerCase()===n.toLowerCase());if(key&&r[key]!=null)return r[key];}return undefined;};
const money=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);
const productFrom=(r:RecordRow):Item|null=>{
  const id=String(field(r,'Id','id')??'');
  const name=String(field(r,'Name','name')??'');
  const price=Number(field(r,'Price','UnitPrice','SalePrice'));
  if(!id||!name||!Number.isFinite(price)||price<0)return null;
  const active=field(r,'Active','IsActive');
  return {id,name,price,description:String(field(r,'Description')??''),image:String(field(r,'ImageUrl','ImageURL','PhotoUrl')??''),category:String(field(r,'Category','CategoryName','MenuCategory')??'Menu'),subcategory:String(field(r,'Subcategory','SubCategoryName')??''),badge:String(field(r,'Badge','ProductBadge')??''),active:active===undefined||active===true||String(active).toLowerCase()==='true'};
};
export default function AceKiosk({onLogout}:{onLogout:()=>void}){
  const [screen,setScreen]=useState<Screen>('welcome');
  const [products,setProducts]=useState<Item[]>([]);
  const [catalog,setCatalog]=useState<Item[]>([]);
  const [categories,setCategories]=useState<Array<{id:string;name:string;order:number}>>([]);
  const [serviceMode,setServiceMode]=useState('Takeaway');
  const [paymentMethod,setPaymentMethod]=useState('');
  const [search,setSearch]=useState('');
  const [sessionId,setSessionId]=useState('');
  const [category,setCategory]=useState('All');
  const [subcategory,setSubcategory]=useState('All');
  const [cart,setCart]=useState<CartLine[]>([]);
  const [actions,setActions]=useState<Action[]>([]);
  const [options,setOptions]=useState<Record<string,OptionGroup[]>>({});
  const [customising,setCustomising]=useState<Item|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<RecordRow|null>(null);
  useEffect(()=>{
    let live=true;
    async function load(){
      try{
        // MetaDrive's authenticated app gate already checks installation, licence,
        // activation and OneEngine access. Do not duplicate that check here.
        // Only the authorised Flow owns menu records, filtering and field visibility.
        const available=await apiRequest<{actions:Action[]}>('/flows/available-actions?product=AceKiosk');
        if(!live)return;
        const permitted=available.actions??[];
        setActions(permitted);
        if(!permitted.some(a=>a.apiName==='AceKioskLoadMenu'))
          throw Error('Menu unavailable. Activate and authorise the AceKioskLoadMenu Flow in MetaDrive.');
        const response=await apiRequest<{outputs?:{products?:RecordRow[];categories?:RecordRow[];optionsByProduct?:Record<string,OptionGroup[]>}}>('/flows/AceKioskLoadMenu/execute',{
          method:'POST',body:JSON.stringify({})
        });
        if(!live)return;
        if(!Array.isArray(response.outputs?.products)||!Array.isArray(response.outputs?.categories))
          throw Error('AceKioskLoadMenu must return products and categories arrays.');
        const menu=response.outputs.products.map(productFrom).filter((p):p is Item=>p!==null&&p.active);
        setCatalog(menu);setProducts(menu);
        setOptions(response.outputs.optionsByProduct??{});
        setCategories(response.outputs.categories.filter(r=>field(r,'Active')!==false).map(r=>({id:String(field(r,'Id')??''),name:String(field(r,'Name')??''),order:Number(field(r,'DisplayOrder')??0)})).filter(r=>r.name).sort((a,b)=>a.order-b.order));
      }catch(e){if(live)setError(e instanceof Error?e.message:String(e));}
      finally{if(live)setLoading(false);}
    }
    void load();return()=>{live=false;};
  },[]);
  const quantity=cart.reduce((sum,line)=>sum+line.quantity,0);
  const subtotal=cart.reduce((sum,line)=>sum+line.quantity*line.product.price,0);
  const categoryName=(raw:string)=>categories.find(c=>c.id.toLowerCase()===raw.toLowerCase())?.name??raw;
  const matchCategory=(p:Item)=>category==='All'||[p.category,categoryName(p.category),p.subcategory].some(v=>v.toLowerCase()===category.toLowerCase());
  const executeAction=async(apiName:string,inputs:RecordRow={})=>{
    if(!actions.some(a=>a.apiName===apiName))throw Error(apiName+' is not authorised or activated in OneEngine');
    return apiRequest<{outputs?:RecordRow}>(`/flows/${apiName}/execute`,{method:'POST',body:JSON.stringify(inputs)});
  };
  const begin=async(mode:string)=>{
    setError('');setServiceMode(mode);
    if(actions.some(a=>a.apiName==='AceKioskStartSession')){
      try{const r=await executeAction('AceKioskStartSession',{serviceMode:mode});setSessionId(String(r.outputs?.sessionId??''));}
      catch(e){setError(e instanceof Error?e.message:String(e));return;}
    }
    setScreen('menu');
  };
  const filterCategory=async(name:string)=>{
    setCategory(name);setSubcategory('All');setSearch('');
    setProducts(catalog);
    if(actions.some(a=>a.apiName==='AceKioskFilterMenu')){
      try{const r=await executeAction('AceKioskFilterMenu',{categoryName:name,categoryId:categories.find(c=>c.name===name)?.id??'',sessionId});
        if(Array.isArray(r.outputs?.products))setProducts((r.outputs.products as RecordRow[]).map(productFrom).filter((p):p is Item=>Boolean(p?.active)));}
      catch(e){setError(e instanceof Error?e.message:String(e));}
    }
  };
  const restart=()=>{
    if(sessionId&&actions.some(a=>a.apiName==='AceKioskRestart'))void executeAction('AceKioskRestart',{sessionId}).catch(e=>setError(e instanceof Error?e.message:String(e)));
    setCart([]);setSessionId('');setPaymentMethod('');setCategory('All');setSubcategory('All');setSearch('');setProducts(catalog);setScreen('welcome');
  };
  const subcategories=useMemo(()=>[...new Set(products.filter(p=>matchCategory(p)).map(p=>p.subcategory).filter(Boolean))],[products,category,categories]);
  const displayed=useMemo(()=>products.filter(p=>matchCategory(p)&&(subcategory==='All'||p.subcategory.toLowerCase()===subcategory.toLowerCase())&&(!search||p.name.toLowerCase().includes(search.toLowerCase()))),[products,category,subcategory,search,categories]);
  const add=(product:Item,selections:Selection[]=[])=>{
    const key=product.id+'|'+selections.map(s=>s.groupId+':'+s.choiceId).sort().join(',');
    setCart(lines=>{const existing=lines.find(l=>l.key===key);return existing?lines.map(l=>l.key===key?{...l,quantity:l.quantity+1}:l):[...lines,{key,product,quantity:1,selections}];});
  };
  const choose=async(item:Item)=>{
    if(actions.some(a=>a.apiName==='AceKioskProductOptions')){
      try{const r=await executeAction('AceKioskProductOptions',{productId:item.id,sessionId});if(Array.isArray(r.outputs?.groups))setOptions(o=>({...o,[item.id]:r.outputs!.groups as OptionGroup[]}));
        else if(Array.isArray(r.outputs?.choiceGroups)&&Array.isArray(r.outputs?.choiceOptions)){
          const groupRows=r.outputs.choiceGroups as RecordRow[];
          const choiceRows=r.outputs.choiceOptions as RecordRow[];
          const relevant=groupRows.filter(g=>String(field(g,'ParentProduct')??'')===item.id);
          const groups:OptionGroup[]=relevant.map(g=>({
            id:String(field(g,'Id')??''),label:String(field(g,'Name')??''),
            required:Number(field(g,'MinimumChoices')??0)>0,
            choices:choiceRows.filter(c=>String(field(c,'ChoiceGroup')??'')===String(field(g,'Id')??'')).map(c=>({
              id:String(field(c,'Id')??''),label:String(field(c,'Name')??''),description:String(field(c,'Description')??'')
            }))
          })).filter(g=>g.id&&g.label&&g.choices.length);
          setOptions(o=>({...o,[item.id]:groups}));
        }}
      catch(e){setError(e instanceof Error?e.message:String(e));return;}
    }
    setCustomising(item);
  };
  const addChoice=async(item:Item,selections:Selection[])=>{
    if(actions.some(a=>a.apiName==='AceKioskAddToCart')){
      try{await executeAction('AceKioskAddToCart',{sessionId,productId:item.id,quantity:1,selections});}
      catch(e){setError(e instanceof Error?e.message:String(e));return;}
    }
    add(item,selections);setCustomising(null);
  };
  const adjust=(key:string,delta:number)=>{
    const line=cart.find(l=>l.key===key);if(!line)return;
    const next=Math.max(0,line.quantity+delta);
    if(actions.some(a=>a.apiName==='AceKioskUpdateCart')){
      void executeAction('AceKioskUpdateCart',{sessionId,productId:line.product.id,quantity:next,selections:line.selections})
        .then(()=>setCart(items=>items.map(l=>l.key===key?{...l,quantity:next}:l).filter(l=>l.quantity>0)))
        .catch(e=>setError(e instanceof Error?e.message:String(e)));
    }else setCart(items=>items.map(l=>l.key===key?{...l,quantity:next}:l).filter(l=>l.quantity>0));
  };
  const checkout=async()=>{
    // Never write Orders directly or trust preview totals. Only an authorised tenant Flow may validate and commit.
    const action=actions.find(a=>/^(AceKioskCheckout|KioskCheckout)$/.test(a.apiName));
    if(!action){setError('Checkout is not configured: an authorised AceKioskCheckout Flow must validate the order and payment before confirmation.');return;}
    setBusy(true);setError('');
    try{
      const response=await apiRequest<{outputs?:RecordRow;interviewId?:string}>(`/flows/${encodeURIComponent(action.apiName)}/execute`,{
        method:'POST',body:JSON.stringify({sessionId,serviceMode,paymentMethod,cartItemsJson:JSON.stringify(cart.map(l=>({productId:l.product.id,quantity:l.quantity,selections:l.selections})))})
      });
      const outputs=response.outputs??{};
      const status=String(outputs.status??'').toLowerCase();
      if(!['complete','completed','confirmed'].includes(status)||!outputs.orderId)throw Error(response.interviewId?'Order processing is still pending. Do not retry until its status is confirmed.':String(outputs.message??'Checkout did not return a confirmed order. No success has been assumed.'));
      setResult(outputs);setCart([]);setScreen('confirmation');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const logout=async()=>{try{await apiRequest('/auth/logout',{method:'POST'});}catch{}onLogout();window.location.assign('/login');};
  return <div className="ak-shell">
    <header className="ak-header"><button type="button" className="ak-logo" onClick={restart} aria-label="KFC home"><img className="ak-kfc-logo" src="https://commons.wikimedia.org/wiki/Special:FilePath/KFC_logo_wordmark.svg" alt="KFC" /></button>
      <span className="ak-header-label">KFC KIOSK EXPERIENCE · CLIENT DEMO</span><button className="ak-signout" onClick={()=>void logout()}>Sign out</button></header>
    {error&&<div className="ak-error" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
    {screen==='welcome'&&<main className="ak-welcome"><div className="ak-welcome-copy"><p className="ak-overline">YOUR ORDER. YOUR WAY.</p><h1>WELCOME TO <em>KFC.</em></h1><p>It's finger lickin' good. How would you like to eat?</p><div className="ak-modes"><button className="ak-primary" onClick={()=>void begin('Eat In')}>EAT IN →</button><button className="ak-primary" onClick={()=>void begin('Takeaway')}>TAKEAWAY →</button></div></div><div className="ak-hero-art" aria-hidden="true"><span>GOOD FOOD</span><strong>MADE FOR YOU.</strong><div className="ak-hero-disc">ENJOY<br/>EVERY<br/>BITE.</div></div></main>}
    {screen==='menu'&&<main className="ak-main"><div className="ak-title"><div><p className="ak-overline">MADE FOR YOUR CRAVINGS</p><h1>{category==='All'?'OUR MENU':category.toUpperCase()}</h1></div><button className="ak-cartbutton" onClick={()=>setScreen('cart')}>Basket <span>{quantity}</span></button></div>
      <div className="ak-menu-layout"><nav className="ak-categories" aria-label="Menu categories">{['All',...(categories.length?categories.map(c=>c.name):[...new Set(products.map(p=>p.category))])].map(c=><button key={c} className={c===category?'active':''} onClick={()=>void filterCategory(c)}>{c}</button>)}</nav>
      <div className="ak-menu-content"><input className="ak-search" aria-label="Search menu" placeholder="Search products" value={search} onChange={e=>setSearch(e.target.value)}/>{subcategories.length>0&&<nav className="ak-subcategories" aria-label="Menu subcategories">{['All',...subcategories].map(c=><button key={c} className={subcategory===c?'active':''} onClick={()=>setSubcategory(c)}>{c}</button>)}</nav>}<section className="ak-products">{loading?<p role="status">Loading your menu…</p>:displayed.length===0?<p>No products are available in this category.</p>:displayed.map(item=><article className="ak-product" key={item.id}><div className="ak-image">{item.image?<img src={item.image} alt={item.name} loading="lazy"/>:<span aria-hidden="true">✦</span>}</div><div className="ak-product-body">{item.badge&&<span className="ak-product-badge">{item.badge}</span>}<h2>{item.name}</h2><p>{item.description}</p><div><strong>{money(item.price)}</strong><button onClick={()=>void choose(item)} aria-label={`Add ${item.name}`}>CHOOSE +</button></div></div></article>)}</section></div></div>
      <div className="ak-floating"><button className="ak-basket-open" onClick={()=>setScreen('cart')}>🛒 SHOW BASKET <span>{quantity}</span></button><button className="ak-place" onClick={()=>setScreen('cart')}>PLACE ORDER <strong>{money(subtotal)}</strong></button></div></main>}
    {screen==='cart'&&<main className="ak-order"><button className="ak-back" onClick={()=>setScreen('menu')}>← Back to menu</button><h1>Your basket</h1>{cart.length===0?<p>Your basket is empty.</p>:cart.map(l=><div className="ak-orderline" key={l.key}><div><strong>{l.product.name}</strong><p>{money(l.product.price)} each</p>{l.selections.length>0&&<small>Customised: {l.selections.map(s=>s.choiceId).join(', ')}</small>}</div><div className="ak-counter"><button onClick={()=>adjust(l.key,-1)}>−</button><span>{l.quantity}</span><button onClick={()=>adjust(l.key,1)}>+</button></div></div>)}<div className="ak-subtotal"><span>Estimated subtotal</span><strong>{money(subtotal)}</strong></div><p className="ak-small">Tax, discounts, total and stock are calculated by MetaDrive at checkout.</p><button className="ak-primary" disabled={!cart.length} onClick={()=>setScreen('checkout')}>Continue to checkout →</button></main>}
    {screen==='checkout'&&<main className="ak-order"><button className="ak-back" onClick={()=>setScreen('cart')}>← Back to basket</button><p className="ak-overline">FINAL STEP · {serviceMode.toUpperCase()}</p><h1>HOW WOULD YOU LIKE TO PAY?</h1><div className="ak-paymethods"><button className={paymentMethod==='Card'?'active':''} onClick={()=>setPaymentMethod('Card')}>CARD</button><button className={paymentMethod==='Cash'?'active':''} onClick={()=>setPaymentMethod('Cash')}>CASH</button></div><p>{quantity} item(s) · Preview subtotal {money(subtotal)}</p><p className="ak-small">Your configured OneEngine checkout Flow will verify prices, tax, availability and payment before an order can be confirmed.</p><button className="ak-primary" disabled={busy||!cart.length||!paymentMethod} onClick={()=>void checkout()}>{busy?'Processing…':'CONFIRM ORDER →'}</button></main>}
    {screen==='confirmation'&&<main className="ak-order ak-confirmed"><p className="ak-overline">ORDER CONFIRMED</p><h1>Thank you!</h1><p>Your order was confirmed by MetaDrive.</p><strong>Order: {String(result?.orderId??'')}</strong><button className="ak-primary" onClick={restart}>Start another order →</button></main>}
    {customising&&<ProductCustomiser name={customising.name} image={customising.image} groups={options[customising.id]??[]}
      onCancel={()=>setCustomising(null)} onAdd={selections=>{void addChoice(customising,selections);}}/>}
  </div>;
}
