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
          method:'POST',body:JSON.stringify({chatName:label(selectedRow),phoneNumber:phone,sourceObjectApi:'',sourceRecordId:''})
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

  const startConversation=async(nameValue:string,phoneValue:unknown,sourceObjectApi='',sourceRecordId='')=>{
    const name=nameValue.trim();
    const phone=normalizeChatNumber(phoneValue);
    if(!newChatFlow||!name||!validChatPhone(phone)){
      setContactError('Enter a contact name and a valid international WhatsApp number.');
      return;
    }
    setBusy(true);setError('');setContactError('');setNotice('');
    try{
      await apiRequest('/flows/'+encodeURIComponent(newChatFlow.apiName)+'/execute',{
        method:'POST',body:JSON.stringify({chatName:name,phoneNumber:phone,sourceObjectApi,sourceRecordId})
      });
      let resolved:Row|undefined;
      if(resolveConversationFlow){
        const result=await apiRequest<{outputs?:Record<string,unknown>;interviewId?:string}>(
          '/flows/'+encodeURIComponent(resolveConversationFlow.apiName)+'/execute',{
            method:'POST',body:JSON.stringify({phoneNumber:phone,limit:200})
          });
        if(result.interviewId)throw new Error('Resolving the conversation requires a synchronous Autolaunched Flow.');
        resolved=readRows(result.outputs,'conversationsJson')
          .find(row=>normalizeChatNumber(pick(row,'PhoneNumber'))===phone);
      }
      setShowNewChat(false);setChatName('');setChatPhone('');
      setFilter('');setSubmittedSearch('');
      if(resolved&&identify(resolved)){
        setConversations(previous=>[...previous.filter(row=>normalizeChatNumber(pick(row,'PhoneNumber'))!==phone),resolved!]);
        setSelected(identify(resolved));
        setNotice('Chat opened. Sending and delivery status depend on the configured WhatsApp Flow.');
      }else{
        setNotice('Conversation submitted through OneEngine. Refresh the inbox to open it.');
      }
      setRefresh(n=>n+1);
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  };
  const createChatFromContact=async(contact:Row)=>{
    const phone=contactPhone(contact);
    if(!validChatPhone(phone)){
      setContactError('This contact has no valid WhatsApp phone number. Choose another contact or use Phone number.');
      return;
    }
    if(!contactSourceObjectApi||!identify(contact)){
      setContactError('The contact Flow must return its source object and record ID.');
      return;
    }
    await startConversation(contactLabel(contact),phone,contactSourceObjectApi,identify(contact));
  };
  const createChatFromNumber=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    await startConversation(chatName,chatPhone,'','');
  };
  const openNewChat=()=>{
    setShowNewChat(true);setNewChatMode('contacts');setContacts([]);
    setContactSearch('');setSubmittedContactSearch('');setContactError('');
    setContactSourceObjectApi('');setChatName('');setChatPhone('');
  };
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}catch{/* clear client regardless */}
    onLogout();window.location.assign('/login');
  };
  const filtered=inboxConversations;
  return <div className={'ace-chat'+(selectedRow?' has-selected-chat':'')+(showNewChat?' new-chat-open':'')}>
    <aside className="ace-chat-sidebar">
      <header className="ace-chat-brand">
        <div className="ace-chat-logo" aria-hidden="true">✦</div>
        <div className="ace-chat-brand-copy"><strong>AceChatter</strong><small>Customer messaging</small></div>
        <button className="ace-chat-signout" title="Sign out" aria-label="Sign out" onClick={()=>void logout()}>Sign out</button>
      </header>
      <div className="ace-chat-sidebar-heading"><h1>Chats</h1><div className="ace-chat-toolbar">
        <button className="ace-chat-icon-button" title="Refresh chats" aria-label="Refresh chats" onClick={()=>setRefresh(n=>n+1)} disabled={busy}>↻</button>
        <button className="ace-chat-new-button" title="New chat" aria-label="New chat" onClick={openNewChat} disabled={busy||!newChatFlow}><span aria-hidden="true">＋</span><span>New chat</span></button>
      </div></div>
      <form onSubmit={event=>{event.preventDefault();setSubmittedSearch(filter);}} className="ace-chat-search">
        <span aria-hidden="true">⌕</span>
        <input aria-label="Filter by chat number or contact" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Search or start a new chat" />
        <button type="submit" aria-label="Search chats" disabled={!loadCommunications||busy}>Search</button>
      </form>
      {!loadConversations&&<p className="ace-chat-hint">Activate an authorised AceChatterLoadConversations Flow to list saved conversations.</p>}
      {!loadCommunications&&<p className="ace-chat-hint">Activate an authorised AceChatterLoadCommunications Flow to read incoming WhatsApp messages from Communication records.</p>}
      <nav className="ace-chat-conversation-list" aria-label="Conversations">{filtered.map(row=>{
        const rowId=identify(row);
        const preview=String(pick(row,'__lastMessageBody','Body','PhoneNumber','Status')??'WhatsApp chat');
        const stamp=String(pick(row,'__lastMessageAt','SentAt','ReceivedAt')??'');
        return <button key={rowId} className={'ace-chat-conversation'+(selected===rowId?' selected':'')} onClick={()=>{setSelected(rowId);setNotice('');setError('');}}>
          <span className="ace-chat-avatar">{label(row).slice(0,1).toUpperCase()}</span>
          <span className="ace-chat-conversation-copy"><strong>{label(row)}</strong><small>{preview}</small></span>
          <span className="ace-chat-conversation-meta">{stamp&&<small>{stamp}</small>}</span>
        </button>;
      })}</nav>
      {loadCommunications&&!busy&&!filtered.length&&<div className="ace-chat-list-empty"><span aria-hidden="true">☏</span><strong>No chats yet</strong><p>Start a new chat with a contact or phone number.</p><button onClick={openNewChat} disabled={!newChatFlow}>New chat</button></div>}
    </aside>
    <main className="ace-chat-main">
      <header className="ace-chat-top">
        <button className="ace-chat-back" aria-label="Back to chats" onClick={()=>setSelected('')}>‹</button>
        <span className="ace-chat-avatar">{selectedRow?label(selectedRow).slice(0,1).toUpperCase():'✦'}</span>
        <div className="ace-chat-thread-heading"><strong>{selectedRow?label(selectedRow):'AceChatter'}</strong><small>{selectedRow?String(pick(selectedRow,'PhoneNumber','Status')??'WhatsApp chat'):'Select a chat to start messaging'}</small></div>
        {selectedRow&&<button className="ace-chat-icon-button ace-chat-thread-refresh" title="Refresh messages" aria-label="Refresh messages" onClick={()=>setRefresh(n=>n+1)} disabled={busy}>↻</button>}
      </header>
      {error&&<p className="ace-chat-alert" role="alert">{error}</p>}
      {notice&&<p className="ace-chat-notice" role="status">{notice}</p>}
      <section className="ace-chat-thread" aria-label="Messages">
        {!selectedRow?<div className="ace-chat-welcome"><span aria-hidden="true">◉</span><h2>WhatsApp inbox</h2><p>Choose a chat to read messages from Communication records, filtered by the sender's WhatsApp number.</p><button onClick={openNewChat} disabled={!newChatFlow}>＋ New chat</button></div>:
         !loadMessages&&!loadCommunications?<p className="ace-chat-hint">Activate the authorised message-loading Flows in MetaDrive Flow Builder.</p>:
         visibleMessages.length===0?<p className="ace-chat-thread-empty">No messages visible for this WhatsApp number.</p>:
         visibleMessages.map((row,index)=><div key={identify(row)||index} className={String(pick(row,'Direction','MessageDirection')??'').toLowerCase().includes('out')?'ace-chat-bubble outgoing':'ace-chat-bubble'}>
           <p>{String(pick(row,'Body','MessageBody','Text','Content','Name')??'')}</p><small>{String(pick(row,'SentAt','ReceivedAt','CreatedAt','CreatedDate','Status')??'')}</small>
         </div>)}
      </section>
      {selectedRow&&<section className="ace-chat-compose" aria-label="Compose via workflow">
        <div className="ace-chat-compose-row"><textarea aria-label="Message to send" placeholder="Type a message" value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}} rows={1} disabled={!sendFlow}/><button className="ace-chat-send-button" aria-label="Send message" title="Send message" onClick={()=>void send()} disabled={busy||!draft.trim()||!sendFlow}>➤</button></div>
        {!sendFlow&&<small>The WhatsApp sending Flow must be active and authorised before messages can be sent.</small>}
      </section>}
    </main>
    {showNewChat&&<div className="ace-chat-modal-backdrop" role="presentation">
      <section className="ace-chat-modal ace-chat-new-chat-modal" role="dialog" aria-modal="true" aria-label="New chat">
        <header className="ace-chat-modal-header"><button type="button" className="ace-chat-modal-back" aria-label="Close new chat" onClick={()=>setShowNewChat(false)}>‹</button><div><h2>New chat</h2><p>Choose a contact or enter a number</p></div></header>
        <div className="ace-chat-new-chat-tabs" role="tablist" aria-label="New chat method">
          <button type="button" role="tab" aria-selected={newChatMode==='contacts'} className={newChatMode==='contacts'?'active':''} onClick={()=>setNewChatMode('contacts')}>Contacts</button>
          <button type="button" role="tab" aria-selected={newChatMode==='number'} className={newChatMode==='number'?'active':''} onClick={()=>setNewChatMode('number')}>Phone number</button>
        </div>
        {newChatMode==='contacts'?<div className="ace-chat-contact-panel">
          <form className="ace-chat-contact-search" onSubmit={event=>{event.preventDefault();setSubmittedContactSearch(contactSearch);}}>
            <span aria-hidden="true">⌕</span><input aria-label="Search contacts" placeholder="Search contacts" value={contactSearch} onChange={event=>setContactSearch(event.target.value)}/><button type="submit" disabled={contactsLoading}>Search</button>
          </form>
          {contactError&&<p className="ace-chat-contact-error" role="alert">{contactError}</p>}
          {contactsLoading?<p className="ace-chat-contact-state">Loading contacts…</p>:
           !loadContactsFlow?<p className="ace-chat-contact-state">Configure and activate AceChatterLoadContacts in Flow Builder.</p>:
           contacts.length===0?<p className="ace-chat-contact-state">No accessible contacts found. Configure the Flow's object and current-user link filter, and check your OneEngine read permissions.</p>:
           <div className="ace-chat-contacts-list">{contacts.map((contact,index)=>{
             const phone=contactPhone(contact);
             const name=contactLabel(contact);
             const usable=validChatPhone(phone);
             return <button type="button" className="ace-chat-contact-row" key={identify(contact)||index} onClick={()=>void createChatFromContact(contact)} disabled={busy||!usable}>
               <span className="ace-chat-avatar">{name.slice(0,1).toUpperCase()}</span><span className="ace-chat-contact-copy"><strong>{name}</strong><small>{usable?'+'+phone:'No valid phone number'}</small></span><span className="ace-chat-contact-arrow" aria-hidden="true">›</span>
             </button>;
           })}</div>}
        </div>:<form className="ace-chat-number-form" onSubmit={event=>void createChatFromNumber(event)}>
          <label>Contact name<input required autoComplete="name" value={chatName} onChange={event=>setChatName(event.target.value)} maxLength={100} placeholder="Name"/></label>
          <label>WhatsApp number<input required autoComplete="tel" inputMode="tel" value={chatPhone} onChange={event=>setChatPhone(event.target.value)} placeholder="+44 7700 900123"/></label>
          <small>Include the country code. Spaces and a leading + are accepted.</small>
          {contactError&&<p className="ace-chat-contact-error" role="alert">{contactError}</p>}
          <button type="submit" className="ace-chat-start-button" disabled={busy||!chatName.trim()||!validChatPhone(chatPhone)}>Start chat</button>
        </form>}
      </section>
    </div>}
  </div>;
}
