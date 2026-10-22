import * as React from 'react';
import {useEffect,useState} from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import {buildCommunicationInbox,mergeCommunicationMessages,normalizeChatNumber} from './communicationInbox';
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
function readRows(outputs:Record<string,unknown>|undefined,
  key:'conversationsJson'|'messagesJson'|'communicationsJson'|'contactsJson'):Row[]{
  const nativeKey=key==='conversationsJson'?'conversations':
    key==='messagesJson'?'messages':key==='communicationsJson'?'communications':'contacts';
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
const contactLabel=(row:Row)=>{
  const direct=pick(row,'Name','DisplayName','ContactName');
  if(direct!==undefined&&String(direct).trim())return String(direct).trim();
  const name=[pick(row,'FirstName','GivenName'),pick(row,'LastName','FamilyName')]
    .map(value=>String(value??'').trim()).filter(Boolean).join(' ');
  return name||String(pick(row,'PhoneNumber','Mobile','Phone','Id')??'Contact');
};
const contactPhone=(row:Row)=>normalizeChatNumber(
  pick(row,'WhatsAppPhoneNumber','WhatsAppPhone','Mobile','MobilePhone','PhoneNumber','Phone')
);
const validChatPhone=(value:unknown)=>/^[1-9][0-9]{6,14}$/.test(normalizeChatNumber(value));

export default function AceChatterRuntime({onLogout}:{onLogout:()=>void}) {
  const [conversations,setConversations]=useState<Row[]>([]);
  const [communications,setCommunications]=useState<Row[]>([]);
  const [messages,setMessages]=useState<Row[]>([]);
  const [selected,setSelected]=useState('');
  const [filter,setFilter]=useState('');
  const [submittedSearch,setSubmittedSearch]=useState('');
  const [draft,setDraft]=useState('');
  const [showNewChat,setShowNewChat]=useState(false);
  const [newChatMode,setNewChatMode]=useState<'contacts'|'number'>('contacts');
  const [contacts,setContacts]=useState<Row[]>([]);
  const [contactSearch,setContactSearch]=useState('');
  const [submittedContactSearch,setSubmittedContactSearch]=useState('');
  const [contactsLoading,setContactsLoading]=useState(false);
  const [contactError,setContactError]=useState('');
  const [contactSourceObjectApi,setContactSourceObjectApi]=useState('');
  const [chatName,setChatName]=useState('');
  const [chatPhone,setChatPhone]=useState('');
  const [actions,setActions]=useState<Action[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [refresh,setRefresh]=useState(0);
  const loadConversations=flowBySuffix(actions,'LoadConversations');
  const loadMessages=flowBySuffix(actions,'LoadMessages');
  const loadCommunications=flowBySuffix(actions,'LoadCommunications');
  const resolveConversationFlow=flowBySuffix(actions,'FindConversationByPhone');
  const sendFlow=flowBySuffix(actions,'SendMessage');
  const newChatFlow=flowBySuffix(actions,'CreateConversation');
  const loadContactsFlow=flowBySuffix(actions,'LoadContacts');
  const inboxConversations=buildCommunicationInbox(conversations,communications,submittedSearch);
  const selectedRow=inboxConversations.find(row=>identify(row)===selected);
  const selectedPhone=normalizeChatNumber(pick(selectedRow??{},'PhoneNumber'));

  useEffect(()=>{
    let live=true;
    void apiRequest<{actions:Action[]}>('/flows/available-actions?product=AceChatter')
      .then(flow=>{if(live)setActions(flow.actions??[]);})
      .catch(e=>{if(live)setError(errorText(e));});
    return()=>{live=false;};
  },[]);

  // Contacts are discovered only through the tenant's authorised Flow and its configured user-link filter.
  useEffect(()=>{
    if(!showNewChat||newChatMode!=='contacts')return;
    if(!loadContactsFlow){
      setContacts([]);
      setContactSourceObjectApi('');
      setContactError('Activate an authorised AceChatterLoadContacts Flow configured for the contact object and current-user relationship.');
      setContactsLoading(false);
      return;
    }
    let live=true;
    setContactsLoading(true);setContactError('');
    void apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
      '/flows/'+encodeURIComponent(loadContactsFlow.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({searchTerm:submittedContactSearch,limit:200})
      }).then(result=>{
        if(!live)return;
        if(result.interviewId)throw new Error('Contact selection requires a synchronous Autolaunched Flow.');
        const outputs=result.outputs??{};
        const source=String(outputs.sourceObjectApi??'').trim();
        if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(source))
          throw new Error('The Load Contacts Flow must return sourceObjectApi so selected records can be linked safely.');
        setContactSourceObjectApi(source);
        setContacts(readRows(outputs,'contactsJson'));
      }).catch(e=>{if(live){setContacts([]);setContactError(errorText(e));}})
      .finally(()=>{if(live)setContactsLoading(false);});
    return()=>{live=false;};
  },[showNewChat,newChatMode,loadContactsFlow?.apiName,submittedContactSearch,refresh]);

  // ChatConversation remains the authorised recipient record required by the send Flow.
  useEffect(()=>{
    if(!loadConversations){setConversations([]);return;}
    let live=true;setBusy(true);setError('');
    void apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
      '/flows/'+encodeURIComponent(loadConversations.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({searchTerm:'',limit:100})
      }).then(result=>{
        if(!live)return;
        if(result.interviewId)throw new Error('Loading conversations requires a synchronous Autolaunched Flow.');
        setConversations(readRows(result.outputs,'conversationsJson'));
      }).catch(e=>{if(live)setError(errorText(e));})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[loadConversations?.apiName,refresh]);

  // Incoming messages are sourced from Communication records via an authorised Flow.
  useEffect(()=>{
    if(!loadCommunications){setCommunications([]);return;}
    let live=true;setBusy(true);setError('');
    const numberSearch=normalizeChatNumber(submittedSearch);
    const searchTerm=numberSearch.length>=3?numberSearch:submittedSearch.trim();
    void apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
      '/flows/'+encodeURIComponent(loadCommunications.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({searchTerm,limit:200})
      }).then(result=>{
        if(!live)return;
        if(result.interviewId)throw new Error('Loading received messages requires a synchronous Autolaunched Flow.');
        setCommunications(readRows(result.outputs,'communicationsJson'));
      }).catch(e=>{if(live)setError(errorText(e));})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[loadCommunications?.apiName,submittedSearch,refresh]);

  // If an incoming-only synthetic row becomes linked to an existing ChatConversation,
  // select the real authorised record so the normal send Flow remains the only sender.
  useEffect(()=>{
    if(!selected||!selected.startsWith('communication:'))return;
    const phone=normalizeChatNumber(selected.slice('communication:'.length));
    const linked=inboxConversations.find(row=>normalizeChatNumber(pick(row,'PhoneNumber'))===phone
      &&row.__syntheticConversation!==true);
    if(linked&&identify(linked)!==selected)setSelected(identify(linked));
  },[selected,conversations,communications,submittedSearch]);

  // Read the selected thread from both the durable Communication log and existing
  // Flow-created ChatMessage records. All object/record/field access stays in OneEngine.
  useEffect(()=>{
    if(!selected||!selectedRow||(!loadMessages&&!loadCommunications)){
      setMessages([]);return;
    }
    let live=true;setBusy(true);setError('');setMessages([]);
    const chatRequest:Promise<Row[]>=loadMessages&&selectedRow.__syntheticConversation!==true
      ?apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
        '/flows/'+encodeURIComponent(loadMessages.apiName)+'/execute',{
          method:'POST',body:JSON.stringify({conversationId:selected,limit:200})
        }).then(result=>{
          if(result.interviewId)throw new Error('Loading messages requires a synchronous Autolaunched Flow.');
          return readRows(result.outputs,'messagesJson');
        }):Promise.resolve([]);
    const communicationRequest:Promise<Row[]>=loadCommunications&&selectedPhone
      ?apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
        '/flows/'+encodeURIComponent(loadCommunications.apiName)+'/execute',{
          method:'POST',body:JSON.stringify({searchTerm:selectedPhone,limit:200})
        }).then(result=>{
          if(result.interviewId)throw new Error('Loading received messages requires a synchronous Autolaunched Flow.');
          return readRows(result.outputs,'communicationsJson');
        }):Promise.resolve([]);
    void Promise.all([chatRequest,communicationRequest]).then(([chatRows,communicationRows])=>{
      if(live)setMessages(mergeCommunicationMessages(communicationRows,chatRows,selectedPhone));
    }).catch(e=>{if(live)setError(errorText(e));})
      .finally(()=>{if(live)setBusy(false);});
    return()=>{live=false;};
  },[loadMessages?.apiName,loadCommunications?.apiName,selected,selectedPhone,
    selectedRow?.__syntheticConversation,refresh]);

  const visibleMessages=messages;
  const send=async()=>{
    if(!selected||!selectedRow||!draft.trim()||!sendFlow)return;
    setBusy(true);setError('');setNotice('');
    try {
      let targetConversation=selectedRow;
      const phone=normalizeChatNumber(pick(selectedRow,'PhoneNumber'));
      if(!/^\d{7,15}$/.test(phone))throw new Error('This chat has no valid WhatsApp number.');
      if(selectedRow.__syntheticConversation===true){
        if(!newChatFlow||!resolveConversationFlow)
          throw new Error('Activate the authorised Create Conversation and Find Conversation by Phone Flows before sending to a new chat.');
        await apiRequest('/flows/'+encodeURIComponent(newChatFlow.apiName)+'/execute',{
          method:'POST',body:JSON.stringify({chatName:label(selectedRow),phoneNumber:phone})
        });
        const result=await apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
          '/flows/'+encodeURIComponent(resolveConversationFlow.apiName)+'/execute',{
            method:'POST',body:JSON.stringify({phoneNumber:phone,limit:200})
          });
        if(result.interviewId)throw new Error('Resolving the recipient requires a synchronous Autolaunched Flow.');
        const resolvedRows=readRows(result.outputs,'conversationsJson');
        const resolved=resolvedRows.find(row=>normalizeChatNumber(pick(row,'PhoneNumber'))===phone);
        if(!resolved)throw new Error('The authorised Flow did not return the WhatsApp conversation after creation.');
        setConversations(previous=>[
          ...previous.filter(row=>normalizeChatNumber(pick(row,'PhoneNumber'))!==phone),resolved
        ]);
        targetConversation=resolved;setSelected(identify(resolved));
      }
      const conversationId=identify(targetConversation);
      if(!conversationId)throw new Error('The selected chat has no authorised conversation record.');
      const result=await apiRequest<{interviewId?:string;outputs?:Record<string,unknown>}>(
        '/flows/'+encodeURIComponent(sendFlow.apiName)+'/execute',{
          method:'POST',body:JSON.stringify({conversationId,message:draft.trim()})
        });
      setNotice(result.interviewId?'Workflow started; delivery is not yet confirmed.':'Workflow executed. Check provider delivery status.');
      setDraft('');setRefresh(n=>n+1);
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  };

  const createChat=async()=>{
    if(!newChatFlow||!chatName.trim()||!/^[1-9][0-9]{6,14}$/.test(chatPhone))return;
    setBusy(true);setError('');
    try{
      await apiRequest('/flows/'+encodeURIComponent(newChatFlow.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({chatName:chatName.trim(),phoneNumber:chatPhone})
      });
      setShowNewChat(false);setChatName('');setChatPhone('');setRefresh(n=>n+1);
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* clear client regardless */}
    onLogout();window.location.assign('/login');
  };
  const filtered=inboxConversations;
  return <div className="ace-chat">
    <aside className="ace-chat-sidebar">
      <header className="ace-chat-brand"><div className="ace-chat-logo">✦</div><div><strong>AceChatter</strong><small>Customer messaging</small></div><button title="Sign out" onClick={()=>void logout()}>Sign out</button></header>
      <div className="ace-chat-sidebar-heading"><h1>Chats</h1><button onClick={()=>setRefresh(n=>n+1)} disabled={busy}>↻ Refresh</button><button onClick={()=>setShowNewChat(true)} disabled={busy||!newChatFlow}>+ New Chat</button></div>
      <form onSubmit={e=>{e.preventDefault();setSubmittedSearch(filter);}} className="ace-chat-search">
        <input aria-label="Filter by chat number or contact" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter by chat number or contact…" />
        <button type="submit" disabled={!loadCommunications||busy}>Filter</button>
      </form>
      {!loadConversations&&<p className="ace-chat-hint">Activate an authorised AceChatterLoadConversations Autolaunched Flow to list saved conversations.</p>}
      {!loadCommunications&&<p className="ace-chat-hint">Activate an authorised AceChatterLoadCommunications Flow to read incoming WhatsApp messages from Communication records.</p>}
      <nav aria-label="Conversations">{filtered.map(row=><button key={identify(row)} className={selected===identify(row)?'selected':''} onClick={()=>setSelected(identify(row))}>
        <span className="ace-chat-avatar">{label(row).slice(0,1).toUpperCase()}</span><span><strong>{label(row)}</strong><small>{String(pick(row,'PhoneNumber','Status','Description')??'Conversation')}</small></span></button>)}</nav>
      {loadCommunications&&!busy&&!filtered.length&&<p className="ace-chat-hint">No WhatsApp messages or conversations match this filter.</p>}
    </aside>
    <main className="ace-chat-main">
      <header className="ace-chat-top"><span className="ace-chat-avatar">{selectedRow?label(selectedRow).slice(0,1).toUpperCase():'✦'}</span><div><strong>{selectedRow?label(selectedRow):'Choose a conversation'}</strong><small>{selectedRow?String(pick(selectedRow,'PhoneNumber','Status')??'WhatsApp inbox'):'Your authorised tenant inbox'}</small></div></header>
      {error&&<p className="ace-chat-alert" role="alert">{error}</p>}
      {notice&&<p className="ace-chat-notice" role="status">{notice}</p>}
      <section className="ace-chat-thread" aria-label="Messages">
        {!selectedRow?<div className="ace-chat-welcome"><span>◉</span><h2>WhatsApp inbox</h2><p>Choose a chat to read messages from Communication records, filtered by the sender's WhatsApp number.</p></div>:
         !loadMessages&&!loadCommunications?<p className="ace-chat-hint">Activate the authorised message-loading Flows in MetaDrive Flow Builder.</p>:
         visibleMessages.length===0?<p className="ace-chat-hint">No messages visible for this WhatsApp number.</p>:
         visibleMessages.map((row,index)=><div key={identify(row)||index} className={String(pick(row,'Direction','MessageDirection')??'').toLowerCase().includes('out')?'ace-chat-bubble outgoing':'ace-chat-bubble'}>
           <p>{String(pick(row,'Body','MessageBody','Text','Content','Name')??'')}</p><small>{String(pick(row,'SentAt','ReceivedAt','CreatedAt','CreatedDate','Status')??'')}</small>
         </div>)}
      </section>
      <section className="ace-chat-compose" aria-label="Compose via workflow">
        <label>Sending: {sendFlow?.label??'WhatsApp sending unavailable'}</label>
        <div className="ace-chat-compose-row"><textarea aria-label="Message to send" placeholder="Type a message…" value={draft} onChange={e=>setDraft(e.target.value)} rows={2} disabled={!selectedRow||!sendFlow}/><button onClick={()=>void send()} disabled={busy||!selectedRow||!draft.trim()||!sendFlow}>Send →</button></div>
        {!sendFlow&&<small>The sending Flow must be active and authorised. In MetaDrive Flow Builder, open AceChatterSendMessage, assign a WhatsApp HTTPS Named Credential to its HTTP Callout, validate the sender settings and recipient lookup, then activate the Flow. Until then, messages cannot be sent.</small>}
      </section>
    </main>
    {showNewChat&&<div className="ace-chat-modal-backdrop" role="presentation">
      <div className="ace-chat-modal" role="dialog" aria-modal="true" aria-label="New WhatsApp conversation">
        <h2>New WhatsApp conversation</h2><p>Creates a tenant conversation through OneEngine Flow. Use international digits without +.</p>
        <form onSubmit={event=>{event.preventDefault();void createChat();}}>
          <label>Contact name<input required value={chatName} onChange={event=>setChatName(event.target.value)} maxLength={100}/></label>
          <label>WhatsApp number<input required inputMode="tel" pattern="[1-9][0-9]{6,14}" placeholder="447XXXXXXXXX" value={chatPhone} onChange={event=>setChatPhone(event.target.value)}/></label>
          <div className="ace-chat-modal-actions"><button type="button" onClick={()=>setShowNewChat(false)}>Cancel</button><button type="submit" disabled={busy||!chatName.trim()||!/^[1-9][0-9]{6,14}$/.test(chatPhone)}>Create</button></div>
        </form>
      </div>
    </div>}
  </div>;
}
