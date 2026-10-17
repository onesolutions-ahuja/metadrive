function flowAction(props,event,value) {
 if(typeof props.onAction!=='function')throw Error('Configure a Flow action for this shopping-cart event.');
 return Promise.resolve(props.onAction({event,value}));
}

function currency(value,code) {
 return (Number(value||0)/100).toLocaleString(undefined,{style:'currency',currency:code||'GBP'});
}

function validCart(value) {
 return Array.isArray(value)?value.filter(item=>item&&typeof item.productId==='string'&&
  typeof item.name==='string'&&Number.isSafeInteger(item.quantity)&&item.quantity>0&&
  Number.isSafeInteger(item.unitPriceMinor)&&item.unitPriceMinor>=0&&
  Number.isSafeInteger(item.unitPriceMinor*item.quantity)).map(item=>({
   productId:item.productId,name:item.name.slice(0,160),quantity:item.quantity,
   unitPriceMinor:item.unitPriceMinor,vatApplicable:item.vatApplicable===true,ageRestricted:item.ageRestricted===true
  })):[];
}

function makeSnapshot(items,status,changeDueMinor=0) {
 const visibleStatus=status==='basket'&&items.some(item=>item.ageRestricted)?'staff-approval-required':status;
 return {status:visibleStatus,items:items.map(item=>({
  name:item.name,quantity:item.quantity,lineTotalMinor:item.unitPriceMinor*item.quantity
 })),totalMinor:items.reduce((sum,item)=>sum+item.unitPriceMinor*item.quantity,0),changeDueMinor};
}

function ShoppingCartDisplay({props}) {
 const [snapshot,setSnapshot]=React.useState({status:'waiting',items:[],totalMinor:0,changeDueMinor:0});
 const session=typeof window==='undefined'?'':new URLSearchParams(window.location.search)
  .get(props.stateSessionQueryParam||'displaySession')||'';
 const apply=payload=>{
  if(!payload||!Array.isArray(payload.items))return;
  const items=payload.items.filter(item=>item&&typeof item.name==='string'&&
   Number.isSafeInteger(item.quantity)&&item.quantity>0&&Number.isSafeInteger(item.lineTotalMinor)&&item.lineTotalMinor>=0)
   .map(item=>({name:item.name.slice(0,160),quantity:item.quantity,lineTotalMinor:item.lineTotalMinor}));
  const totalMinor=Number(payload.totalMinor),changeDueMinor=Number(payload.changeDueMinor||0);
  setSnapshot({status:typeof payload.status==='string'?payload.status:'basket',items,
   totalMinor:Number.isSafeInteger(totalMinor)&&totalMinor>=0?totalMinor:0,
   changeDueMinor:Number.isSafeInteger(changeDueMinor)&&changeDueMinor>=0?changeDueMinor:0});
 };
 React.useEffect(()=>{
  if(props.stateChannel?.value?.display)apply(props.stateChannel.value.display);
 },[props.stateChannel?.value]);
 React.useEffect(()=>{
  if(props.stateChannel||props.stateSyncEnabled===true||!session||typeof BroadcastChannel==='undefined')return undefined;
  const channel=new BroadcastChannel('metadrive:paired-display:'+session);
  channel.onmessage=event=>{if(event.data?.type==='snapshot')apply(event.data.payload);};
  channel.postMessage({type:'ready'});
  return()=>channel.close();
 },[session]);
 const status=snapshot.status;
 const statusText=props.stateChannel?.error?props.reconnectingText||'Reconnecting to the till…'
  :status==='staff-approval-required'?props.staffApprovalText||'Staff approval required'
  :status==='payment-pending'?props.paymentPendingText||'Payment in progress'
  :status==='complete'?props.thankYouText||'Thank you'
  :status==='declined'?props.paymentDeclinedText||'Payment declined'
  :status==='insufficient-cash'?props.insufficientCashText||'Please speak to the cashier'
  :status==='age-rejected'?props.ageCheckFailedText||'Please speak to the cashier'
  :status==='payment-cancelled'?props.paymentCancelledText||'Payment cancelled'
  :status==='payment-failed'?props.paymentFailedText||'Please speak to the cashier'
  :props.waitingText||'Your basket will appear here';
 return <main className="one-shopping-display" aria-label={props.title||'Customer display'}>
  <header><span>{props.storeName||'Welcome'}</span><strong>{props.title||'Your order'}</strong></header>
  <section aria-live="polite">
   {snapshot.items.map((item,index)=><div className="one-shopping-display-item" key={index}>
    <span>{item.quantity} × {item.name}</span><strong>{currency(item.lineTotalMinor,props.currencyCode)}</strong>
   </div>)}
   {!snapshot.items.length&&<p>{statusText}</p>}
  </section>
  <footer><div className="one-shopping-display-total"><span>{props.totalLabel||'Total'}</span>
   <strong>{currency(snapshot.totalMinor,props.currencyCode)}</strong></div>
   {status==='complete'&&snapshot.changeDueMinor>0&&<div className="one-shopping-display-total">
    <span>{props.changeDueLabel||'Change due'}</span><strong>{currency(snapshot.changeDueMinor,props.currencyCode)}</strong>
   </div>}<p role="status">{statusText}</p>
  </footer>
 </main>;
}

