import React,{useCallback,useEffect,useState} from 'react';
import {apiRequest} from '../authentication/Client/authClient';

type Domain={id:string;name:string;isEnabled:boolean};
type Mailbox={id:string;emailAddress:string;name:string;domainId:string;description:string;usedDiskQuota:number;quotas?:Record<string,number>;createdAt:string|null};
type Props={onLogout:()=>void};
const panel:React.CSSProperties={background:'#fff',border:'1px solid #d9e0e7',borderRadius:12,padding:20};
const field:React.CSSProperties={display:'grid',gap:6,marginBottom:14};
const input:React.CSSProperties={width:'100%',boxSizing:'border-box',padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:8,font:'inherit'};
const button:React.CSSProperties={padding:'9px 13px',border:'1px solid #cbd5e1',borderRadius:8,background:'#fff',cursor:'pointer',font:'inherit'};
const primary:React.CSSProperties={...button,background:'#163a5f',borderColor:'#163a5f',color:'#fff'};
const fmtBytes=(raw:number)=>{const n=Number(raw)||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB';};

export default function MailboxAdmin({onLogout}:Props){
 const [domains,setDomains]=useState<Domain[]>([]);
 const [mailboxes,setMailboxes]=useState<Mailbox[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [showCreate,setShowCreate]=useState(false);
 const [name,setName]=useState('');
 const [domainId,setDomainId]=useState('');
 const [password,setPassword]=useState('');
 const [description,setDescription]=useState('');
 const [resetId,setResetId]=useState('');
 const [resetPassword,setResetPassword]=useState('');
 const [editId,setEditId]=useState('');
 const [editDescription,setEditDescription]=useState('');
 const [editMaxDiskQuota,setEditMaxDiskQuota]=useState('');
 const [editMaxEmails,setEditMaxEmails]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const [d,m]=await Promise.all([
    apiRequest<{domains:Domain[]}>('/mail/domains'),
    apiRequest<{mailboxes:Mailbox[]}>('/mail/mailboxes')
   ]);
   setDomains(d.domains);setMailboxes(m.mailboxes);
   setDomainId(current=>current||d.domains.find(x=>x.isEnabled)?.id||'');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load mailboxes');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const create=async(event:React.FormEvent)=>{
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   await apiRequest('/mail/mailboxes',{method:'POST',body:JSON.stringify({name,domainId,password,description})});
   setName('');setPassword('');setDescription('');setShowCreate(false);setNotice('Mailbox created.');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Mailbox creation failed');}
  finally{setBusy(false);}
 };
 const saveDescription=async(event:React.FormEvent)=>{
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   const current=mailboxes.find(m=>m.id===editId);const quotas={...(current?.quotas??{})};
   if(editMaxDiskQuota.trim()==='')delete quotas.maxDiskQuota;else quotas.maxDiskQuota=Number(editMaxDiskQuota);
   if(editMaxEmails.trim()==='')delete quotas.maxEmails;else quotas.maxEmails=Number(editMaxEmails);
   await apiRequest('/mail/mailboxes/'+encodeURIComponent(editId),{method:'PATCH',body:JSON.stringify({description:editDescription,quotas})});
   setEditId('');setNotice('Mailbox updated.');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Mailbox update failed');}
  finally{setBusy(false);}
 };
 const reset=async(event:React.FormEvent)=>{
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   await apiRequest('/mail/mailboxes/'+encodeURIComponent(resetId)+'/reset-password',{method:'POST',body:JSON.stringify({password:resetPassword})});
   setResetId('');setResetPassword('');setNotice('Password reset completed.');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Password reset failed');}
  finally{setBusy(false);}
 };
 const remove=async(mailbox:Mailbox)=>{
  if(!window.confirm('Permanently delete '+mailbox.emailAddress+' and its mailbox data from Stalwart? This cannot be undone.'))return;
  setBusy(true);setError('');setNotice('');
  try{
   await apiRequest('/mail/mailboxes/'+encodeURIComponent(mailbox.id),{method:'DELETE'});
   setNotice('Mailbox deleted.');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Mailbox deletion failed');}
  finally{setBusy(false);}
 };
 return <main style={{minHeight:'100vh',background:'#f4f7fb',color:'#172b3f',fontFamily:'Inter,system-ui,sans-serif',padding:'28px clamp(16px,4vw,56px)',boxSizing:'border-box'}}>
  <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap',marginBottom:24}}>
   <div><p style={{margin:'0 0 5px',color:'#52677b',fontSize:12,fontWeight:700,letterSpacing:1.2}}>METADRIVE · ADMINISTRATION</p>
    <h1 style={{margin:0,fontSize:30}}>Mailboxes</h1><p style={{margin:'8px 0 0',color:'#52677b'}}>Manage tenant mail accounts on Stalwart Mail.</p></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={button} onClick={()=>window.location.assign('/')}>Back to workspace</button><button style={button} onClick={onLogout}>Sign out</button></div>
  </header>
  {error&&<div role="alert" style={{...panel,borderColor:'#d97777',color:'#9b1c1c',marginBottom:16}}>{error}</div>}
  {notice&&<div role="status" style={{...panel,borderColor:'#7cb99a',marginBottom:16}}>{notice}</div>}
  <section style={{...panel,marginBottom:18}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
    <div><h2 style={{margin:'0 0 4px',fontSize:18}}>Mailbox accounts</h2><p style={{margin:0,color:'#52677b',fontSize:14}}>Only mailboxes assigned to your signed-in MetaDrive tenant are listed.</p></div>
    <div style={{display:'flex',gap:8}}><button style={button} onClick={()=>void refresh()} disabled={loading||busy}>Refresh</button><button style={primary} onClick={()=>setShowCreate(v=>!v)} disabled={busy||!domains.some(d=>d.isEnabled)}>＋ Create mailbox</button></div>
   </div>
   {showCreate&&<form onSubmit={create} style={{marginTop:20,paddingTop:18,borderTop:'1px solid #e2e8f0',maxWidth:650}}>
    <div style={field}><label htmlFor="mail-name">Mailbox name</label><input id="mail-name" autoComplete="off" required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. accounts" style={input} pattern="[A-Za-z0-9][A-Za-z0-9._+-]{0,62}[A-Za-z0-9]|[A-Za-z0-9]" /></div>
    <div style={field}><label htmlFor="mail-domain">Domain</label><select id="mail-domain" required value={domainId} onChange={e=>setDomainId(e.target.value)} style={input}>{domains.filter(d=>d.isEnabled).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
    <div style={field}><label htmlFor="mail-password">Initial password (minimum 12 characters)</label><input id="mail-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} style={input}/></div>
    <div style={field}><label htmlFor="mail-description">Description (optional)</label><input id="mail-description" value={description} maxLength={500} onChange={e=>setDescription(e.target.value)} style={input}/></div>
    <div style={{display:'flex',gap:8}}><button style={primary} disabled={busy}>{busy?'Creating…':'Create mailbox'}</button><button type="button" style={button} onClick={()=>setShowCreate(false)}>Cancel</button></div>
   </form>}
  </section>
  {resetId&&<form onSubmit={reset} style={{...panel,marginBottom:18,maxWidth:650}}>
   <h2 style={{marginTop:0,fontSize:18}}>Reset mailbox password</h2><p style={{color:'#52677b'}}>Use a new password of at least 12 characters. Stalwart may reject this operation if the account has additional credentials that cannot safely be preserved.</p>
   <div style={field}><label htmlFor="reset-password">New password</label><input id="reset-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={resetPassword} onChange={e=>setResetPassword(e.target.value)} style={input}/></div>
   <div style={{display:'flex',gap:8}}><button style={primary} disabled={busy}>{busy?'Saving…':'Reset password'}</button><button type="button" style={button} onClick={()=>{setResetId('');setResetPassword('');}}>Cancel</button></div>
  </form>}
  {editId&&<form onSubmit={saveDescription} style={{...panel,marginBottom:18,maxWidth:650}}>
   <h2 style={{marginTop:0,fontSize:18}}>Edit mailbox description</h2>
   <div style={field}><label htmlFor="edit-description">Description</label><input id="edit-description" value={editDescription} maxLength={500} onChange={e=>setEditDescription(e.target.value)} style={input}/></div>
   <div style={field}><label htmlFor="edit-disk-quota">Maximum storage (bytes; leave blank for server default)</label><input id="edit-disk-quota" type="number" min="0" step="1" value={editMaxDiskQuota} onChange={e=>setEditMaxDiskQuota(e.target.value)} style={input}/></div>
   <div style={field}><label htmlFor="edit-email-quota">Maximum email count (leave blank for server default)</label><input id="edit-email-quota" type="number" min="0" step="1" value={editMaxEmails} onChange={e=>setEditMaxEmails(e.target.value)} style={input}/></div>
   <p style={{fontSize:12,color:'#617589'}}>Leave a quota blank to remove that explicit limit. Storage usage is shown separately.</p>
   <div style={{display:'flex',gap:8}}><button style={primary} disabled={busy}>{busy?'Saving…':'Save changes'}</button><button type="button" style={button} onClick={()=>setEditId('')}>Cancel</button></div>
  </form>}
  <section style={panel}>
   {loading?<p role="status">Loading mailboxes…</p>:mailboxes.length===0?<div style={{padding:'24px 8px',textAlign:'center'}}><h3 style={{margin:'0 0 8px'}}>No mailboxes yet</h3><p style={{margin:0,color:'#52677b'}}>Create a mailbox to get started, once a domain is configured for this integration.</p></div>:
   <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left',minWidth:720}}>
    <thead><tr>{['Email address','Description','Storage used','Created','Actions'].map(x=><th key={x} style={{padding:'12px 10px',borderBottom:'1px solid #dce3ea',color:'#52677b',fontSize:12,textTransform:'uppercase',letterSpacing:.5}}>{x}</th>)}</tr></thead>
    <tbody>{mailboxes.map(m=><tr key={m.id}>
     <td style={{padding:'14px 10px',borderBottom:'1px solid #edf1f5',fontWeight:650}}>{m.emailAddress||m.name}</td>
     <td style={{padding:'14px 10px',borderBottom:'1px solid #edf1f5',color:'#52677b'}}>{m.description||'—'}</td>
     <td style={{padding:'14px 10px',borderBottom:'1px solid #edf1f5'}}>{fmtBytes(m.usedDiskQuota)}</td>
     <td style={{padding:'14px 10px',borderBottom:'1px solid #edf1f5',color:'#52677b'}}>{m.createdAt?new Date(m.createdAt).toLocaleDateString():'—'}</td>
     <td style={{padding:'14px 10px',borderBottom:'1px solid #edf1f5'}}><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      <button style={button} disabled={busy} onClick={()=>{setEditId(m.id);setEditDescription(m.description);setEditMaxDiskQuota(m.quotas?.maxDiskQuota===undefined?'':String(m.quotas.maxDiskQuota));setEditMaxEmails(m.quotas?.maxEmails===undefined?'':String(m.quotas.maxEmails));setResetId('');}}>Edit</button>
      <button style={button} disabled={busy} onClick={()=>{setResetId(m.id);setResetPassword('');setEditId('');}}>Reset password</button>
      <button style={{...button,color:'#a32222',borderColor:'#e4b5b5'}} disabled={busy} onClick={()=>void remove(m)}>Delete</button>
     </div></td>
    </tr>)}</tbody>
   </table></div>}
  </section>
  <p style={{fontSize:12,color:'#617589',marginTop:16}}>Mail server credentials are kept server-side. This screen never receives the Stalwart management API key.</p>
 </main>;
}
