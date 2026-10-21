import * as React from 'react';
import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import './aceChatter.css';

type Row=Record<string,unknown>;
type Action={apiName:string;label:string};
const pick=(row:Row,...keys:string[])=>keys.map(key=>row[key]).find(value=>value!==undefined&&value!==null);
const label=(row:Row)=>String(pick(row,'Name','Subject','DisplayName','ContactName','PhoneNumber','Id')??'Conversation');
const identify=(row:Row)=>String(pick(row,'Id','id')??'');
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
/** Accept native record collections returned by a permitted OneEngine Flow.
 * The Flow owns object selection, filtering, sorting, pagination and RBAC.
 * No browser-side Record API fallback or client-selected object names. */
function readRows(outputs:Record<string,unknown>|undefined,key:'conversationsJson'|'messagesJson'):Row[]{
  const nativeKey=key==='conversationsJson'?'conversations':'messages';
  const value=outputs?.[nativeKey]??outputs?.[key]??outputs?.recordsJson;
  let parsed:unknown=value;
  if(typeof value==='string'){
    if(value.length>500000)throw new Error('Flow output exceeds inbox limit.');
    try{parsed=JSON.parse(value);}catch{throw new Error('Invalid JSON returned by chat Flow.');}
  }
  if(!Array.isArray(parsed)||parsed.length>200||!parsed.every(item=>item&&typeof item==='object'&&!Array.isArray(item)))
    throw new Error('Flow must return a record collection named '+nativeKey+' (up to 200 records).');
  return parsed as Row[];
}
const flowBySuffix=(actions:Action[],suffix:string)=>
  actions.find(action=>action.apiName.toLowerCase()==='acechatter'+suffix.toLowerCase());


