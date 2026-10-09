import { useMemo, useState } from 'react';
import { Activity, ArrowRight, Bell, ChevronRight, Command, Database, LayoutGrid, Menu, Search, Settings2, Sparkles, X } from 'lucide-react';
import { objectMetadata, setupNavigation, workspaces } from '../metadata';
import './theme.css';

const routeMap: Record<string, string> = {
  'Setup Home':'home','Object Manager':'object-manager','Lightning App Builder':'page-builder',
  'App Manager':'app-manager','Component Library':'component-library','AppExchange':'app-exchange',
  'Une Connectors':'connector-settings','Named Credentials':'named-credentials',
  'Flows':'flow-builder','Paused and Waiting Interviews':'flow-interviews',
  'Scheduled Flows':'scheduled-flows','Failed Flow Logs':'flow-logs',
  'Approval Processes':'approval-processes','Process Automation Settings':'scheduled-flows',
  'Reports':'report-builder','Dashboards':'dashboard-builder',
  'Company Information':'company-settings','Currencies':'company-settings',
  'Users':'rbac','Roles':'rbac','Public Groups':'rbac','Profiles':'rbac',
  'Permission Sets':'rbac','Permission Set Groups':'rbac','Sharing Settings':'rbac','Sharing Rules':'rbac',
  'Objects':'object-manager','Fields & Relationships':'object-manager',
  'Page Layouts':'object-manager','Record Types':'object-manager'
};
const destination = (name: string) => '/une/setup/' + (routeMap[name] ?? 'home');
const sections = setupNavigation.map(group=>({...group,items:group.items.map(name=>({name,url:destination(name)}))}));
const pathToName = (path: string) => {
  if(path === '/theme' || path === '/theme/') return 'Overview';
  const slug=decodeURIComponent(path.slice('/theme/'.length));
  return [...sections.flatMap(section=>section.items.map(item=>item.name)), ...objectMetadata.map(obj=>obj.apiName)]
    .find(name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-')===slug) ?? 'Overview';
};
const slugFor=(name:string)=>'/theme/'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
export default function MetaDriveReactGateway() {
  const [path,setPath]=useState(window.location.pathname);
  const [query,setQuery]=useState('');
  const [menu,setMenu]=useState(false);
  const [groups,setGroups]=useState<string[]>(setupNavigation.map(g=>g.group));
  const selected=pathToName(path);
  const currentObject=objectMetadata.find(o=>o.apiName===selected);
  const filtered=useMemo(()=>sections.map(section=>({...section,items:section.items.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()))})).filter(section=>section.items.length),[query]);
  const navigate=(name:string)=>{const url=slugFor(name);window.history.pushState({},'',url);setPath(url);setMenu(false)};
  useMemo(()=>{},[]);
  if(typeof window!=='undefined') window.onpopstate=()=>setPath(window.location.pathname);
  return <div className="mdr">
    <aside className={'mdr-sidebar '+(menu?'mdr-open':'')}>
      <div className="mdr-mark"><span className="mdr-logo"><Command size={20}/></span><div><strong>MetaDrive</strong><small>Workspace</small></div><button className="mdr-close" onClick={()=>setMenu(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="mdr-search"><Search size={16}/><input aria-label="Find modules" placeholder="Find anything..." value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div>
      <div className="mdr-navscroll"><button className={'mdr-link '+(selected==='Overview'?'is-active':'')} onClick={()=>navigate('Overview')}><LayoutGrid size={17}/> Overview <ChevronRight size={15}/></button>
        {filtered.map(group=><div className="mdr-group" key={group.group}><button className="mdr-grouphead" onClick={()=>setGroups(v=>v.includes(group.group)?v.filter(x=>x!==group.group):[...v,group.group])}>{group.group}<span>{groups.includes(group.group)?'−':'+'}</span></button>{groups.includes(group.group)&&group.items.map(item=><button key={item.name} className={'mdr-link '+(selected===item.name?'is-active':'')} onClick={()=>navigate(item.name)}><span className="mdr-dot"/><span>{item.name}</span></button>)}</div>)}
        <div className="mdr-group"><div className="mdr-grouphead">Data objects</div>{objectMetadata.filter(o=>o.label.toLowerCase().includes(query.toLowerCase())).map(o=><button key={o.apiName} className={'mdr-link '+(selected===o.apiName?'is-active':'')} onClick={()=>navigate(o.apiName)}><Database size={15}/><span>{o.pluralLabel||o.label}</span></button>)}</div>
      </div><div className="mdr-sidefoot"><Activity size={15}/> Experimental interface <span>v1</span></div>
    </aside>
    {menu&&<button aria-label="Close navigation" className="mdr-scrim" onClick={()=>setMenu(false)}/>}
    <div className="mdr-main">
      <header className="mdr-top"><div className="mdr-crumb"><button className="mdr-mobile-menu" onClick={()=>setMenu(true)} aria-label="Open menu"><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{selected}</strong></div><div className="mdr-topright"><span className="mdr-live"><span/> Theme preview</span><Bell size={18}/><span className="mdr-avatar">M</span></div></header>
      <main className="mdr-content">
        <div className="mdr-heading"><div><div className="mdr-overline"><Sparkles size={15}/> NEW WORKSPACE EXPERIENCE</div><h1>{selected==='Overview'?'A clearer way to work.':selected}</h1><p>{currentObject?.description|| (selected==='Overview'?'Everything you need, arranged around the work you do.':'Explore this area in the new layout without changing your existing application.')}</p></div><a className="mdr-original" href={selected==='Overview'?'/une/setup/home':currentObject?'/une/o/'+encodeURIComponent(currentObject.apiName)+'/list':destination(selected)}>Open working module <ArrowRight size={15}/></a></div>
        {selected==='Overview'?<>
          <section className="mdr-hero"><div><span className="mdr-hero-kicker">YOUR DIGITAL WORKSPACE</span><h2>Make space for<br/><em>better work.</em></h2><p>A calmer layout with consistent typography, balanced spacing, and direct access to your modules.</p><button onClick={()=>navigate('Object Manager')}>Explore workspace <ArrowRight size={16}/></button></div><div className="mdr-art"><div className="mdr-art-panel"><span className="mdr-art-top"><span/><span/><span/></span><div className="mdr-art-bars"><i/><i/><i/><i/></div><div className="mdr-art-chart"><b/><b/><b/><b/><b/><b/></div></div></div></section>
          <div className="mdr-sectiontitle"><h2>Quick access</h2><span>Choose an area to explore</span></div>
          <div className="mdr-grid">{workspaces.map((w,i)=><button className="mdr-card" key={w.id} onClick={()=>navigate(w.label)}><span className={'mdr-tile mdr-tile-'+(i%4)}><w.icon size={22}/></span><strong>{w.label}</strong><small>Open workspace <ArrowRight size={13}/></small></button>)}</div>
        </>:currentObject?<><div className="mdr-stats"><div><span>Object</span><strong>{currentObject.label}</strong></div><div><span>Fields</span><strong>{currentObject.fields.length}</strong></div><div><span>API name</span><strong>{currentObject.apiName}</strong></div></div><section className="mdr-panel"><div className="mdr-panelhead"><h2>Fields & structure</h2><span>Metadata preview</span></div><div className="mdr-tablewrap"><table><thead><tr><th>Field label</th><th>API name</th><th>Data type</th><th>Required</th></tr></thead><tbody>{currentObject.fields.map(field=><tr key={field.apiName}><td>{field.label}</td><td>{field.apiName}</td><td>{field.dataType}</td><td>{field.required?'Yes':'No'}</td></tr>)}</tbody></table></div></section></>:<>
          <div className="mdr-sectiontitle"><h2>{selected} workspace</h2><span>Route mapping preview</span></div>
          <section className="mdr-panel mdr-module"><span className="mdr-module-icon"><Settings2 size={27}/></span><h2>Module route is mapped</h2><p>The new gateway navigation is available here. The existing working module is unchanged; use the link below to open its functionality.</p><a href={destination(selected)}>Continue to {selected} <ArrowRight size={16}/></a></section>
        </>}
      </main>
    </div>
  </div>;
}
