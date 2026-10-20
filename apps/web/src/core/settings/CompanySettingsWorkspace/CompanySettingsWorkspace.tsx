import { useState, type ReactNode } from 'react';
import BusinessCalendarSettings from '../../platform/BusinessCalendarSettings/BusinessCalendarSettings';
import OfflineBriefcaseSettings from '../../platform/OfflineBriefcaseSettings/OfflineBriefcaseSettings';
import MetadataPackageManager from '../../applications/MetadataPackages/MetadataPackageManager';
import { apiRequest } from '../../authentication/Client/authClient';
import './CompanySettingsWorkspace.css';
type Section = 'general'|'currency'|'branding'|'business'|'contacts'|'mobile'|'integrations'|'security'|'developer';
type DeveloperDestination = {label:string;workspace:string;description:string;allowed:boolean};
const sections:ReadonlyArray<{id:Section;label:string}>=[
{id:'general',label:'General'},{id:'currency',label:'Currency & Locale'},
{id:'branding',label:'Branding'},{id:'business',label:'Business Settings'},
{id:'contacts',label:'Contacts'},{id:'mobile',label:'Mobile & Offline'},{id:'integrations',label:'Integrations'},
{id:'security',label:'Security & Recovery'},{id:'developer',label:'Developer'}];
/** Presentation only: retains existing OneEngine-protected runtime controls and slots. */
export default function CompanySettingsWorkspace({company,domains,developer,usage,calendar,recovery,mfa,emailRecovery,locks,sessions,audit,onNavigateDeveloper,developerAccess}:{
company:ReactNode;domains:ReactNode;developer:ReactNode;usage:ReactNode;calendar?:ReactNode;
recovery:ReactNode;mfa:ReactNode;emailRecovery:ReactNode;locks:ReactNode;sessions:ReactNode;audit:ReactNode;
 onNavigateDeveloper?:(workspace:string)=>void;
 developerAccess?:{metadata:boolean;apps:boolean;packages?:boolean;flows:boolean;dashboards:boolean;reports:boolean;approvals:boolean;security:boolean};
}){
 const [active,setActive]=useState<Section>('general');
 const rights=developerAccess;
 const destinations:DeveloperDestination[]=[
  {label:'Object Manager',workspace:'object-manager',description:'Objects, fields and relationships',allowed:!!rights?.metadata},
  {label:'App Builder',workspace:'app-manager',description:'Apps, menus and navigation',allowed:!!rights?.apps},
  {label:'Page Editor',workspace:'page-builder',description:'Page layouts and publishing',allowed:!!rights?.metadata},
  {label:'Flow Builder',workspace:'flow-builder',description:'Flows and Screen Flows',allowed:!!rights?.flows},
  {label:'Scheduled Flows',workspace:'scheduled-flows',description:'Automation schedules',allowed:!!rights?.flows},
  {label:'Flow Interviews',workspace:'flow-interviews',description:'In-progress Screen Flow interviews',allowed:!!rights?.flows},
  {label:'Flow Logs',workspace:'flow-logs',description:'Automation executions and errors',allowed:!!rights?.flows},
  {label:'Automation Settings',workspace:'automation-settings',description:'Automation configuration',allowed:!!rights?.flows},
  {label:'Dashboard Builder',workspace:'dashboard-builder',description:'Dashboards and visualisations',allowed:!!rights?.dashboards},
  {label:'Report Builder',workspace:'report-builder',description:'Reports and data analysis',allowed:!!rights?.reports},
  {label:'OneEngine Permissions',workspace:'rbac',description:'Developer and builder access policies',allowed:!!rights?.security}
 ];
 const available=destinations.filter(item=>item.allowed);
 return <div className="company-workspace">
   <header className="company-workspace-heading"><div><p className="company-workspace-eyebrow">Setup / Organisation</p>
     <h1>Company Settings</h1><p>Manage your organisation, currency, branding and security settings.</p></div></header>
   <nav className="company-workspace-tabs" aria-label="Company settings sections">
     {sections.filter(section=>section.id!=='developer'||available.length>0).map(section=><button key={section.id} type="button" className={active===section.id?'active':''}
       aria-current={active===section.id?'page':undefined} onClick={()=>setActive(section.id)}>{section.label}</button>)}
   </nav>
   <div className={"company-workspace-body company-workspace-section-"+active}>
     {/* CompanySettings currently contains both company details and currency sections.
         Render it once, avoiding duplicate state and network requests. */}
     {(active==='general'||active==='currency'||active==='business'||active==='contacts'||active==='branding')&&company}
     {active==='integrations'&&<section className="company-workspace-stack">{domains}{developer}</section>}
     {active==='security'&&<section className="company-workspace-stack">{mfa}{emailRecovery}{locks}{sessions}{recovery}{audit}</section>}
     {active==='business'&&<div className="company-workspace-secondary">
       {calendar??<BusinessCalendarSettings request={apiRequest} permitted />}
       {usage}
     </div>}
     {active==='mobile'&&<OfflineBriefcaseSettings request={apiRequest} permitted />}
     {active==='developer'&&<><section className="company-workspace-card" aria-label="Developer tools"><h2>Developer tools</h2><p>Build and manage your apps with OneEngine-controlled access.</p><div className="company-developer-links">{available.map(item=><button type="button" key={item.workspace} onClick={()=>onNavigateDeveloper?.(item.workspace)} disabled={!onNavigateDeveloper}><strong>{item.label}</strong><span>{item.description}</span><span aria-hidden="true">›</span></button>)}</div></section>
       <MetadataPackageManager request={apiRequest} permitted={!!rights?.metadata} canManage={!!(rights?.packages??rights?.apps)} /></>}
   </div>
 </div>;
}
