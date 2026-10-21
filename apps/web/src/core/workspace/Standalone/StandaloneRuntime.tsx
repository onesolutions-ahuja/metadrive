import * as React from 'react';
import {useCallback,useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import {resolveSqlComponentLibrary} from '../../components/Registry/bundledRegistryClient';
import type {LightningAppMetadata,LightningPageMetadata,ObjectMetadata,LibraryComponentMetadata} from '../../metadata/Definitions/metadata';
import type {AppRoute} from '../Navigation/appRouting';
import type {StandaloneEntry} from './standaloneEntries';
import './standaloneRuntime.css';

type AllowedCatalog={
  apps: LightningAppMetadata[];
  pages:LightningPageMetadata[];
  objects:ObjectMetadata[];
  libraryComponents:LibraryComponentMetadata[];
};
type LibraryResponse={
  components: LibraryComponentMetadata[];
  registered: Array<{apiName:string;rendererKey:string}>;
};
type RuntimeProps={entry:StandaloneEntry; onLogout:()=>void};
const LazyPublishedRuntime=React.lazy(async()=>{
  const {createPageRuntimeViews}=await import('../../pages/PageRuntime/pageRuntimeViews');
  return {default:createPageRuntimeViews(apiRequest).LightningAppRuntime};
});

/** Product-specific navigation around the shared, permission-checked SQL Page Runtime. */
export default function StandaloneRuntime({entry,onLogout}:RuntimeProps) {
  const [catalog,setCatalog]=useState<AllowedCatalog|null>(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [page,setPage]=useState(()=>new URLSearchParams(window.location.search).get('page')??'');
  const [phone,setPhone]=useState(()=>window.matchMedia('(max-width:600px)').matches);
  useEffect(()=>{
    const onPop=()=>setPage(new URLSearchParams(window.location.search).get('page')??'');
    const onResize=()=>setPhone(window.matchMedia('(max-width:600px)').matches);
    window.addEventListener('popstate',onPop);
    window.addEventListener('resize',onResize);
    return ()=>{window.removeEventListener('popstate',onPop);window.removeEventListener('resize',onResize);};
  },[]);
  useEffect(()=>{
    let active=true;
    setError('');
    void (async()=>{
      // Authoritative list includes only installed, entitled apps permitted by RBAC.
      const appResponse=await apiRequest<{apps:LightningAppMetadata[]}>('/metadata/apps');
      const app=appResponse.apps.find(item=>item.apiName===entry.appId);
      if(!app)throw Error(entry.label+' is not installed, licensed or permitted for this user. Contact your UNE Solutions administrator.');
      const [objectResponse,pageResponse,libraryResponse]=await Promise.all([
        apiRequest<{objects:ObjectMetadata[]}>('/metadata/objects'),
        apiRequest<{pages:LightningPageMetadata[]}>('/metadata/pages'),
        apiRequest<LibraryResponse>('/component-library')
      ]);
      const bundles=await resolveSqlComponentLibrary(libraryResponse.registered??[]);
      if(active)setCatalog({
        apps:[app],objects:objectResponse.objects,pages:pageResponse.pages,
        libraryComponents:[...libraryResponse.components,...bundles]
      });
    })().catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));});
    return ()=>{active=false;};
  },[entry]);
  const app=catalog?.apps[0];
  const allowedPages=app?.navigationPageApiNames??[];
  const selectedPage=page && allowedPages.includes(page)?page:'';
  const navigate=useCallback((route:AppRoute)=>{
    if(route.kind!=='app-home'&&route.kind!=='app-page') {
      setMessage('This destination is not part of the standalone app. Configure an app page in UNE Solutions.');
      return;
    }
    if(route.appId!==entry.appId || route.kind==='app-page' && !allowedPages.includes(route.pageApiName)) {
      setMessage('That page is not available to this application.');
      return;
    }
    const nextPage=route.kind==='app-page'?route.pageApiName:'';
    const url=new URL(window.location.href);
    if(nextPage)url.searchParams.set('page',nextPage);
    else url.searchParams.delete('page');
    window.history.pushState({},'',url.pathname+url.search);
    setPage(nextPage);setMessage('');
  },[entry.appId,allowedPages.join('|')]);
  const launchFlow=useCallback((flowApiName:string,inputs?:Record<string,unknown>)=>{
    setMessage('Running action…');
    void apiRequest('/flows/'+encodeURIComponent(flowApiName)+'/execute',{
      method:'POST',body:JSON.stringify({inputs:inputs??{}})
    }).then(()=>{
      setMessage('Action submitted.');setRefresh(current=>current+1);
    }).catch(e=>setMessage(e instanceof Error?e.message:'Unable to run action'));
  },[]);
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}
    catch{/* Client session always clears, even when server is unavailable. */}
    finally{onLogout();}
  };
  return <div className="standalone-product" style={{'--product-accent':app?.brandColor||entry.accent} as React.CSSProperties}>
    <header className="standalone-product-header">
      <button className="standalone-product-brand" type="button" onClick={()=>navigate({kind:'app-home',appId:entry.appId})}>
        <span className="standalone-product-mark" aria-hidden="true">{entry.label.slice(0,1)}</span>
        <span><strong>{entry.label}</strong><small>{entry.tagline}</small></span>
      </button>
      <button type="button" className="standalone-product-logout" onClick={()=>void logout()}>Sign out</button>
    </header>
    {catalog && allowedPages.length>0 && <nav className="standalone-product-nav" aria-label={entry.label+' pages'}>
      <button type="button" aria-current={!selectedPage?'page':undefined} onClick={()=>navigate({kind:'app-home',appId:entry.appId})}>Home</button>
      {allowedPages.map(apiName=><button key={apiName} type="button"
        aria-current={selectedPage===apiName?'page':undefined}
        onClick={()=>navigate({kind:'app-page',appId:entry.appId,pageApiName:apiName})}>
          {catalog.pages.find(p=>p.apiName===apiName)?.label??apiName}
        </button>)}
    </nav>}
    <main className="standalone-product-content">
      {!catalog && !error && <p role="status">Loading your authorised {entry.label} workspace…</p>}
      {error && <section role="alert" className="standalone-product-message"><h2>App access unavailable</h2><p>{error}</p></section>}
      {catalog && <>
        {page && !allowedPages.includes(page) && <p role="alert">The requested page is not assigned to your app. Showing Home.</p>}
        {message && <p role="status" className="standalone-product-message">{message}</p>}
        <React.Suspense fallback={<p role="status">Loading published page…</p>}>
          <LazyPublishedRuntime key={entry.appId+':'+selectedPage+':'+refresh}
            appId={entry.appId} pageApiName={selectedPage||undefined}
            apps={catalog.apps} objects={catalog.objects} pages={catalog.pages}
            libraryComponents={catalog.libraryComponents} reports={[]} availableFlows={[]}
            formFactor={phone?'Phone':'Desktop'} onNavigate={navigate}
            onLaunchFlow={launchFlow} onStandaloneModeChange={()=>{}}/>
        </React.Suspense>
      </>}
    </main>
  </div>;
}
