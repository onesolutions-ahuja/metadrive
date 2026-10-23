import * as React from 'react';
import {createPortal} from 'react-dom';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import './acetill-terminal.css';
import {acetillStyleCss,type AcetillVisualStyles} from './visual-styles';

type Row=Record<string,unknown>;
type Action={apiName:string;label:string};
type Item={id:string;name:string;price:number;image:string;category:string;categoryId:string;quantity:number};
type Category={id:string;name:string;order:number};
type Result={outputs?:Row;records?:Row[];interviewId?:string;completed?:boolean};
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
  if(!id||!name||row.Active===false||row.Active==='false'||row.IsVisiblePOS===false||row.IsVisiblePOS==='false')return null;
  const order=Number(row.POSSortOrder??row.DisplayOrder??0);
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
export default function AcetillTerminal({editorStyles}: {editorStyles?:AcetillVisualStyles} = {}){
  const [savedStyles,setSavedStyles]=React.useState<AcetillVisualStyles>({});
  React.useEffect(()=>{
    if(editorStyles !== undefined)return;
    let active=true;
    void apiRequest<{styles:AcetillVisualStyles}>('/apps/Acetill/visual-styles')
      .then(result=>{if(active)setSavedStyles(result.styles??{});})
      .catch(()=>{/* Default CSS remains authoritative if metadata is unavailable. */});
    return ()=>{active=false;};
  },[editorStyles]);
  const customCss=acetillStyleCss(editorStyles??savedStyles);
  const visualStyles=customCss?<style data-acetill-visual-overrides>{customCss}</style>:null;
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
  const [returnMode,setReturnMode]=React.useState(false);
  const [originalInvoice,setOriginalInvoice]=React.useState('');
  const [returnReason,setReturnReason]=React.useState('');
  const [returnLines,setReturnLines]=React.useState<Item[]>([]);
  const [returnConfirmed,setReturnConfirmed]=React.useState<Row|null>(null);
  const [tillLocked,setTillLocked]=React.useState(false);
  const [unlockPin,setUnlockPin]=React.useState('');
  const [unlockError,setUnlockError]=React.useState('');
  const [unlockBusy,setUnlockBusy]=React.useState(false);
  const [pinSetup,setPinSetup]=React.useState(false);
  const [setupPassword,setSetupPassword]=React.useState('');
  const [newPin,setNewPin]=React.useState('');
  const [setupStatus,setSetupStatus]=React.useState('');
  const [paymentMode,setPaymentMode]=React.useState<'cash'|'card'|null>(null);
  const [cashReceived,setCashReceived]=React.useState('');
  const [customerWindow,setCustomerWindow]=React.useState<Window|null>(null);
  const customerWindowRef=React.useRef<Window|null>(null);
  const paymentRequestId=React.useRef(crypto.randomUUID());
  const openCustomerDisplay=()=>{
    const current=customerWindowRef.current;
    if(current&&!current.closed){current.focus();return;}
    const popup=window.open('','acetill-customer-display','popup=yes,width=900,height=720');
    if(!popup){setError('Customer display popup was blocked. Allow popups for Acetill.');return;}
    popup.document.title='Acetill • Customer display';
    popup.document.body.innerHTML='';
    const style=popup.document.createElement('style');
    style.textContent='body{margin:0;background:#f6f9fe;color:#1c293b;font-family:Inter,system-ui,sans-serif} .customer-screen{min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column;padding:clamp(20px,4vw,50px);gap:20px}.customer-screen h1{font-size:clamp(30px,5vw,58px);margin:0;color:#1267e5}.customer-items{flex:1;overflow-y:auto}.customer-item{display:flex;justify-content:space-between;padding:18px 0;border-bottom:1px solid #dfe7f1;font-size:clamp(18px,2.5vw,30px)}.customer-total{display:flex;justify-content:space-between;border-top:3px solid #cbd7e8;padding-top:24px;font-size:clamp(24px,4vw,48px);font-weight:800}.customer-thankyou{margin:auto;text-align:center;font-size:clamp(28px,5vw,60px)}';
    popup.document.head.appendChild(style);
    customerWindowRef.current=popup;
    setCustomerWindow(popup);
  };
  React.useEffect(()=>{
    return ()=>{const popup=customerWindowRef.current;if(popup&&!popup.closed)popup.close();};
  },[]);
  const customerDisplay=customerWindow&&!customerWindow.closed?createPortal(
    <div className="customer-screen">
      <h1>Welcome to Acetill</h1>
      {receipt?<div className="customer-thankyou" role="status">Thank you for shopping with us!<p>Payment complete</p></div>:
        <><h2>{cart.length?'Your order':'Your order will appear here'}</h2>
          <div className="customer-items">{cart.map(item=><div className="customer-item" key={item.id}>
            <span>{item.quantity} × {item.name}</span><strong>{amount(item.quantity*item.price)}</strong>
          </div>)}</div>
          <div className="customer-total"><span>Subtotal</span><span>{amount(cart.reduce((n,item)=>n+item.quantity*item.price,0))}</span></div>
          <p>Final total confirmed at payment</p></>}
    </div>,customerWindow.document.body):null;
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
  const unlockTill=find('VerifyUserPin');
  const paymentCash=find('PaymentCash');
  const paymentCard=find('PaymentCard');
  const loadReturn=find('LoadReturnInvoice');
  const createReturn=find('CreateSalesReturn');
  const printReturn=find('PrintReceipt');
  const openReturn=()=>{setReturnMode(true);setReturnConfirmed(null);setReturnLines([]);setOriginalInvoice('');setReturnReason('');setError('');};
  const searchReturn=async()=>{
    if(!loadReturn||!originalInvoice.trim())return;
    try{
      const result=await execute(loadReturn,{invoiceNumber:originalInvoice.trim()});
      const rows=extractRows(result);
      const invoice=result.outputs?.invoice as Row|undefined;
      if(!invoice||!rows.length)throw Error('No eligible invoice lines were returned.');
      setReturnLines(rows.map(product).filter((x):x is Item=>!!x).map(x=>({...x,quantity:0})));
      if(!rows.length)setError('No items available to return.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const submitReturn=async()=>{
    if(!createReturn||!originalInvoice||!returnReason.trim()||!returnLines.some(x=>x.quantity>0))return;
    try{
      const result=await execute(createReturn,{
        originalInvoiceNumber:originalInvoice.trim(),reason:returnReason.trim(),
        requestId:crypto.randomUUID(),
        lines:returnLines.filter(x=>x.quantity>0).map(x=>({productId:x.id,quantity:x.quantity}))
      });
      const outputs=result.outputs??{};
      if(result.interviewId||result.completed!==true||
        !['complete','completed'].includes(asText(outputs.status).toLowerCase())||
        !outputs.srnInvoiceId)throw Error('Return not confirmed by the server Flow.');
      setReturnConfirmed(outputs);
      setMessage('Sales return confirmed.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
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
    void executeRead(getCategories,{active:true,isVisiblePOS:true,sortField:'POSSortOrder',sortOrder:'Ascending'})
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
  const add=(item:Item)=>{paymentRequestId.current=crypto.randomUUID();setCart(v=>{const exists=v.some(x=>x.id===item.id);return exists?v.map(x=>x.id===item.id?{...x,quantity:x.quantity+1}:x):[...v,{...item}];});};
  const change=(id:string,delta:number)=>{paymentRequestId.current=crypto.randomUUID();setCart(v=>v.map(x=>x.id===id?{...x,quantity:x.quantity+delta}:x).filter(x=>x.quantity>0));};
  const received=Number(cashReceived);
  const tenderValid=Number.isFinite(received)&&cashReceived.trim()!==''&&
    Math.round(received*100)>=Math.round(subtotal*100);
  const changeDue=tenderValid?(Math.round(received*100)-Math.round(subtotal*100))/100:0;
  const confirmPayment=async()=>{
    const method=paymentMode;
    const flow=method==='cash'?paymentCash:paymentCard;
    if(!method||!flow||!cart.length||busy||(method==='cash'&&!tenderValid))return;
    try {
      const result=await execute(flow,{
        cartItems:cart.map(x=>({Product:x.id,Quantity:x.quantity})),
        requestId:paymentRequestId.current,
        cartTotal:subtotal,paymentMethod:method==='cash'?'Cash':'Card',
        ...(method==='cash'?{cashReceived:received,changeDue}:{cardPaymentConfirmed:true})
      });
      const outputs=result.outputs??{};
      const status=asText(outputs.status).toLowerCase();
      const completed=!result.interviewId&&(
        result.completed===true||status==='complete'||status==='completed'||status==='success');
      if(completed){
        setReceipt(outputs);
        setCart([]);
        paymentRequestId.current=crypto.randomUUID();
        setPaymentMode(null);
        setCashReceived('');
        setMessage('Sale confirmed by '+flow.apiName+'.');
      }else {
        setError(result.interviewId?'Payment Flow is still running; sale was not confirmed.':
          asText(outputs.message??'Payment Flow has not confirmed this sale.'));
      }
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const unlockTillScreen=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!unlockTill||unlockBusy||!/^\\d{4,8}$/.test(unlockPin))return;
    setUnlockBusy(true);setUnlockError('');
    try {
      // The Flow must compare a protected current-user PIN on the server.
      // Never retrieve or expose the stored PIN to the browser.
      const response=await apiRequest<Result>('/flows/'+encodeURIComponent(unlockTill.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({pin:unlockPin})
      });
      if(!response.interviewId&&response.completed===true&&response.outputs?.verified===true){
        setTillLocked(false);setUnlockPin('');
      }else setUnlockError('Incorrect PIN or verification unavailable.');
    }catch{setUnlockError('PIN verification failed. Please try again.');}
    finally{setUnlockPin('');setUnlockBusy(false);}
  };
  const saveTillPin=async(e:React.FormEvent)=>{
    e.preventDefault();setSetupStatus('');
    if(!/^\\d{4,8}$/.test(newPin))return;
    try{
      await apiRequest('/me/till-pin',{method:'POST',body:JSON.stringify({password:setupPassword,pin:newPin})});
      setSetupPassword('');setNewPin('');setPinSetup(false);setSetupStatus('Till PIN saved securely.');
    }catch{setSetupStatus('Unable to save PIN. Check your current password and try again.');}
  };
  const pinSetupDialog=pinSetup&&!tillLocked?<div className="acetill-pin-setup-backdrop" role="dialog" aria-modal="true" aria-label="Set till PIN">
    <form className="acetill-pin-setup" onSubmit={e=>void saveTillPin(e)}>
    <h2>Set your till PIN</h2><p>Your PIN protects this till screen without logging you out.</p>
    <label>Current login password<input type="password" autoComplete="current-password" required value={setupPassword} onChange={e=>setSetupPassword(e.target.value)}/></label>
    <label>New PIN (4–8 digits)<input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,8}" required value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\\D/g,'').slice(0,8))}/></label>
    {setupStatus&&<p role="alert">{setupStatus}</p>}
    <div><button type="button" onClick={()=>{setPinSetup(false);setSetupPassword('');setNewPin('');}}>Cancel</button><button type="submit">Save PIN</button></div>
    </form></div>:null;
  const settingsButton=<button type="button" className="acetill-lock-button" data-acetill-element="settings" title="Set till PIN" aria-label="Set till PIN" onClick={()=>{setPinSetup(true);setSetupStatus('');}}>⚙</button>;
  const lockButton=<button type="button" className="acetill-lock-button" data-acetill-element="lock" title="Lock till" aria-label="Lock till" onClick={()=>{setTillLocked(true);setUnlockPin('');setUnlockError('');}}>🔒</button>;
  const lockedOverlay=tillLocked?<div className="acetill-lock-screen" role="dialog" aria-modal="true" aria-label="Till locked">
    <div className="acetill-lock-panel"><div className="acetill-lock-symbol">🔒</div><h1>Till locked</h1><p>Enter your user PIN to resume this till.</p>
    <form onSubmit={e=>void unlockTillScreen(e)}><label htmlFor="acetill-unlock-pin">User PIN</label>
    <input id="acetill-unlock-pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required value={unlockPin} onChange={e=>setUnlockPin(e.target.value.replace(/\\D/g,'').slice(0,8))} autoFocus />
    {unlockError&&<p role="alert">{unlockError}</p>}
    {!unlockTill&&<p role="alert">AcetillVerifyUserPin Flow is not configured or permitted.</p>}
    <button disabled={unlockBusy||!unlockTill||unlockPin.length<4} type="submit">{unlockBusy?'Checking…':'Unlock till'}</button></form>
    <button className="acetill-lock-logout" type="button" onClick={()=>{void apiRequest('/auth/logout',{method:'POST'}).catch(()=>{}).finally(()=>window.location.assign('/login'));}}>Log out</button>
    </div></div>:null;
  const displayButton=<button type="button" className="acetill-display-button" data-acetill-element="customerDisplay" onClick={openCustomerDisplay}
    aria-label="Open customer display on second screen" title="Open customer display">▣ <span>Customer display</span></button>;
  const paymentDialog=paymentMode?<div className="acetill-payment-backdrop" role="presentation">
    <section className="acetill-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="acetill-payment-title">
      <h2 id="acetill-payment-title">{paymentMode==='cash'?'Cash payment':'Card Payment Done?'}</h2>
      {paymentMode==='cash'?<>
        <p>Amount due: <strong>{amount(subtotal)}</strong></p>
        <label>Cash received (£)<input type="number" inputMode="decimal" min={subtotal.toFixed(2)}
          step="0.01" autoFocus value={cashReceived} onChange={e=>setCashReceived(e.target.value)}/></label>
        <p>Change to return: <strong>{amount(changeDue)}</strong></p>
      </>:<p>Has the card payment been completed successfully on the card terminal?</p>}
      {error&&<p role="alert" className="acetill-error">{error}</p>}
      <div className="acetill-payment-buttons">
        <button type="button" disabled={busy} onClick={()=>{setPaymentMode(null);setError('');}}>No / Cancel</button>
        <button type="button" className="acetill-charge" disabled={busy||
          (paymentMode==='cash'?(!paymentCash||!tenderValid):!paymentCard)} onClick={()=>void confirmPayment()}>
          {busy?'Saving…':paymentMode==='cash'?'Tender cash':'Yes, payment done'}
        </button>
      </div>
      {!(paymentMode==='cash'?paymentCash:paymentCard)&&<p role="status">Configure and permit the {paymentMode==='cash'?'AcetillPaymentCash':'AcetillPaymentCard'} Flow.</p>}
    </section>
  </div>:null;
  if(returnMode)return <>{visualStyles}{lockedOverlay}<main className="acetill-receipt-screen" aria-label="Sales return">
    <section className="acetill-receipt-panel" style={{maxWidth:760}}>
      <h1>Sales return (SRN)</h1><p>Find a completed sale and select items to return. The server Flow validates all return limits and writes a linked negative invoice.</p>
      <label>Original invoice number <input aria-label="Original invoice number" value={originalInvoice} disabled={busy||!!returnConfirmed} onChange={e=>setOriginalInvoice(e.target.value)}/></label>
      <button type="button" disabled={!loadReturn||busy||!!returnConfirmed||!originalInvoice.trim()} onClick={()=>void searchReturn()}>Find invoice</button>
      {!loadReturn&&<p role="status">Configure and permit AcetillLoadReturnInvoice to load eligible invoice lines.</p>}
      {returnLines.map(line=><div key={line.id} className="acetill-line">
        <strong>{line.name}</strong><span>{amount(line.price)}</span>
        <label>Return quantity<input aria-label={'Return quantity for '+line.name} type="number" min="0" max="99999" step="1" disabled={busy||!!returnConfirmed}
          value={line.quantity} onChange={e=>setReturnLines(v=>v.map(x=>x.id===line.id?{...x,quantity:Math.max(0,Math.floor(Number(e.target.value)||0))}:x))}/></label>
      </div>)}
      <label>Return reason <input aria-label="Return reason" value={returnReason} disabled={busy||!!returnConfirmed} onChange={e=>setReturnReason(e.target.value)}/></label>
      <p>Requested return: {amount(returnLines.reduce((n,x)=>n+x.quantity*x.price,0))}</p>
      {!returnConfirmed?<button type="button" className="acetill-charge" disabled={busy||!createReturn||!returnReason.trim()||!returnLines.some(x=>x.quantity>0)}
        onClick={()=>void submitReturn()}>Create SRN</button>:
        <><p role="status">Confirmed SRN: {asText(returnConfirmed.srnInvoiceNumber??returnConfirmed.srnInvoiceId)}</p>
        <button type="button" disabled={!printReturn||busy} onClick={()=>void execute(printReturn!,{
          invoiceId:returnConfirmed.srnInvoiceId,documentType:'SRN',templateApiName:'AcetillSRNReceipt'
        }).then(()=>setMessage('SRN print Flow submitted.')).catch(e=>setError(String(e)))}>Print SRN</button></>}
      {!createReturn&&<p role="status">The AcetillCreateSalesReturn Flow must be published and permitted before returns can be saved.</p>}
      {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      <button type="button" onClick={()=>{setReturnMode(false);setError('');}}>Back to till</button>
    </section>
  </main></>;
  return receipt?<>{visualStyles}{lockedOverlay}{pinSetupDialog}<main className="acetill-receipt-screen" aria-label="Sale completed">
    <section className="acetill-receipt-panel"><div className="acetill-receipt-icon" aria-hidden="true">✓</div>
      <h1>Payment complete</h1>{lockButton}<p>Your OneEngine checkout Flow confirmed this transaction.</p>
      <dl><div><dt>Invoice reference</dt><dd>{asText(receipt.invoiceId??receipt.invoiceNumber??receipt.InvoiceId)||'Confirmed'}</dd></div>
      {receipt.total!=null&&<div><dt>Final total</dt><dd>{amount(Number(receipt.total))}</dd></div>}</dl>
      <div className="acetill-receipt-actions">
        {find('PrintReceipt')&&<button type="button" disabled={busy} onClick={()=>void execute(find('PrintReceipt')!,{invoiceId:receipt.invoiceId??receipt.InvoiceId}).then(()=>setMessage('Receipt print Flow submitted.')).catch(e=>setError(String(e)))}>Print receipt</button>}
        {find('EmailReceipt')&&<button type="button" disabled={busy} onClick={()=>void execute(find('EmailReceipt')!,{invoiceId:receipt.invoiceId??receipt.InvoiceId}).then(()=>setMessage('Receipt email Flow submitted.')).catch(e=>setError(String(e)))}>Email receipt</button>}
        <button type="button" className="acetill-charge" onClick={()=>{setReceipt(null);setMessage('');setError('');}}>New sale</button>
      </div>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    </section></main>{customerDisplay}</>:<>{visualStyles}{lockedOverlay}{pinSetupDialog}<main className="acetill-terminal">
    <section className="acetill-shop" aria-label="Acetill product catalogue">
      <div className="acetill-topline" data-acetill-element="topbar">
        <nav aria-label="Product categories" className="acetill-category-tabs" data-acetill-element="categories">
          <button type="button" className={!category?'selected':''} aria-pressed={!category} onClick={()=>setCategory('')}>All items</button>
          {categories.map(c=><button key={c.id} type="button" className={c.id===category?'selected':''} aria-pressed={c.id===category} onClick={()=>setCategory(c.id)}>{c.name}</button>)}
        </nav>
        {lockButton}{settingsButton}{displayButton}<button type="button" onClick={openReturn}>Sales return</button>
        <label className="acetill-search" data-acetill-element="search"><span aria-hidden="true">⌕</span><input aria-label="Find products" placeholder="Search products" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      </div>
      {loading?<p role="status">Loading permitted workflows…</p>:!getProducts?<p className="acetill-state" role="status">Configure and activate the AcetillGetProducts Flow to populate your catalogue using Get Records.</p>:null}
      {error&&<p role="alert" className="acetill-error">{error}</p>}
      {message&&<p role="status" className="acetill-state">{message}</p>}
      <div className="acetill-catalogue-scroll" tabIndex={0} aria-label="Scrollable product catalogue">
      {!getCategories&&!loading&&<p className="acetill-state">Configure AcetillGetCategories Flow to load category tabs.</p>}
      {catalogueLoading&&<p role="status" className="acetill-state">Loading products…</p>}
      <div className="acetill-product-grid" data-acetill-element="products">
        {shown.map(p=><button type="button" key={p.id} className="acetill-product" onClick={()=>add(p)} disabled={busy}>
          <div className="acetill-product-art">{p.image?<img src={p.image} alt="" loading="lazy"/>:<span aria-hidden="true">◻</span>}</div>
          <div className="acetill-product-meta"><strong>{p.name}</strong><span>{amount(p.price)}</span></div>
        </button>)}
      </div>
      {getProducts&&!catalogueLoading&&!shown.length&&<p className="acetill-state">No matching products returned by your Flow.</p>}
      </div>
      <div className="acetill-quick-actions" data-acetill-element="quickActions">
        {['Discount','Rewards','GiftCards','More'].map(label=>{
          const action=find(label);
          return <button key={label} type="button" disabled={!action||busy} title={!action?'Configure Acetill'+label+' Flow':undefined}
            onClick={()=>action&&void execute(action,{cartItems:cart.map(x=>({productId:x.id,quantity:x.quantity}))}).then(()=>setMessage(label+' workflow started')).catch(e=>setError(String(e)))}>
            {label==='Discount'?'◇':label==='Rewards'?'♧':label==='GiftCards'?'▣':'•••'} &nbsp;{label==='GiftCards'?'Gift cards':label}
          </button>;
        })}
      </div>
    </section>
    <aside className="acetill-current-order" data-acetill-element="order" aria-label="Current order">
      <div className="acetill-order-heading" data-acetill-element="orderHeading"><strong>Current order ({count})</strong><button type="button" aria-label="Clear order" disabled={!count||busy} onClick={()=>{paymentRequestId.current=crypto.randomUUID();setCart([]);}}>⌫</button></div>
      <div className="acetill-lines">{cart.length?cart.map(p=><div className="acetill-line" key={p.id}>
        <div className="acetill-line-art">{p.image?<img src={p.image} alt=""/>:<span aria-hidden="true">◻</span>}</div>
        <div className="acetill-line-details"><strong>{p.name}</strong><div className="acetill-qty">
          <button type="button" aria-label={'Remove '+p.name} onClick={()=>change(p.id,-1)}>−</button><span>{p.quantity}</span>
          <button type="button" aria-label={'Add '+p.name} onClick={()=>change(p.id,1)}>+</button>
        </div></div><span className="acetill-line-price">{amount(p.price*p.quantity)}</span>
      </div>):<div className="acetill-empty">Select a product to start an order.</div>}</div>
      <div className="acetill-checkout" data-acetill-element="checkout"><div className="acetill-subtotal"><span>Estimated subtotal</span><span>{amount(subtotal)}</span></div>
        <p>Final tax, discounts and payment are calculated by OneEngine Flows.</p>
        <div className="acetill-total"><strong>Subtotal</strong><strong>{amount(subtotal)}</strong></div>
        <div className="acetill-payment-choices" data-acetill-element="paymentChoices">
          <button type="button" className="acetill-charge" data-acetill-element="cash" disabled={!cart.length||busy}
            onClick={()=>{setError('');setCashReceived('');setPaymentMode('cash');}}>Cash</button>
          <button type="button" className="acetill-charge" data-acetill-element="card" disabled={!cart.length||busy}
            onClick={()=>{setError('');setPaymentMode('card');}}>Card</button>
        </div>
      </div>
    </aside>
  </main>{paymentDialog}{customerDisplay}</>;
}