export default function AceChatterRuntime({onLogout}:{onLogout:()=>void}) {
  const [conversations,setConversations]=useState<Row[]>([]);
  const [messages,setMessages]=useState<Row[]>([]);
  const [selected,setSelected]=useState('');
  const [filter,setFilter]=useState('');
  const [submittedSearch,setSubmittedSearch]=useState('');
  const [draft,setDraft]=useState('');
  const [actions,setActions]=useState<Action[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [refresh,setRefresh]=useState(0);
  const selectedRow=conversations.find(row=>identify(row)===selected);
  const loadConversations=flowBySuffix(actions,'LoadConversations');
  const loadMessages=flowBySuffix(actions,'LoadMessages');
  const sendFlow=flowBySuffix(actions,'SendMessage');
  useEffect(()=>{
    let live=true;
    void apiRequest<{actions:Action[]}>('/flows/available-actions?product=AceChatter')
      .then(flow=>{if(live)setActions(flow.actions??[]);})
      .catch(e=>{if(live)setError(errorText(e));});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    if(!loadConversations){setConversations([]);return;}
    let live=true;setBusy(true);setError('');
    void apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
      '/flows/'+encodeURIComponent(loadConversations.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({searchTerm:submittedSearch,limit:100})
      }).then(result=>{
        if(!live)return;
        if(result.interviewId)throw new Error('Loading conversations requires a synchronous Autolaunched Flow.');
        const loaded=readRows(result.outputs,'conversationsJson');
        setConversations(loaded);
        setSelected(previous=>loaded.some(row=>identify(row)===previous)?previous:'');
      }).catch(e=>{if(live)setError(errorText(e));})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[loadConversations?.apiName,submittedSearch,refresh]);
  useEffect(()=>{
    if(!selected||!loadMessages){setMessages([]);return;}
    let live=true;setBusy(true);setError('');setMessages([]);
    void apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
      '/flows/'+encodeURIComponent(loadMessages.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({conversationId:selected,limit:200})
      }).then(result=>{
        if(!live)return;
        if(result.interviewId)throw new Error('Loading messages requires a synchronous Autolaunched Flow.');
        setMessages(readRows(result.outputs,'messagesJson'));
      }).catch(e=>{if(live)setError(errorText(e));})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[loadMessages?.apiName,selected,refresh]);
  // Flow output is authoritative: no client-side record query or additional filtering.
  const visibleMessages=messages;
  const send=async()=>{
    if(!selected||!draft.trim()||!sendFlow)return;
    setBusy(true);setError('');setNotice('');
    try {
      const result=await apiRequest<{interviewId?:string;outputs?:Record<string,unknown>}>(`/flows/${encodeURIComponent(sendFlow.apiName)}/execute`,{
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
  const filtered=conversations;
  return <div className="ace-chat">
    <aside className="ace-chat-sidebar">
      <header className="ace-chat-brand"><div className="ace-chat-logo">✦</div><div><strong>AceChatter</strong><small>Customer messaging</small></div><button title="Sign out" onClick={()=>void logout()}>Sign out</button></header>
      <div className="ace-chat-sidebar-heading"><h1>Chats</h1><button onClick={()=>setRefresh(n=>n+1)} disabled={busy}>↻ Refresh</button></div>
      <form onSubmit={e=>{e.preventDefault();setSubmittedSearch(filter);}} className="ace-chat-search">
        <input aria-label="Search conversations" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search conversations…" />
        <button type="submit" disabled={!loadConversations||busy}>Search</button>
      </form>
      {!loadConversations&&<p className="ace-chat-hint">Activate an authorised AceChatterLoadConversations Autolaunched Flow in MetaDrive Flow Builder.</p>}
      <nav aria-label="Conversations">{filtered.map(row=><button key={identify(row)} className={selected===identify(row)?'selected':''} onClick={()=>setSelected(identify(row))}>
        <span className="ace-chat-avatar">{label(row).slice(0,1).toUpperCase()}</span><span><strong>{label(row)}</strong><small>{String(pick(row,'Status','PhoneNumber','Description')??'Conversation')}</small></span></button>)}</nav>
      {loadConversations&&!busy&&!filtered.length&&<p className="ace-chat-hint">No accessible conversations.</p>}
    </aside>
    <main className="ace-chat-main">
      <header className="ace-chat-top"><span className="ace-chat-avatar">{selectedRow?label(selectedRow).slice(0,1).toUpperCase():'✦'}</span><div><strong>{selectedRow?label(selectedRow):'Choose a conversation'}</strong><small>{selectedRow?String(pick(selectedRow,'Status','PhoneNumber')??'WhatsApp inbox'):'Your authorised tenant inbox'}</small></div></header>
      {error&&<p className="ace-chat-alert" role="alert">{error}</p>}
      {notice&&<p className="ace-chat-notice" role="status">{notice}</p>}
      <section className="ace-chat-thread" aria-label="Messages">
        {!selectedRow?<div className="ace-chat-welcome"><span>◉</span><h2>A better way to stay in touch</h2><p>Select a conversation to read messages and run your configured workflows.</p></div>:
         !loadMessages?<p className="ace-chat-hint">Activate AceChatterLoadMessages in Flow Builder to load this conversation.</p>:
         visibleMessages.length===0?<p className="ace-chat-hint">No messages visible for this conversation.</p>:
         visibleMessages.map((row,index)=><div key={identify(row)||index} className={String(pick(row,'Direction','MessageDirection')??'').toLowerCase().includes('out')?'ace-chat-bubble outgoing':'ace-chat-bubble'}>
           <p>{String(pick(row,'Body','MessageBody','Text','Content','Name')??'')}</p><small>{String(pick(row,'SentAt','CreatedAt','CreatedDate','Status')??'')}</small>
         </div>)}
      </section>
      <section className="ace-chat-compose" aria-label="Compose via workflow">
        <label>Sending: {sendFlow?.label??'AceChatterSendMessage Flow not configured'}</label>
        <div className="ace-chat-compose-row"><textarea aria-label="Message to send" placeholder="Type a message…" value={draft} onChange={e=>setDraft(e.target.value)} rows={2} disabled={!selectedRow||!loadMessages}/><button onClick={()=>void send()} disabled={busy||!selectedRow||!loadMessages||!draft.trim()||!sendFlow}>Send →</button></div>
        {!sendFlow&&<small>Activate AceChatterSendMessage in MetaDrive Flow Builder.</small>}
      </section>
    </main>
  </div>;
}
