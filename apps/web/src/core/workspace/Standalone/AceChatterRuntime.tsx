import * as React from 'react';
import {useEffect,useMemo,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import './aceChatter.css';

type Row=Record<string,unknown>;
type Obj={apiName:string;fields?:Array<{apiName:string}>};
type Action={apiName:string;label:string};
const conversationNames=['WhatsAppConversation','ChatConversation','Conversation'];
const messageNames=['WhatsAppMessage','ChatMessage','Message'];
const pick=(row:Row,...keys:string[])=>keys.map(key=>row[key]).find(value=>value!==undefined&&value!==null);
const label=(row:Row)=>String(pick(row,'Name','Subject','DisplayName','ContactName','PhoneNumber','Id')??'Conversation');
const identify=(row:Row)=>String(pick(row,'Id','id')??'');
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);

export default function AceChatterRuntime({onLogout}:{onLogout:()=>void}) {
  const [objects,setObjects]=useState<Obj[]>([]);
  const [conversations,setConversations]=useState<Row[]>([]);
  const [messages,setMessages]=useState<Row[]>([]);
  const [selected,setSelected]=useState('');
  const [filter,setFilter]=useState('');
  const [draft,setDraft]=useState('');
  const [actions,setActions]=useState<Action[]>([]);
  const [actionId,setActionId]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [refresh,setRefresh]=useState(0);
  const conversationObject=conversationNames.map(name=>objects.find(obj=>obj.apiName.toLowerCase()===name.toLowerCase())).find(Boolean);
  const messageObject=messageNames.map(name=>objects.find(obj=>obj.apiName.toLowerCase()===name.toLowerCase())).find(Boolean);
  const selectedRow=conversations.find(row=>identify(row)===selected);
  useEffect(()=>{
    let live=true;
    void Promise.all([
      apiRequest<{objects:Obj[]}>('/metadata/objects'),
      apiRequest<{actions:Action[]}>('/flows/available-actions?product=AceChatter')
    ]).then(([meta,flow])=>{
      if(!live)return;
      setObjects(meta.objects??[]);setActions(flow.actions??[]);
    }).catch(e=>{if(live)setError(errorText(e));});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    if(!conversationObject)return;
    let live=true;setBusy(true);setError('');
    void apiRequest<{records:Row[]}>(`/records/${encodeURIComponent(conversationObject.apiName)}?limit=100`)
      .then(value=>{if(live)setConversations(value.records??[]);})
      .catch(e=>{if(live)setError(errorText(e));})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[conversationObject?.apiName,refresh]);
  useEffect(()=>{
    if(!messageObject||!selected){setMessages([]);return;}
    let live=true;setBusy(true);setError('');
    // Permission-filtered reads through the shared Object API. Do not ask the
    // browser to call a WhatsApp provider or expose provider credentials.
    void apiRequest<{records:Row[]}>(`/records/${encodeURIComponent(messageObject.apiName)}?limit=200`)
      .then(value=>{if(live)setMessages(value.records??[]);})
      .catch(e=>{if(live)setError(errorText(e));})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[messageObject?.apiName,selected,refresh]);
  const visibleMessages=useMemo(()=>messages.filter(row=>
    String(pick(row,'ConversationId','Conversation','ChatId','ThreadId','WhatsAppConversationId')??'')===selected
  ).sort((a,b)=>String(pick(a,'CreatedAt','SentAt','CreatedDate')??'').localeCompare(
    String(pick(b,'CreatedAt','SentAt','CreatedDate')??''))),[messages,selected]);
  const send=async()=>{
    if(!selected||!draft.trim()||!actionId)return;
    setBusy(true);setError('');setNotice('');
    try {
      const result=await apiRequest<{interviewId?:string;outputs?:Record<string,unknown>}>(`/flows/${encodeURIComponent(actionId)}/execute`,{
        method:'POST',body:JSON.stringify({conversationId:selected,message:draft.trim()})
      });
      setNotice(result.interviewId?'Workflow started; delivery is not yet confirmed.':'Workflow executed. Check provider delivery status.');
      setDraft('');setRefresh(n=>n+1);
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  };
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* clear client regardless */}
    onLogout();window.location.assign('/login');
  };
  const filtered=conversations.filter(row=>label(row).toLowerCase().includes(filter.toLowerCase()));
  return <div className="ace-chat">
    <aside className="ace-chat-sidebar">
      <header className="ace-chat-brand"><div className="ace-chat-logo">✦</div><div><strong>AceChatter</strong><small>Customer messaging</small></div><button title="Sign out" onClick={()=>void logout()}>Sign out</button></header>
      <div className="ace-chat-sidebar-heading"><h1>Chats</h1><button onClick={()=>setRefresh(n=>n+1)} disabled={busy}>↻ Refresh</button></div>
      <input aria-label="Search conversations" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search conversations…" />
      {!conversationObject&&<p className="ace-chat-hint">No authorised Conversation object is available. Configure it in MetaDrive Object Manager.</p>}
      <nav aria-label="Conversations">{filtered.map(row=><button key={identify(row)} className={selected===identify(row)?'selected':''} onClick={()=>setSelected(identify(row))}>
        <span className="ace-chat-avatar">{label(row).slice(0,1).toUpperCase()}</span><span><strong>{label(row)}</strong><small>{String(pick(row,'Status','PhoneNumber','Description')??'Conversation')}</small></span></button>)}</nav>
      {conversationObject&&!busy&&!filtered.length&&<p className="ace-chat-hint">No accessible conversations.</p>}
    </aside>
    <main className="ace-chat-main">
      <header className="ace-chat-top"><span className="ace-chat-avatar">{selectedRow?label(selectedRow).slice(0,1).toUpperCase():'✦'}</span><div><strong>{selectedRow?label(selectedRow):'Choose a conversation'}</strong><small>{selectedRow?String(pick(selectedRow,'Status','PhoneNumber')??'WhatsApp inbox'):'Your authorised tenant inbox'}</small></div></header>
      {error&&<p className="ace-chat-alert" role="alert">{error}</p>}
      {notice&&<p className="ace-chat-notice" role="status">{notice}</p>}
      <section className="ace-chat-thread" aria-label="Messages">
        {!selectedRow?<div className="ace-chat-welcome"><span>◉</span><h2>A better way to stay in touch</h2><p>Select a conversation to read messages and run your configured workflows.</p></div>:
         !messageObject?<p className="ace-chat-hint">No authorised Message object is available. Configure it in MetaDrive Object Manager.</p>:
         visibleMessages.length===0?<p className="ace-chat-hint">No messages visible for this conversation.</p>:
         visibleMessages.map((row,index)=><div key={identify(row)||index} className={String(pick(row,'Direction','MessageDirection')??'').toLowerCase().includes('out')?'ace-chat-bubble outgoing':'ace-chat-bubble'}>
           <p>{String(pick(row,'Body','MessageBody','Text','Content','Name')??'')}</p><small>{String(pick(row,'SentAt','CreatedAt','CreatedDate','Status')??'')}</small>
         </div>)}
      </section>
      <section className="ace-chat-compose" aria-label="Compose via workflow">
        <label htmlFor="ace-flow">Send using active OneEngine Flow</label>
        <select id="ace-flow" value={actionId} onChange={e=>setActionId(e.target.value)}><option value="">Select an authorised workflow</option>{actions.map(action=><option key={action.apiName} value={action.apiName}>{action.label}</option>)}</select>
        <div className="ace-chat-compose-row"><textarea aria-label="Message to send" placeholder="Type a message…" value={draft} onChange={e=>setDraft(e.target.value)} rows={2} disabled={!selectedRow||!messageObject}/><button onClick={()=>void send()} disabled={busy||!selectedRow||!messageObject||!draft.trim()||!actionId}>Send →</button></div>
        {!actions.length&&<small>No active permitted workflows. Configure sending in MetaDrive Flow Builder.</small>}
      </section>
    </main>
  </div>;
}