function ShoppingCartTill({props}) {
 const [cart,setCart]=React.useState([]);
 const [search,setSearch]=React.useState('');
 const [selectedCategory,setSelectedCategory]=React.useState('');
 const [error,setError]=React.useState('');
 const [busy,setBusy]=React.useState(false);
 const [displaySession,setDisplaySession]=React.useState('');
 const [paymentStatus,setPaymentStatus]=React.useState('');
 const [vatRate,setVatRate]=React.useState(Number(props.vatRate??20));
 const [settingsReady,setSettingsReady]=React.useState(typeof props.loadCompanySettings!=='function');
 const request=React.useRef('');
 const channel=props.stateChannel;
 const sessionReady=props.previewOnly===true||(channel?channel.ready&&channel.exists&&!channel.error:props.stateSyncEnabled!==true);
 const locked=busy||paymentStatus==='pending'||paymentStatus==='complete';
 let operations=[],operationError='';
 try{operations=JSON.parse(String(props.operationEvents||'[]'));if(!Array.isArray(operations))throw Error('Expected a list.');}
 catch{operationError='Invalid operationEvents metadata.';}
 operations=operations.filter(item=>item&&typeof item.event==='string'&&typeof item.label==='string');

 const price=item=>Math.round(Number(item[props.priceFieldApiName||'DefaultPrice'])*100);
 const name=item=>String(item[props.nameFieldApiName||'Name']||'');
 const gross=cart.reduce((sum,item)=>sum+item.unitPriceMinor*item.quantity,0);
 const vat=cart.reduce((sum,item)=>sum+(item.vatApplicable?
  Math.round(item.unitPriceMinor*item.quantity*vatRate/(100+vatRate)):0),0);
 const ageRestricted=cart.some(item=>item.ageRestricted);
 const saleValue=items=>{
  const total=items.reduce((sum,item)=>sum+item.unitPriceMinor*item.quantity,0);
  const tax=items.reduce((sum,item)=>sum+(item.vatApplicable?
   Math.round(item.unitPriceMinor*item.quantity*vatRate/(100+vatRate)):0),0);
  return {lines:items.map(item=>({
   Name:item.name,ProductId:item.productId,Quantity:item.quantity,UnitPrice:item.unitPriceMinor/100,
   VATApplicable:item.vatApplicable,VATRate:item.vatApplicable?vatRate:0,
   VATAmount:item.vatApplicable?Math.round(item.unitPriceMinor*item.quantity*vatRate/(100+vatRate))/100:0,
   LineTotal:item.unitPriceMinor*item.quantity/100
  })),total:total/100,vatTotal:tax/100,standardVatRate:vatRate,
   hasAgeRestricted:items.some(item=>item.ageRestricted)};
 };
 const publish=(items,status='basket',changeDueMinor=0)=>{if(props.previewOnly===true)return;
  const snapshot=makeSnapshot(items,status,changeDueMinor);
  if(channel){channel.publish({cart:items,paymentStatus:status,display:snapshot});return;}
  if(props.stateSyncEnabled===true||!displaySession||typeof BroadcastChannel==='undefined')return;
  const target=new BroadcastChannel('metadrive:paired-display:'+displaySession);
  target.postMessage({type:'snapshot',payload:snapshot});target.close();
 };
 const updateCart=next=>{request.current='';setCart(next);setPaymentStatus('');publish(next);};
 React.useEffect(()=>{if(channel){setCart([]);setPaymentStatus('');}},[channel?.key]);
 React.useEffect(()=>{
  const value=channel?.value;
  if(!value||!Array.isArray(value.cart))return;
  setCart(validCart(value.cart));
  setPaymentStatus(value.paymentStatus==='payment-pending'?'pending':value.paymentStatus==='complete'?'complete':'');
 },[channel?.value]);
 React.useEffect(()=>{
  if(typeof props.loadCompanySettings!=='function')return undefined;
  let active=true;
  Promise.resolve(props.loadCompanySettings()).then(settings=>{
   const configured=Number(settings?.standardVatRate);
   if(!Number.isFinite(configured)||configured<0||configured>100)
    throw Error('Company VAT rate must be between 0 and 100 percent.');
   if(active){setVatRate(configured);setSettingsReady(true);}
  }).catch(cause=>{
   if(active){setSettingsReady(false);setError('Unable to load company VAT settings: '+
    (cause instanceof Error?cause.message:'request failed'));}
  });
  return()=>{active=false;};
 },[]);
 React.useEffect(()=>{
  const flow=props.actionFlows?.checkout?.flowApiName;
  if(typeof flow!=='string'||!flow)return undefined;
  const completed=event=>{
   const detail=event.detail;
   if(!detail||detail.flowApiName!==flow)return;
   const outputs=detail.outputs&&typeof detail.outputs==='object'?detail.outputs:{};
   const expected=props.actionFlows?.checkout?.inputs?.CheckoutRequestKey;
   if(expected&&outputs.CheckoutRequestKey!==request.current)return;
   const status=outputs.CheckoutStatus;
   if(status==='InvalidSale'||status==='InvalidPayment'){
    setBusy(false);setPaymentStatus('failed');setError('The sale could not be validated. Check the basket and try again.');
    publish(cart,'payment-failed');
   }else if(status==='AgeRejected'){
    if(!cart.some(item=>item.ageRestricted)){
     setBusy(false);setPaymentStatus('age-rejected');
     setError('Age restriction verification failed. Check Product metadata before retrying.');
     publish(cart,'age-rejected');return;
    }
    const eligible=cart.filter(item=>!item.ageRestricted);updateCart(eligible);
    if(!eligible.length){setPaymentStatus('age-rejected');publish([],'age-rejected');return;}
    setBusy(true);
    flowAction(props,'checkout',checkoutValue(eligible)).then(result=>{
     if(result===false||result?.error)throw Error(String(result?.error||'Checkout was not started.'));
     setPaymentStatus('pending');publish(eligible,'payment-pending');
    }).catch(cause=>setError(cause instanceof Error?cause.message:'Unable to continue checkout.'))
     .finally(()=>setBusy(false));
   }else if(status==='Accepted'){
    setPaymentStatus('complete');publish(cart,'complete',Math.round(Number(outputs.ChangeDue||0)*100));
   }else if(status==='OutOfStock'){
    setBusy(false);setPaymentStatus('failed');
    setError('Insufficient or unconfigured stock. No payment was accepted.');
    publish(cart,'payment-failed');
   }else if(status==='Declined'||status==='InsufficientCash'){
    setPaymentStatus(status==='Declined'?'declined':'insufficient-cash');
    publish(cart,status==='Declined'?'declined':'insufficient-cash');
   }
  };
  const failed=event=>{
   if(event.detail?.flowApiName!==flow)return;
   setBusy(false);setPaymentStatus('failed');
   setError('Checkout failed: '+(event.detail.message||'Unable to complete payment.'));
   publish(cart,'payment-failed');
  };
  const cancelled=event=>{
   if(event.detail?.flowApiName!==flow)return;
   setBusy(false);setPaymentStatus('cancelled');setError('Checkout was cancelled. The basket is unchanged.');
   publish(cart,'payment-cancelled');
  };
  window.addEventListener('metadrive:flow-completed',completed);
  window.addEventListener('metadrive:flow-failed',failed);
  window.addEventListener('metadrive:flow-cancelled',cancelled);
  return()=>{
   window.removeEventListener('metadrive:flow-completed',completed);
   window.removeEventListener('metadrive:flow-failed',failed);
   window.removeEventListener('metadrive:flow-cancelled',cancelled);
  };
 },[cart,vatRate,props.actionFlows,props.onAction]);
 React.useEffect(()=>{
  if(channel||props.stateSyncEnabled===true||!displaySession||typeof BroadcastChannel==='undefined')return undefined;
  const pair=new BroadcastChannel('metadrive:paired-display:'+displaySession);
  pair.onmessage=event=>{if(event.data?.type==='ready')publish(cart);};
  publish(cart);
  return()=>pair.close();
 },[displaySession,cart]);
 const add=product=>{
  if(locked||!sessionReady)return;
  const id=String(product.Id||''),label=name(product),unit=price(product);
  if(!id||!label||!Number.isSafeInteger(unit)||unit<0){setError('This product is missing a valid record ID, name or selling price.');return;}
  const current=cart.find(item=>item.productId===id);
  const next=current?cart.map(item=>item.productId===id?{...item,quantity:item.quantity+1}:item):[...cart,{
   productId:id,name:label,quantity:1,unitPriceMinor:unit,
   vatApplicable:product[props.vatApplicableFieldApiName||'VATApplicable']!==false,
   ageRestricted:product[props.ageRestrictedFieldApiName||'AgeRestricted']===true
  }];
  setError('');updateCart(next);
 };
 React.useEffect(()=>{
  if(!props.cartTargetKey||!props.pageSessionKey)return undefined;
  const receive=event=>{
   const detail=event.detail;
   if(detail?.pageSessionKey===props.pageSessionKey&&detail.cartTargetKey===props.cartTargetKey&&detail.record)add(detail.record);
  };
  window.addEventListener('metadrive:page-cart-add',receive);
  return()=>window.removeEventListener('metadrive:page-cart-add',receive);
 },[props.pageSessionKey,props.cartTargetKey,cart,locked,sessionReady]);
 const changeQuantity=(id,amount)=>{
  if(locked||!sessionReady)return;
  updateCart(cart.map(item=>item.productId===id?{...item,quantity:item.quantity+amount}:item)
   .filter(item=>item.quantity>0));
 };
 const checkoutValue=items=>{
  if(!request.current)request.current=crypto.randomUUID();
  return {...saleValue(items),sessionKey:channel?.key||props.sessionId,requestId:request.current};
 };
 const checkout=async()=>{if(props.previewOnly===true)return;
  if(!cart.length||locked||!sessionReady||channel?.error||!settingsReady)return;
  setBusy(true);setError('');
  try{
   const result=await flowAction(props,'checkout',checkoutValue(cart));
   if(result===false||result?.error)throw Error(String(result?.error||'Checkout was not started.'));
   setPaymentStatus('pending');publish(cart,'payment-pending');
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to start checkout.');}
  finally{setBusy(false);}
 };
 const openDisplay=()=>{
  if(props.stateSyncEnabled===true&&(!channel||!sessionReady)){
   setError('Secure till synchronisation is unavailable. Reconnect the session before opening the display.');return;
  }
  try{
   const target=new URL(String(props.customerDisplayUrl||''),window.location.href);
   if(!props.customerDisplayUrl)throw Error('Configure the customer display page URL in component properties.');
   if(target.origin!==window.location.origin)throw Error('The customer display must use this MetaDrive origin.');
   target.searchParams.set(props.stateSessionQueryParam||'displaySession',channel?.key||crypto.randomUUID());
   const opened=window.open(target.href,'_blank');
   if(!opened)throw Error('Allow pop-ups to open the customer display.');
   opened.opener=null;setDisplaySession(target.searchParams.get(props.stateSessionQueryParam||'displaySession')||'');setError('');
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to open the customer display.');}
 };
 const products=Array.isArray(props.records)?props.records:[];
 const barcode=item=>item[props.barcodeFieldApiName||'Barcode'];
 const sku=item=>item[props.skuFieldApiName||'SKU'];
 const categoryField=props.categoryFieldApiName||'Category';
 const productCategory=item=>String(item[categoryField]??'').trim();
 const categories=[...new Set(products.map(productCategory).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const filtered=products.filter(item=>(!selectedCategory||productCategory(item)===selectedCategory)&&[name(item),barcode(item),sku(item)]
  .some(value=>String(value||'').toLowerCase().includes(search.trim().toLowerCase())));
 const scan=event=>{
  if(event.key!=='Enter'||!search.trim())return;
  const needle=search.trim().toLowerCase();
  const match=products.find(item=>[name(item),barcode(item),sku(item)]
   .some(value=>String(value||'').trim().toLowerCase()===needle));
  if(match){event.preventDefault();add(match);setSearch('');}
 };
 const runOperation=operation=>{if(props.previewOnly===true)return;
  setError('');
  void flowAction(props,operation.event,{...saleValue(cart),sessionKey:channel?.key||props.sessionId})
   .catch(cause=>setError(cause instanceof Error?cause.message:'Unable to start operation.'));
 };
 React.useEffect(()=>{
  if(!props.pageSessionKey||!props.componentId)return undefined;
  const onToolbarAction=event=>{
   const detail=event.detail;
   if(detail?.pageSessionKey===props.pageSessionKey&&detail?.componentId===props.componentId&&detail?.action==='openDisplay')openDisplay();
  };
  window.addEventListener('metadrive:page-toolbar-action',onToolbarAction);
  return ()=>window.removeEventListener('metadrive:page-toolbar-action',onToolbarAction);
 },[props.pageSessionKey,props.componentId,openDisplay]);
 const pageToolbarOwnsHeader=Boolean(props.pageSessionKey)&&typeof document!=='undefined'&&
  document.querySelector('.header-page-context')?.getAttribute('data-page-session-key')===props.pageSessionKey;
 return <section className={"one-shopping-till"+(props.viewMode==="basket"?" one-shopping-basket-only":"")}>
  {props.viewMode!=='basket'&&!pageToolbarOwnsHeader&&<header className="one-row" style={{justifyContent:'space-between'}}>
   <div><small>{props.eyebrow||'SALES'}</small><h2 className="one-heading">{props.title||'Till'}</h2></div>
   <button className="one-btn" type="button" onClick={openDisplay}>{props.displayButtonLabel||'Open customer display'}</button>
  </header>}
  {operationError&&<p role="alert">{operationError}</p>}
  {props.viewMode!=='basket'&&operations.length>0&&<nav className="one-row" aria-label={props.operationsLabel||'Operations'}>
   {operations.map(operation=><button className="one-btn" type="button" key={operation.event}
    disabled={busy||paymentStatus==='pending'||(operation.requiresSession===true&&!sessionReady)||
     (operation.requiresNoSession===true&&channel?.exists)||(operation.requiresCart===true&&!cart.length)||
     (operation.requiresEmptyBasket===true&&cart.length>0)}
    onClick={()=>runOperation(operation)}>{operation.label}</button>)}
  </nav>}
  {channel&&!channel.ready&&<p role="status">Reconnecting to session…</p>}
  {channel&&channel.ready&&!channel.exists&&<p role="status">{props.sessionRequiredText||'Start a session to begin.'}</p>}
  {channel?.error&&<p role="alert">{channel.error}</p>}
  <div className="one-shopping-layout">
   {props.viewMode!=='basket'&&<section aria-label={props.productsLabel||'Products'}>
    <label className="one-label">{props.searchLabel||'Search or scan a product'}
     <input className="one-control" aria-label="Search products" value={search} onChange={event=>setSearch(event.target.value)}
      onKeyDown={scan} placeholder={props.searchPlaceholder||'Search or scan a product'}/>
    </label>
    {props.showCategoryTabs!==false&&categories.length>0&&<nav className="one-shopping-categories" aria-label={props.categoryTabsLabel||'Product categories'}>
     <button className="one-btn" type="button" aria-pressed={!selectedCategory} onClick={()=>setSelectedCategory('')}>{props.allCategoriesLabel||'All'}</button>
     {categories.map(category=><button key={category} className="one-btn" type="button" aria-pressed={selectedCategory===category} onClick={()=>setSelectedCategory(category)}>{category}</button>)}
    </nav>}
    {props.loading&&<p role="status">Loading products…</p>}
    {!props.loading&&!filtered.length&&<p className="one-empty">{props.emptyProductsText||'No products found.'}</p>}
    <div className="one-shopping-products">{filtered.map(product=><button className="one-item one-item--interactive"
     key={product.Id} type="button" disabled={locked||!sessionReady} onClick={()=>add(product)}>
     {props.showImage!==false&&product[props.imageFieldApiName||'ImageURL']&&<img loading="lazy" alt=""
      src={String(product[props.imageFieldApiName||'ImageURL'])}/>}
     {props.showTitle!==false&&<strong>{name(product)}</strong>}
     {props.showPrice!==false&&<span>{currency(price(product),props.currencyCode)}</span>}
     {props.showAddIcon===true&&<span className="md-card-add-icon" aria-hidden="true">＋</span>}
    </button>)}</div>
   </section>}
   <aside className="one-surface" aria-label={props.basketLabel||'Current sale'}>
    <h3 className="one-heading">{props.basketTitle||'Current sale'}</h3>
    <div aria-live="polite">{!cart.length&&<p className="one-empty">{props.emptyBasketText||'Scan or select products to start.'}</p>}
     {cart.map(item=><div className="one-shopping-line" key={item.productId}>
      <div><strong>{item.name}</strong><small>{currency(item.unitPriceMinor,props.currencyCode)} each</small></div>
      <div className="one-row"><button className="one-btn" type="button" aria-label={'Remove one '+item.name}
       disabled={locked||!sessionReady} onClick={()=>changeQuantity(item.productId,-1)}>−</button>
       <span>{item.quantity}</span><button className="one-btn" type="button" aria-label={'Add one '+item.name}
       disabled={locked||!sessionReady} onClick={()=>changeQuantity(item.productId,1)}>+</button></div>
      <strong>{currency(item.unitPriceMinor*item.quantity,props.currencyCode)}</strong>
     </div>)}
    </div>
    <div className="one-shopping-total"><span>{props.totalLabel||'Total'}</span><strong>{currency(gross,props.currencyCode)}</strong></div>
    {props.showVatTotal===true&&<div className="one-shopping-total"><span>{props.vatLabel||'VAT included'}</span>
     <span>{currency(vat,props.currencyCode)}</span></div>}
    {paymentStatus==='pending'&&<p role="status">{props.paymentPendingText||'Complete the payment step in the Flow screen.'}</p>}
    {paymentStatus==='complete'&&<p role="status">{props.paymentCompleteText||'Payment accepted. Clear the sale when ready.'}</p>}
    {paymentStatus==='age-rejected'&&<p role="status">{props.ageCheckFailedText||'Restricted products were removed. No eligible items remain.'}</p>}
    {paymentStatus==='insufficient-cash'&&<p role="status">{props.insufficientCashText||'Tendered cash was less than the sale total.'}</p>}
    {ageRestricted&&<button className="one-btn" type="button" disabled={locked||!sessionReady}
     onClick={()=>updateCart(cart.filter(item=>!item.ageRestricted))}>{props.removeRestrictedLabel||'Remove age-restricted items'}</button>}
    {error&&<p role="alert">{error}</p>}
    <button className="one-btn one-btn--primary" type="button" disabled={props.previewOnly===true||!cart.length||locked||!sessionReady||
     !settingsReady||Boolean(channel?.error)} onClick={()=>void checkout()}>{busy?'Starting checkout…':props.checkoutLabel||'Payment'}</button>
    <button className="one-btn" type="button" disabled={!cart.length||busy||paymentStatus==='pending'||!sessionReady}
     onClick={()=>updateCart([])}>{props.clearLabel||'Clear sale'}</button>
   </aside>
  </div>
 </section>;
}

export default function OneShoppingCart(props) {
 const p=props||{};
 const style={'--one-accent':p.accentColor||'#3176cc','--one-radius':Math.max(0,Number(p.radius??16))+'px',
  '--one-gap':Math.max(0,Number(p.gap??12))+'px','--one-pad':Math.max(0,Number(p.padding??16))+'px',
  width:p.width||'100%',
  '--one-catalogue-ratio':Math.min(85,Math.max(15,Number(p.catalogueWidthPercent??60)))+'fr',
  '--one-basket-ratio':(100-Math.min(85,Math.max(15,Number(p.catalogueWidthPercent??60))))+'fr',
  '--one-product-min-width':Math.min(400,Math.max(80,Number(p.productCardMinWidth??170)))+'px'};
 if(p.backgroundColor)style['--one-bg']=p.backgroundColor;
 if(p.textColor)style['--one-fg']=p.textColor;
 if(p.borderColor)style['--one-border']=p.borderColor;
 return <div className={'one-ui one-ui--'+(p.theme||'glass')+' one-ui--'+(p.size||'medium')} style={style}>
  {p.viewMode==='display'||p.standalonePresentation===true
   ?<ShoppingCartDisplay props={p}/>:<ShoppingCartTill props={p}/>}
 </div>;
}
