export default function KioskOrderingExperience(props) {
 const p=props||{},products=Array.isArray(p.products)?p.products:[],categories=Array.isArray(p.categories)?p.categories:[],cart=Array.isArray(p.cartLines)?p.cartLines:[];
 const [step,setStep]=React.useState('welcome'),[mode,setMode]=React.useState('eat-in'),[category,setCategory]=React.useState(''),[selected,setSelected]=React.useState(null),[qty,setQty]=React.useState(1),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const labels=p.labels||{},label=(key,fallback)=>labels[key]||fallback,amount=n=>(p.currency||'£')+Number(n||0).toFixed(2);
 const total=cart.reduce((v,i)=>v+Number(i.quantity||0)*Number(i.unitPrice||0),0),count=cart.reduce((v,i)=>v+Number(i.quantity||0),0);
 async function action(event,value){setBusy(true);setError('');try{return await p.onAction({event,value});}catch(e){setError(e.message||String(e));return null;}finally{setBusy(false)}}

 // One metadata-driven collection iterator for category, product and cart components.
 // Item rendering remains specialised; array traversal, keys and visibility are shared.
 const renderCollection=(items,render,filter=()=>true)=>
  items.filter(filter).map((item,index)=>render(item,index));
 const title=label('restaurantName',p.brandName||'Your Restaurant');
 const art=(item)=><div className="mdk-photo">{item&&item.image?<img alt="" src={item.image}/>:<span>🍽️</span>}</div>;
 return <div className="mdk-shell" style={{'--mdk-accent':p.accentColor||'#c8172c','--mdk-ink':p.inkColor||'#191919'}}>
  {error||p.actionError?<div className="mdk-error" role="alert">{error||p.actionError}</div>:null}
  {p.loading?<div role="status" className="mdk-loading">Loading menu…</div>:null}
  {step==='welcome'?<main className="mdk-welcome">
    <div className="mdk-welcome-art">{p.welcomeImage?<img alt="" src={p.welcomeImage}/>:<span>🍗</span>}</div>
    <div className="mdk-welcome-content"><small>{label('welcomeEyebrow','FRESH FOOD, YOUR WAY')}</small><h1>{label('welcomeTitle','Welcome to '+title)}</h1><p>{label('welcomeSubtitle','Choose, customise and order your favourites.')}</p><button className="mdk-primary" onClick={()=>setStep('mode')}>{label('startOrder','START ORDERING')} →</button></div>
  </main>:step==='mode'?<main className="mdk-mode-page"><button className="mdk-back" onClick={()=>setStep('welcome')}>← Back</button><h1>{label('serviceQuestion','How would you like your food?')}</h1><div className="mdk-modes">
  <button onClick={()=>{setMode('eat-in');setStep('menu')}}><span>🍽️</span><strong>{label('eatIn','Eat In')}</strong></button>
  <button onClick={()=>{setMode('takeaway');setStep('menu')}}><span>🛍️</span><strong>{label('takeaway','Takeaway')}</strong></button></div></main>:
  <><header className="mdk-header"><strong>{title}</strong><span>{mode==='eat-in'?label('eatIn','Eat In'):label('takeaway','Takeaway')}</span><button onClick={()=>setStep('menu')}>{label('menu','Menu')}</button></header>
  {step==='menu'?<div className="mdk-order-layout"><aside className="mdk-categories"><button className={!category?'active':''} onClick={()=>setCategory('')}>{label('all','All items')}</button>{renderCollection(categories,c=><button key={c.id} className={category===c.id?'active':''} onClick={()=>setCategory(c.id)}>{c.icon||'🍽️'} {c.name}</button>)}</aside>
  <main className="mdk-menu"><h1>{label('menuTitle',p.menuTitle||'Choose your favourites')}</h1><div className="mdk-products">{renderCollection(products,item=><button className="mdk-product" key={item.id} onClick={()=>{setSelected(item);setQty(1)}}>{art(item)}<strong>{item.name}</strong><small>{item.description}</small><b>{amount(item.price)} <span>+</span></b></button>,x=>!category||x.categoryId===category)}</div>{!products.length&&!p.loading?<p role="status">No available products. Add Product records in Object Manager.</p>:null}</main>
  <aside className="mdk-cart"><h2>{label('yourOrder','Your order')} ({count})</h2>{renderCollection(cart,c=><div className="mdk-line" key={c.id}><strong>{c.name}</strong><div><button onClick={()=>action(Number(c.quantity)<=1?'remove':'quantity',{lineId:c.id,quantity:Number(c.quantity)-1})} disabled={busy}>−</button><span>{c.quantity}</span><button onClick={()=>action('quantity',{lineId:c.id,quantity:Number(c.quantity)+1})} disabled={busy}>+</button></div><b>{amount(Number(c.unitPrice)*Number(c.quantity))}</b></div>)}<div className="mdk-cart-bottom"><p>Subtotal <strong>{amount(total)}</strong></p><button className="mdk-primary" onClick={()=>setStep('review')} disabled={!count}>{label('review','Review order')} →</button></div></aside></div>:
  <main className="mdk-review"><button className="mdk-back" onClick={()=>setStep('menu')}>← {label('back','Back to menu')}</button><h1>{label('review','Review order')}</h1>{renderCollection(cart,c=><p key={c.id}>{c.name} × {c.quantity} — {amount(Number(c.unitPrice)*Number(c.quantity))}</p>)}<h2>{amount(total)}</h2><p>{label('paymentNotice','Payments run through your configured Flow and Named Device.')}</p><button className="mdk-primary" disabled={busy||!p.flows?.some(f=>f.apiName===p.actionFlows?.checkout?.flowApiName&&f.status==='Active')} onClick={()=>action('checkout',{orderType:mode})}>{label('checkout','Proceed to checkout')}</button></main>}
  </>}
  {selected?<div className="mdk-modal"><section><button className="mdk-dismiss" onClick={()=>setSelected(null)}>×</button>{art(selected)}<h2>{selected.name}</h2><p>{selected.description}</p><strong>{amount(selected.price)}</strong><div className="mdk-add"><button onClick={()=>setQty(Math.max(1,qty-1))}>−</button>{qty}<button onClick={()=>setQty(qty+1)}>+</button><button className="mdk-primary" disabled={busy} onClick={async()=>{const r=await action('add',{productId:selected.id,quantity:qty});if(r)setSelected(null)}}>{label('add','Add to order')} · {amount(selected.price*qty)}</button></div></section></div>:null}
 </div>;
}