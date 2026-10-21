import * as React from 'react';
import {apiBase,apiRequest,setAccessToken} from '../../web/src/core/authentication/Client/authClient';
import {createLoginView} from '../../web/src/core/authentication/Login/loginView';
import OneShoppingCart from '../../web/src/one/OneShoppingCart/OneShoppingCart';
import '../../web/src/one/OneShoppingCart/OneShoppingCart.css';
import './acetill.css';

const Login=createLoginView('/une-solutions-logo.webp');
type Gate='checking'|'anonymous'|'authorizing'|'ready'|'denied'|'error';
type Page={apiName:string;components?:Array<{componentApiName?:string;definitionApiName?:string;properties?:Record<string,unknown>}>};
const PAGES=['AcetillRegister','AcetillSale','AcetillCheckout','AcetillReceipt'] as const;

export default function AcetillShell() {
  const [gate,setGate]=React.useState<Gate>('checking');
  const [message,setMessage]=React.useState('');
  const [pages,setPages]=React.useState<Page[]>([]);
  const [products,setProducts]=React.useState<Array<Record<string,unknown>>>([]);
  const [screen,setScreen]=React.useState<string>('AcetillSale');
  const [currency,setCurrency]=React.useState('GBP');

  const authorize=React.useCallback(async()=>{
    setGate('authorizing');
    try{
      // The application home endpoint checks tenant install, entitlement and page RBAC.
      // Do not reveal product records until app authorization has succeeded.
      await apiRequest('/apps/Acetill/home-page?formFactor=Desktop');
      const metadata=await apiRequest<{pages:Page[]}>('/metadata/pages');
      const found=(metadata.pages||[]).filter(p=>PAGES.includes(p.apiName as typeof PAGES[number]));
      if(!found.some(p=>p.apiName==='AcetillSale'))throw Error('Acetill pages are not installed or published for this tenant.');
      setPages(found);
      const result=await apiRequest<{records:Array<Record<string,unknown>>}>('/records/Product?limit=100');
      setProducts(Array.isArray(result.records)?result.records:[]);
      setGate('ready');
    }catch(e){
      const msg=e instanceof Error?e.message:String(e);
      setMessage(msg);
      setGate(/403|denied|unauthori|not installed|licen/i.test(msg)?'denied':'error');
    }
  },[]);
  React.useEffect(()=>{
    let live=true;
    fetch(apiBase+'/auth/refresh?landing=1',{method:'POST',credentials:'include'})
      .then(async res=>{
        if(!live)return;
        if(res.status===401){setGate('anonymous');return;}
        if(!res.ok)throw Error('Session verification failed ('+res.status+').');
        const session=await res.json();
        if(!session.access_token)throw Error('No authenticated session.');
        setAccessToken(session.access_token);
        if(live)void authorize();
      }).catch(err=>{if(live){setMessage(String(err));setGate('error');}});
    const onExpired=()=>{setAccessToken(undefined);setGate('anonymous');};
    window.addEventListener('metadrive:session-expired',onExpired);
    return()=>{live=false;window.removeEventListener('metadrive:session-expired',onExpired);};
  },[authorize]);
  const signOut=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* Invalidate the local access token regardless. */}
    setAccessToken(undefined);setProducts([]);setGate('anonymous');
  };
  const sale=pages.find(p=>p.apiName==='AcetillSale');
  const cartProps=Object.assign({},...((sale?.components||[])
    .filter(c=>c.componentApiName==='OneShoppingCart'||c.definitionApiName==='OneShoppingCart')
    .map(c=>c.properties||{})));
  const titleProps=Object.assign({},...((sale?.components||[])
    .filter(c=>c.componentApiName==='OneText'||c.definitionApiName==='OneText')
    .map(c=>c.properties||{})));
  return <div className="acetill-root">
    {gate==='checking'||gate==='authorizing'?<div className="acetill-center" role="status">Loading Acetill…</div>
    :gate==='anonymous'?<div className="acetill-login"><div className="acetill-brand"><span className="acetill-mark">A</span><h1>Acetill</h1><p>Sign in with your UNE Solutions account</p></div><Login onSuccess={()=>void authorize()}/></div>
    :gate==='denied'||gate==='error'?<div className="acetill-center" role="alert"><h1>Acetill access unavailable</h1><p>{message}</p><button onClick={()=>void authorize()}>Retry</button><button onClick={()=>void signOut()}>Sign out</button></div>
    :<><header className="acetill-header"><div className="acetill-brand-inline"><span className="acetill-mark">A</span><strong>Acetill</strong><span className="acetill-label">Point of sale</span></div><nav aria-label="POS screens">{PAGES.filter(p=>pages.some(x=>x.apiName===p)).map(p=><button key={p} className={screen===p?'selected':''} onClick={()=>setScreen(p)}>{p.replace('Acetill','')}</button>)}</nav><button onClick={()=>void signOut()}>Sign out</button></header><main className="acetill-main"><div className="acetill-heading"><h1>{screen==='AcetillSale'?String(titleProps.text||'New sale'):screen.replace('Acetill','')}</h1><span>Managed in UNE Solutions</span></div>{screen==='AcetillSale'?<OneShoppingCart {...cartProps} records={products} currencyCode={String(cartProps.currencyCode||currency)} nameFieldApiName={String(cartProps.nameFieldApiName||'Name')} priceFieldApiName={String(cartProps.priceFieldApiName||'Price')} viewMode="till" previewOnly={true} standalonePresentation={false} />:<div className="acetill-placeholder"><h2>{screen.replace('Acetill','')}</h2><p>This screen is configured in UNE Solutions. Transaction actions remain unavailable until your published Flow is assigned.</p></div>}</main></>}
  </div>;
}
