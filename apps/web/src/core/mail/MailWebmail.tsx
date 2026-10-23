import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {apiBase} from '../authentication/Client/authClient';

type JmapSession={apiUrl:string;uploadUrl:string;downloadUrl:string;primaryAccounts?:Record<string,string>;accounts?:Record<string,{name?:string}>;capabilities?:Record<string,unknown>};
type JmapResponse={methodResponses?:Array<[string,Record<string,unknown>,string]>};
type Mailbox={id:string;name:string;role?:string;totalEmails?:number;unreadEmails?:number};
type Address={name?:string;email?:string};
type BodyPart={partId?:string;blobId?:string;name?:string;type?:string;size?:number;disposition?:string;subParts?:BodyPart[]};
type Email={id:string;subject?:string;from?:Address[];to?:Address[];cc?:Address[];receivedAt?:string;preview?:string;textBody?:Array<{partId?:string}>;bodyValues?:Record<string,{value?:string}>;bodyStructure?:BodyPart;keywords?:Record<string,boolean>;mailboxIds?:Record<string,boolean>};
type Identity={id:string;email:string;name?:string};
const core='urn:ietf:params:jmap:core',mail='urn:ietf:params:jmap:mail',submission='urn:ietf:params:jmap:submission';
const button:React.CSSProperties={border:'1px solid #d5dee8',background:'#fff',borderRadius:8,padding:'9px 12px',font:'inherit',cursor:'pointer'};
const input:React.CSSProperties={width:'100%',boxSizing:'border-box',border:'1px solid #cbd5e1',borderRadius:8,padding:'10px 12px',font:'inherit'};
function b64(value:string){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
function responseFor(result:JmapResponse,name:string):Record<string,unknown>{
 const found=result.methodResponses?.find(x=>x[0]===name);
 if(!found)throw new Error('Mail server returned an incomplete response.');
 if(found[0]==='error')throw new Error('Mail server rejected the request.');
 return found[1];
}
function listOf<T>(result:Record<string,unknown>,key='list'):T[]{return Array.isArray(result[key])?result[key] as T[]:[];}
function safeHeader(value:string){return value.replace(/[\r\n]+/g,' ').trim();}
function plainTextToHtml(value:string){return value.replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]??ch)).replace(/\n/g,'<br>');}

