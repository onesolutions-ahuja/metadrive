import { useState, type ReactNode } from 'react';
import './CompanySettingsWorkspace.css';
type Section = 'general'|'currency'|'branding'|'business'|'contacts'|'integrations'|'security';
const sections:ReadonlyArray<{id:Section;label:string}>=[
{id:'general',label:'General'},{id:'currency',label:'Currency & Locale'},
{id:'branding',label:'Branding'},{id:'business',label:'Business Settings'},
{id:'contacts',label:'Contacts'},{id:'integrations',label:'Integrations'},
{id:'security',label:'Security & Recovery'}];
/** Presentation only: retains existing OneEngine-protected runtime controls and slots. */
export default function CompanySettingsWorkspace({company,currency,domains,developer,usage,recovery,mfa,emailRecovery,locks,sessions,audit}:{
company:ReactNode;currency:ReactNode;domains:ReactNode;developer:ReactNode;usage:ReactNode;
recovery:ReactNode;mfa:ReactNode;emailRecovery:ReactNode;locks:ReactNode;sessions:ReactNode;audit:ReactNode;
}){
 const [active,setActive]=useState<Section>('general');
 return <div className="company-workspace">
   <header className="company-workspace-heading"><div><p className="company-workspace-eyebrow">Setup / Organisation</p>
     <h1>Company Settings</h1><p>Manage your organisation, currency, branding and security settings.</p></div></header>
   <nav className="company-workspace-tabs" aria-label="Company settings sections">
     {sections.map(section=><button key={section.id} type="button" className={active===section.id?'active':''}
       aria-current={active===section.id?'page':undefined} onClick={()=>setActive(section.id)}>{section.label}</button>)}
   </nav>
   <div className="company-workspace-body">
     {/* CompanySettings currently contains both company details and currency sections.
         Render it once, avoiding duplicate state and network requests. */}
     {(active==='general'||active==='currency'||active==='business'||active==='contacts')&&company}
     {active==='branding'&&<section className="company-workspace-card"><h2>Branding</h2>
       <p>Brand appearance is configured through the existing Page Builder and registered components.</p></section>}
     {active==='integrations'&&<section className="company-workspace-stack">{domains}{developer}</section>}
     {active==='security'&&<section className="company-workspace-stack">{mfa}{emailRecovery}{locks}{sessions}{recovery}{audit}</section>}
     {active==='business'&&<div className="company-workspace-secondary">{usage}</div>}
   </div>
 </div>;
}