function bytesToB64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
function collectAttachments(part?:BodyPart):BodyPart[]{if(!part)return [];const current=part.blobId&&(part.disposition==='attachment'||Boolean(part.name))?[part]:[];return [...current,...(part.subParts??[]).flatMap(collectAttachments)];}
function safeFilename(value:string){return value.replace(/[\\\"\r\n]/g,'_').replace(/[^\x20-\x7E]/g,'_').slice(0,180)||'attachment';}
async function buildRawMessage(sender:Identity,recipient:string,subject:string,body:string,files:File[]){
 const headers='From: '+safeHeader(sender.name?sender.name+' <'+sender.email+'>':sender.email)+'\r\n'+(recipient.trim()?'To: '+safeHeader(recipient)+'\r\n':'')+'Subject: =?UTF-8?B?'+b64(safeHeader(subject))+'?=\r\nMIME-Version: 1.0\r\n';
 if(!files.length)return headers+'Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'+plainTextToHtml(body);
 const boundary='----MetaDrive-'+Date.now().toString(16);
 let raw=headers+'Content-Type: multipart/mixed; boundary="'+boundary+'"\r\n\r\n--'+boundary+'\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'+body+'\r\n';
 for(const file of files){
  const encoded=bytesToB64(new Uint8Array(await file.arrayBuffer())).replace(/.{1,76}/g,'$&\r\n');
  const filename=safeFilename(file.name);const type=/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(file.type)?file.type:'application/octet-stream';
  raw+='--'+boundary+'\r\nContent-Type: '+type+'; name="'+filename+'"\r\nContent-Disposition: attachment; filename="'+filename+'"\r\nContent-Transfer-Encoding: base64\r\n\r\n'+encoded+'\r\n';
 }
 return raw+'--'+boundary+'--\r\n';
}

export default function MailWebmail(){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [session,setSession]=useState<JmapSession|null>(null);const [accountId,setAccountId]=useState('');
 const [mailboxes,setMailboxes]=useState<Mailbox[]>([]);const [selectedMailbox,setSelectedMailbox]=useState('');
 const [messages,setMessages]=useState<Email[]>([]);const [selected,setSelected]=useState<Email|null>(null);
 const [identities,setIdentities]=useState<Identity[]>([]);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [compose,setCompose]=useState(false);const [to,setTo]=useState('');const [subject,setSubject]=useState('');const [body,setBody]=useState('');const [files,setFiles]=useState<File[]>([]);
 const [search,setSearch]=useState('');
 const apiRoot=useMemo(()=>new URL(`${apiBase.replace(/\/$/,'')}/`,window.location.origin),[]);
 const base=useMemo(()=>new URL('mail-jmap/',apiRoot),[apiRoot]);
 const auth=useMemo(()=>email&&password?'Basic '+b64(email.trim()+':'+password):'', [email,password]);
 const apiUrl=useMemo(()=>new URL('jmap',base).href,[base]);
 const api=useCallback(async(methodCalls:Array<[string,Record<string,unknown>,string]>)=>{
  if(!auth||!session)throw new Error('Please sign in to your mailbox.');
  const response=await fetch(apiUrl,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({using:[core,mail,submission],methodCalls}),redirect:'error'});
  if(!response.ok)throw new Error(response.status===401?'Mailbox sign-in failed. Check your email address and password.':`Mail server request failed (${response.status}).`);
  const payload=await response.json() as JmapResponse;
  const failure=payload.methodResponses?.find(x=>x[0]==='error');
  if(failure)throw new Error(typeof failure[1]?.description==='string'?failure[1].description:'Mail server rejected the request.');
  return payload;
 },[auth,session,apiUrl]);
 const loadMessages=useCallback(async(mailboxId:string,term=search)=>{
  if(!accountId||!mailboxId)return;
  const queryFilter:Record<string,unknown>=term.trim()?{inMailbox:mailboxId,text:term.trim()}:{inMailbox:mailboxId};
  const queried=responseFor(await api([['Email/query',{accountId,filter:queryFilter,sort:[{property:'receivedAt',isAscending:false}],limit:50},'query']]),'Email/query');
  const ids=Array.isArray(queried.ids)?queried.ids.filter((x):x is string=>typeof x==='string'):[];
  if(!ids.length){setMessages([]);setSelected(null);return;}
  const got=responseFor(await api([['Email/get',{accountId,ids,properties:['id','subject','from','to','cc','receivedAt','preview','textBody','bodyValues','keywords','mailboxIds','bodyStructure'],fetchTextBodyValues:true},'get']]),'Email/get');
  const rows=listOf<Email>(got).filter(x=>typeof x.id==='string');
  setMessages(rows);setSelected(current=>current&&rows.some(x=>x.id===current.id)?rows.find(x=>x.id===current.id)??null:null);
 },[accountId,api,search]);
 const loadSetup=useCallback(async()=>{
  if(!auth)return;
  setBusy(true);setError('');setNotice('');
  try{
   const discovery=new URL('.well-known/jmap',base);
   const response=await fetch(discovery,{headers:{Authorization:auth,Accept:'application/json'},redirect:'error'});
   if(!response.ok)throw new Error(response.status===401?'Mailbox sign-in failed. Check your email address and password.':`Unable to connect to the mail server (${response.status}).`);
   const discovered=await response.json() as JmapSession;
   if(!discovered||typeof discovered.apiUrl!=='string'||typeof discovered.uploadUrl!=='string'||typeof discovered.downloadUrl!=='string')throw new Error('Mail server session is incomplete.');
   const id=discovered.primaryAccounts?.[mail]??Object.keys(discovered.accounts??{})[0];
   if(!id)throw new Error('This mailbox has no mail account access.');
   const advertisedUpload=new URL(discovered.uploadUrl.replace('{accountId}',encodeURIComponent(id)),discovery);
   const advertisedDownload=new URL(discovered.downloadUrl.replace('{accountId}',encodeURIComponent(id)).replace('{blobId}','MD_BLOB_PLACEHOLDER').replace('{name}','MD_NAME_PLACEHOLDER').replace('{type}','MD_TYPE_PLACEHOLDER'),discovery);
   const preparedSession={...discovered,apiUrl,uploadUrl:new URL('mail-jmap'+advertisedUpload.pathname,apiRoot).href,
    downloadUrl:(new URL('mail-jmap'+advertisedDownload.pathname,apiRoot).href+advertisedDownload.search).replace('MD_BLOB_PLACEHOLDER','{blobId}').replace('MD_NAME_PLACEHOLDER','{name}').replace('MD_TYPE_PLACEHOLDER','{type}')};
   const response2=await fetch(apiUrl,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({using:[core,mail,submission],methodCalls:[
     ['Mailbox/get',{accountId:id,ids:null,properties:['id','name','role','totalEmails','unreadEmails']},'mb'],
     ['Identity/get',{accountId:id,ids:null,properties:['id','email','name']},'ident']
    ]}),redirect:'error'});
   if(!response2.ok)throw new Error(`Unable to load mailbox data (${response2.status}).`);
   const payload=await response2.json() as JmapResponse;
   const mailboxResult=responseFor(payload,'Mailbox/get'),identityResult=responseFor(payload,'Identity/get');
   const folders=listOf<Mailbox>(mailboxResult).filter(x=>typeof x.id==='string'&&typeof x.name==='string');
   const ids=listOf<Identity>(identityResult).filter(x=>typeof x.id==='string'&&typeof x.email==='string');
   const inbox=folders.find(x=>x.role==='inbox')??folders[0];
   if(!inbox)throw new Error('No mail folders are available for this account.');
   setSession(preparedSession);setAccountId(id);setMailboxes(folders);setIdentities(ids);
   setSelectedMailbox(inbox.id);setNotice('Signed in successfully.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to connect to mailbox');}
  finally{setBusy(false);}
 },[auth,apiUrl,base,apiRoot]);
 useEffect(()=>{if(session&&selectedMailbox)void loadMessages(selectedMailbox,'').catch(e=>setError(e instanceof Error?e.message:'Unable to load messages'));},[session,selectedMailbox,loadMessages]);
 const signOut=()=>{setSession(null);setAccountId('');setMailboxes([]);setMessages([]);setSelected(null);setIdentities([]);setPassword('');setError('');setNotice('');};
 const openMessage=async(message:Email)=>{
  setSelected(message);setCompose(false);setError('');
  if(!message.keywords?.$seen){
   try{
    await api([['Email/set',{accountId,update:{[message.id]:{keywords:{...(message.keywords??{}),'$seen':true}}}},'seen']]);
    setMessages(rows=>rows.map(row=>row.id===message.id?{...row,keywords:{...(row.keywords??{}),'$seen':true}}:row));
    setMailboxes(rows=>rows.map(row=>row.id===selectedMailbox?{...row,unreadEmails:Math.max(0,(row.unreadEmails??1)-1)}:row));
   }catch(e){setError(e instanceof Error?e.message:'Unable to mark message read');}
  }
 };
 const downloadAttachment=async(part:BodyPart)=>{
  if(!session||!auth||!part.blobId)return;
  try{
   const name=part.name||'attachment';
   const url=session.downloadUrl.replace('{blobId}',encodeURIComponent(part.blobId)).replace('{name}',encodeURIComponent(name)).replace('{type}',encodeURIComponent(part.type??'application/octet-stream'));
   const response=await fetch(url,{headers:{Authorization:auth},redirect:'error'});
   if(!response.ok)throw new Error('Unable to download attachment ('+response.status+').');
   const blob=await response.blob();const objectUrl=URL.createObjectURL(blob);const link=document.createElement('a');
   link.href=objectUrl;link.download=safeFilename(name);document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(objectUrl);
  }catch(e){setError(e instanceof Error?e.message:'Attachment download failed');}
 };
 const reply=(message:Email)=>{
  const sender=message.from?.[0]?.email??'';setTo(sender);setSubject((message.subject??'').startsWith('Re:')?message.subject??'':'Re: '+(message.subject??''));
  const text=message.textBody?.map(part=>part.partId?message.bodyValues?.[part.partId]?.value??'':'').filter(Boolean).join('\n')??'';
  setBody('\n\n--- Original message ---\n'+text);setFiles([]);setCompose(true);setSelected(null);
 };
 const forward=(message:Email)=>{
  const text=message.textBody?.map(part=>part.partId?message.bodyValues?.[part.partId]?.value??'':'').filter(Boolean).join('\n')??message.preview??'';
  const sender=message.from?.map(x=>x.name?x.name+' <'+x.email+'>':x.email).join(', ')??'';
  setTo('');setSubject((message.subject??'').startsWith('Fwd:')?message.subject??'':'Fwd: '+(message.subject??''));
  setBody('\n\n---------- Forwarded message ----------\nFrom: '+sender+'\nDate: '+(message.receivedAt??'')+'\nSubject: '+(message.subject??'')+'\nTo: '+(message.to?.map(x=>x.email).join(', ')??'')+'\n\n'+text);
  setFiles([]);setCompose(true);setSelected(null);
 };
 const send=async(event:React.FormEvent)=>{
  event.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   if(!session||!auth)throw new Error('Please sign in to your mailbox.');
   const recipient=to.trim();const sender=identities[0];
   if(!sender)throw new Error('No sending identity is configured for this mailbox.');
   if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))throw new Error('Enter a valid recipient email address.');
   const sent=mailboxes.find(x=>x.role==='sent');
   if(!sent)throw new Error('A Sent folder is required before sending mail.');
   if(files.reduce((sum,file)=>sum+file.size,0)>20*1024*1024)throw new Error('Attachments must total 20 MB or less.');
   const raw=await buildRawMessage(sender,recipient,subject,body,files);
   const upload=await fetch(session.uploadUrl,{method:'POST',headers:{Authorization:auth,'Content-Type':'message/rfc822'},body:raw,redirect:'error'});
   if(!upload.ok)throw new Error(`Unable to prepare message (${upload.status}).`);
   const uploaded=await upload.json() as {blobId?:string};
   if(!uploaded.blobId)throw new Error('Mail server did not accept the message upload.');
   const imported=responseFor(await api([['Email/import',{accountId,emails:{draft:{blobId:uploaded.blobId,mailboxIds:{[sent.id]:true},keywords:{'$seen':true}}}},'import']]),'Email/import');
   const created=imported.created&&typeof imported.created==='object'?imported.created as Record<string,{id?:string}>:{};
   const messageId=created.draft?.id;
   if(!messageId)throw new Error('Mail server could not create the outgoing message.');
   const identity=sender.id;
   const submissionResult=responseFor(await api([['EmailSubmission/set',{accountId,create:{send:{emailId:messageId,identityId:identity,envelope:{mailFrom:{email:sender.email},rcptTo:[{email:recipient}]}}}},'send']]),'EmailSubmission/set');
   const submissionCreated=submissionResult.created&&typeof submissionResult.created==='object'?submissionResult.created as Record<string,unknown>:{};
   if(!submissionCreated.send)throw new Error('Mail server rejected message submission.');
   setCompose(false);setTo('');setSubject('');setBody('');setFiles([]);setNotice('Message submitted to the mail server.');await loadMessages(selectedMailbox,'');
  }catch(e){setError(e instanceof Error?e.message:'Message could not be sent');}
  finally{setBusy(false);}
 };
 const saveDraft=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   if(!session||!auth)throw new Error('Please sign in to your mailbox.');
   const sender=identities[0];if(!sender)throw new Error('No sending identity is configured for this mailbox.');
   const drafts=mailboxes.find(x=>x.role==='drafts');if(!drafts)throw new Error('A Drafts folder is required to save drafts.');
   if(files.reduce((sum,file)=>sum+file.size,0)>20*1024*1024)throw new Error('Attachments must total 20 MB or less.');
   const raw=await buildRawMessage(sender,to.trim(),subject,body,files);
   const upload=await fetch(session.uploadUrl,{method:'POST',headers:{Authorization:auth,'Content-Type':'message/rfc822'},body:raw,redirect:'error'});
   if(!upload.ok)throw new Error('Unable to upload draft ('+upload.status+').');
   const uploaded=await upload.json() as {blobId?:string};if(!uploaded.blobId)throw new Error('Mail server did not accept the draft upload.');
   const imported=responseFor(await api([['Email/import',{accountId,emails:{draft:{blobId:uploaded.blobId,mailboxIds:{[drafts.id]:true},keywords:{'$draft':true}}}},'import']]),'Email/import');
   const created=imported.created&&typeof imported.created==='object'?imported.created as Record<string,{id?:string}>:{};
   if(!created.draft?.id)throw new Error('Mail server could not save the draft.');
   setCompose(false);setTo('');setSubject('');setBody('');setFiles([]);setNotice('Draft saved in Drafts.');await loadMessages(selectedMailbox,'');
  }catch(e){setError(e instanceof Error?e.message:'Draft could not be saved');}
  finally{setBusy(false);}
 };
 const signIn=async(event:React.FormEvent)=>{event.preventDefault();await loadSetup();};
 const content=selected?.bodyValues&&selected.textBody?selected.textBody.map(part=>part.partId?selected.bodyValues?.[part.partId]?.value??'':'').filter(Boolean).join('\n\n'):selected?.preview??'';
 if(!session)return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f2f6fb',fontFamily:'Inter,system-ui,sans-serif',padding:20,boxSizing:'border-box'}}>
  <form onSubmit={signIn} style={{background:'#fff',border:'1px solid #dce4ed',borderRadius:16,padding:28,width:'min(420px,100%)',boxSizing:'border-box',boxShadow:'0 16px 48px #18344b12'}}>
   <p style={{margin:'0 0 6px',color:'#60768b',fontSize:12,fontWeight:700,letterSpacing:1}}>UNE SOLUTIONS</p><h1 style={{margin:'0 0 8px',fontSize:28}}>Webmail</h1><p style={{margin:'0 0 24px',color:'#60768b'}}>Sign in with your mailbox email address and password.</p>
   {error&&<p role="alert" style={{color:'#a32222'}}>{error}</p>}
   <label style={{display:'grid',gap:6,marginBottom:14}}>Email address<input style={input} type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@unesolutions.co.uk"/></label>
   <label style={{display:'grid',gap:6,marginBottom:18}}>Password<input style={input} type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button style={{...button,background:'#183b60',color:'#fff',width:'100%'}} disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
   <p style={{fontSize:12,color:'#60768b',lineHeight:1.5,margin:'18px 0 0'}}>Your password stays in this browser session and is sent only to the configured mail server. Sign out to clear it.</p>
  </form>
 </main>;
 return <main style={{minHeight:'100vh',background:'#f2f6fb',color:'#172b3f',fontFamily:'Inter,system-ui,sans-serif',padding:20,boxSizing:'border-box'}}>
  <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:18}}>
   <div><p style={{margin:0,color:'#60768b',fontSize:12,fontWeight:700,letterSpacing:1}}>UNE SOLUTIONS</p><h1 style={{margin:'4px 0',fontSize:26}}>Mail</h1><span style={{color:'#60768b',fontSize:13}}>{email}</span></div>
   <div style={{display:'flex',gap:8}}><button style={button} onClick={()=>void loadMessages(selectedMailbox,'').catch(e=>setError(String(e)))}>Refresh</button><button style={button} onClick={signOut}>Sign out</button></div>
  </header>
  {(error||notice)&&<div role={error?'alert':'status'} style={{padding:12,marginBottom:12,borderRadius:8,background:error?'#fff1f1':'#e8f7ee',color:error?'#9b1c1c':'#17643b'}}>{error||notice}</div>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(160px,220px) minmax(260px,390px) minmax(0,1fr)',gap:12,minHeight:'75vh'}}>
   <nav style={{background:'#fff',border:'1px solid #dce4ed',borderRadius:12,padding:10}}>
    <button style={{...button,width:'100%',background:'#183b60',color:'#fff',marginBottom:10}} onClick={()=>{setCompose(true);setSelected(null);setError('');}}>＋ Compose</button>
    {mailboxes.map(folder=><button key={folder.id} onClick={()=>{setSelectedMailbox(folder.id);setSelected(null);setCompose(false);}} style={{...button,width:'100%',textAlign:'left',marginBottom:4,background:folder.id===selectedMailbox?'#eaf1f8':'#fff',borderColor:folder.id===selectedMailbox?'#a8bfd6':'#fff'}}>
     {folder.name}<span style={{float:'right',color:'#60768b'}}>{folder.unreadEmails?folder.unreadEmails:''}</span></button>)}
   </nav>
   <section style={{background:'#fff',border:'1px solid #dce4ed',borderRadius:12,padding:12,minWidth:0}}>
    <form onSubmit={e=>{e.preventDefault();void loadMessages(selectedMailbox,search).catch(err=>setError(String(err)));}} style={{display:'flex',gap:6,marginBottom:10}}><input style={{...input,minWidth:0}} placeholder="Search this folder" value={search} onChange={e=>setSearch(e.target.value)}/><button style={button}>Search</button></form>
    {messages.length===0?<p style={{padding:12,color:'#60768b'}}>No messages in this folder.</p>:messages.map(message=><button key={message.id} onClick={()=>void openMessage(message)} style={{display:'block',width:'100%',textAlign:'left',border:0,borderBottom:'1px solid #edf1f5',background:selected?.id===message.id?'#eef4fa':'#fff',padding:'12px 8px',cursor:'pointer',font:'inherit'}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:13}}><strong style={{fontWeight:message.keywords?.$seen?500:750,overflow:'hidden',textOverflow:'ellipsis'}}>{message.from?.[0]?.name||message.from?.[0]?.email||'Unknown sender'}</strong><span style={{whiteSpace:'nowrap',fontSize:11,color:'#60768b'}}>{message.receivedAt?new Date(message.receivedAt).toLocaleDateString():''}</span></div>
     <div style={{fontWeight:message.keywords?.$seen?400:700,margin:'5px 0',overflowWrap:'anywhere'}}>{message.subject||'(no subject)'}</div><div style={{fontSize:12,color:'#60768b',lineHeight:1.4}}>{message.preview||''}</div>
    </button>)}
   </section>
   <section style={{background:'#fff',border:'1px solid #dce4ed',borderRadius:12,padding:20,minWidth:0}}>
    {compose?<form onSubmit={send}><h2 style={{marginTop:0}}>New message</h2>
      <label style={{display:'grid',gap:6,marginBottom:12}}>To<input style={input} type="email" required value={to} onChange={e=>setTo(e.target.value)} placeholder="recipient@example.com"/></label>
      <label style={{display:'grid',gap:6,marginBottom:12}}>Subject<input style={input} value={subject} maxLength={500} onChange={e=>setSubject(e.target.value)}/></label>
      <label style={{display:'grid',gap:6,marginBottom:12}}>Message<textarea style={{...input,minHeight:220,resize:'vertical'}} required value={body} onChange={e=>setBody(e.target.value)}/></label>
      <label style={{display:'grid',gap:6,marginBottom:12}}>Attachments (20 MB total maximum)<input style={input} type="file" multiple onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>
      {files.length>0&&<ul>{files.map((file,index)=><li key={file.name+index}>{file.name} ({Math.ceil(file.size/1024)} KB)</li>)}</ul>}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={{...button,background:'#183b60',color:'#fff'}} disabled={busy}>{busy?'Sending…':'Send'}</button><button type="button" style={button} disabled={busy} onClick={()=>void saveDraft()}>Save draft</button><button type="button" style={button} onClick={()=>{setCompose(false);setFiles([]);}}>Cancel</button></div>
    </form>:selected?<article><div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><h2 style={{margin:'0 0 12px',overflowWrap:'anywhere'}}>{selected.subject||'(no subject)'}</h2><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={button} onClick={()=>reply(selected)}>Reply</button><button style={button} onClick={()=>forward(selected)}>Forward</button></div></div>
      <p style={{fontSize:13,color:'#60768b',overflowWrap:'anywhere'}}>From: {selected.from?.map(x=>x.name?x.name+' <'+x.email+'>':x.email).join(', ')||'Unknown sender'}</p>
      <p style={{fontSize:13,color:'#60768b',overflowWrap:'anywhere'}}>To: {selected.to?.map(x=>x.email).join(', ')||email}</p>
      <p style={{fontSize:12,color:'#60768b'}}>{selected.receivedAt?new Date(selected.receivedAt).toLocaleString():''}</p>
      <hr style={{border:0,borderTop:'1px solid #e4eaf0',margin:'18px 0'}}/>
      <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.6}}>{content||selected.preview||'No text body was supplied for this message.'}</div>
      {collectAttachments(selected.bodyStructure).length>0&&<div style={{marginTop:18,paddingTop:14,borderTop:'1px solid #e4eaf0'}}><h3 style={{fontSize:14,margin:'0 0 8px'}}>Attachments</h3>{collectAttachments(selected.bodyStructure).map((part,index)=><button key={(part.partId??part.blobId??'attachment')+index} type="button" style={{...button,display:'block',marginBottom:6,textAlign:'left',maxWidth:'100%',overflowWrap:'anywhere'}} onClick={()=>void downloadAttachment(part)}>{part.name||'Download attachment'}{typeof part.size==='number'?' · '+Math.ceil(part.size/1024)+' KB':''}</button>)}</div>}
    </article>:<div style={{display:'grid',placeItems:'center',height:'100%',minHeight:240,color:'#60768b',textAlign:'center'}}>Select a message to read it, or compose a new email.</div>}
   </section>
  </div>
  <style>{'@media(max-width:900px){main>div[style*="grid-template-columns"]{grid-template-columns:150px minmax(0,1fr)!important}main>div[style*="grid-template-columns"]>section:last-child{grid-column:1/-1}}@media(max-width:560px){main>div[style*="grid-template-columns"]{grid-template-columns:1fr!important}main>div[style*="grid-template-columns"]>nav{display:flex;flex-wrap:wrap;gap:4px}main>div[style*="grid-template-columns"]>nav button{width:auto!important}}'}</style>
 </main>;
}
