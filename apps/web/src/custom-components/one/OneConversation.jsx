function sendAction(props,event,value){
 if(typeof props.onAction!=='function')throw Error('Configure a Flow action for this conversation event.');
 return Promise.resolve(props.onAction({event,value}));
}

function ConversationInbox({props}) {
 const [selectedId,setSelectedId]=React.useState('');
 const [newConversation,setNewConversation]=React.useState(false);
 const [selectedAccount,setSelectedAccount]=React.useState('');
 const [search,setSearch]=React.useState('');
 const [filter,setFilter]=React.useState('all');
 const [draft,setDraft]=React.useState('');
 const [recipient,setRecipient]=React.useState('');
 const [contactSearch,setContactSearch]=React.useState('');
 const [assigneeId,setAssigneeId]=React.useState('');
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState('');
 const [notice,setNotice]=React.useState('');
 const conversations=Array.isArray(props.conversations)?props.conversations:[];
 const messages=Array.isArray(props.messages)?props.messages:[];
 const accounts=Array.isArray(props.channelAccounts)?props.channelAccounts:[];
 const contacts=Array.isArray(props.contactChoices)?props.contactChoices:[];
 const allowed=Array.isArray(props.allowedAccountIds)?props.allowedAccountIds.map(String):[];
 const assignedAccounts=accounts.filter(account=>allowed.includes(String(account.id)));
 const visible=conversations.filter(item=>
  (!selectedAccount||String(item.channelAccountId)===selectedAccount)&&
  (!props.restrictToAssigned||props.canViewAll===true||!item.assignedUserId||item.assignedUserId===props.currentUserId)&&
  (!allowed.length||allowed.includes(String(item.channelAccountId))));
 const filtered=visible.filter(item=>
  (filter==='all'||(filter==='unread'&&Number(item.unreadCount)>0)||
   (filter==='mine'&&item.assignedUserId===props.currentUserId))&&
  [item.contactName,item.phoneNumber,item.preview].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const selected=visible.find(item=>String(item.id)===selectedId);
 const thread=selected?messages.filter(item=>String(item.conversationId)===String(selected.id))
  .sort((left,right)=>String(left.sentAt||'').localeCompare(String(right.sentAt||''))):[];
 const canSend=selected?selected.canSend===true&&props.canSend===true:
  assignedAccounts.some(account=>String(account.id)===selectedAccount&&account.canSend!==false)&&Boolean(selectedAccount);
 const assigned=Array.isArray(props.eligibleAssignees)?props.eligibleAssignees:[];
 const eligible=assigned.filter(item=>selected&&item.channelAccountId===selected.channelAccountId);
 const send=async event=>{
  event.preventDefault();
  const body=draft.trim();
  if(!body||busy||!canSend)return;
  if(!selected&&!recipient.trim()){setError('Enter a recipient before sending.');return;}
  if(!selected&&!/^\+?[1-9]\d{5,14}$/.test(recipient.trim())){setError('Enter an international phone number including country code.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const result=await sendAction(props,'send',{
    conversationId:selected?.id??JSON.stringify([selectedAccount,recipient.trim()]),
    channelAccountId:selected?.channelAccountId??selectedAccount,
    recipientPhone:selected?.phoneNumber??recipient.trim(),body
   });
   if(result&&result.error)throw Error(String(result.error));
   if(result===null||result===false)return;
   setDraft('');setNotice(props.sentNoticeText||'Message request submitted.');
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to send message.');}
  finally{setBusy(false);}
 };
 const act=async(event,value)=>{
  setBusy(true);setError('');
  try{await sendAction(props,event,value);}
  catch(cause){setError(cause instanceof Error?cause.message:'Action failed.');}
  finally{setBusy(false);}
 };
 const contactMatches=contacts.filter(contact=>
  [contact.name,contact.phone].join(' ').toLowerCase().includes(contactSearch.trim().toLowerCase())).slice(0,30);
 const title=item=>item.contactName||item.phoneNumber||item.label||item.name||'Conversation';
 return <section className={'one-conversation-inbox'+((selected||newConversation)?' one-conversation-inbox--open':'')}
  style={{'--one-accent':props.accentColor||'#168657'}}>
  <aside className="one-surface one-conversation-list">
   <header>
    <div className="one-row" style={{justifyContent:'space-between'}}>
     <h3 className="one-heading">{props.title||'Conversations'}</h3><span className="one-muted">{visible.length}</span>
    </div>
    {props.enableNewConversation===true&&<button className="one-btn" type="button"
     disabled={!assignedAccounts.some(account=>account.canSend!==false)}
     onClick={()=>{setSelectedId('');setNewConversation(true);setError('');setNotice('');setSelectedAccount(value=>value||String(assignedAccounts.find(account=>account.canSend!==false)?.id||''));}}>
     {props.newConversationLabel||'New conversation'}
    </button>}
    <label className="one-label">{props.accountLabel||'Account'}
     <select className="one-control" value={selectedAccount} disabled={!assignedAccounts.length}
      onChange={event=>{setSelectedAccount(event.target.value);setSelectedId('');setNewConversation(false);}}>
      <option value="">{props.allAccountsLabel||'All assigned accounts'}</option>
      {assignedAccounts.map(account=><option key={account.id} value={String(account.id)}>{account.name||account.id}</option>)}
     </select>
    </label>
    <input className="one-control" type="search" aria-label={props.searchLabel||'Search conversations'}
     value={search} placeholder={props.searchPlaceholder||'Search conversations'} onChange={event=>setSearch(event.target.value)}/>
    <nav className="one-row" aria-label={props.filterLabel||'Conversation filters'}>
     {['all','unread','mine'].map(value=><button className="one-btn one-btn--ghost" type="button" key={value}
      aria-pressed={filter===value} onClick={()=>setFilter(value)}>{props[value+'FilterLabel']||value}</button>)}
    </nav>
   </header>
   {props.accessError&&<p role="alert">{props.accessError}</p>}
   <div className="one-conversation-scroll">{filtered.map(item=><button className="one-conversation-row" type="button"
    key={item.id} aria-pressed={String(item.id)===selectedId}
    onClick={()=>{setSelectedId(String(item.id));setNewConversation(false);setError('');setNotice('');setAssigneeId('');}}>
    <span className="one-conversation-avatar" aria-hidden="true">{String(title(item)).slice(0,1).toUpperCase()}</span>
    <span className="one-conversation-copy"><strong>{title(item)}</strong><small>{item.preview||item.phoneNumber||''}</small>
     {item.channelAccountId&&<small>{accounts.find(account=>String(account.id)===String(item.channelAccountId))?.name||item.channelAccountId}</small>}</span>
    {Number(item.unreadCount)>0&&<span className="one-badge">{item.unreadCount}</span>}
   </button>)}
   {!filtered.length&&<p className="one-empty" role="status">{allowed.length?props.emptyConversationsText||'No conversations match these filters.':props.noAccessText||'No conversation access is assigned.'}</p>}</div>
  </aside>
  <section className="one-surface one-conversation-thread">
   {!selected&&newConversation&&props.enableNewConversation===true?
    <form className="one-stack one-conversation-new" onSubmit={send}>
     <header className="one-conversation-header"><button className="one-btn one-btn--ghost one-conversation-back" type="button"
      onClick={()=>setNewConversation(false)}>{props.backLabel||'Back to conversations'}</button>
      <h3 className="one-heading">{props.newConversationLabel||'New conversation'}</h3></header>
     <label className="one-label">{props.accountLabel||'Account'}
      <select className="one-control" value={selectedAccount} onChange={event=>setSelectedAccount(event.target.value)}>
       {assignedAccounts.filter(account=>account.canSend!==false).map(account=><option key={account.id} value={String(account.id)}>{account.name||account.id}</option>)}
      </select>
     </label>
     <label className="one-label">{props.contactSearchLabel||'Find contact'}
      <input className="one-control" type="search" value={contactSearch} onChange={event=>setContactSearch(event.target.value)}/>
     </label>
     {contactSearch&&contactMatches.map(contact=><button className="one-btn one-btn--ghost" type="button" key={contact.id}
      onClick={()=>{setRecipient(contact.phone||'');setContactSearch(contact.name||contact.phone||'');}}>{contact.name||contact.phone}</button>)}
     <label className="one-label">{props.recipientLabel||'Recipient'}
      <input className="one-control" type="tel" required value={recipient} onChange={event=>setRecipient(event.target.value)}/>
     </label>
     <label className="one-label">{props.messageLabel||'Message'}
      <textarea className="one-control" required maxLength={Number(props.messageMaxLength)||4096} value={draft}
       onChange={event=>setDraft(event.target.value)}/>
     </label>
     <button className="one-btn one-btn--primary" type="submit" disabled={busy||!canSend||!draft.trim()}>{props.sendLabel||'Send'}</button>
    </form>
    :selected?<div className="one-conversation-active">
     <header className="one-conversation-header"><button className="one-btn one-btn--ghost one-conversation-back" type="button"
      onClick={()=>setSelectedId('')}>{props.backLabel||'Back to conversations'}</button><div><h3 className="one-heading">{title(selected)}</h3>
      <span className="one-muted">{selected.phoneNumber||''}</span></div>
      {selected.canAssign===true&&props.enableAssignment===true&&<div className="one-row">
       <select className="one-control" aria-label={props.assignLabel||'Assign conversation'} value={assigneeId} disabled={busy}
        onChange={event=>setAssigneeId(event.target.value)}><option value="">{props.chooseAssigneeLabel||'Choose assignee'}</option>
        {eligible.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
       <button className="one-btn" type="button" disabled={busy||!assigneeId}
        onClick={()=>void act('assign',{conversationId:selected.id,channelAccountId:selected.channelAccountId,assigneeId})}>
        {props.assignLabel||'Assign'}
       </button>
      </div>}
     </header>
     <div className="one-conversation-messages" role="log" aria-label={props.messagesLabel||'Messages'} aria-live="polite">
      {thread.map(message=><article className={'one-message'+(message.direction==='outbound'||message.direction==='Outgoing'?' one-message--me':'')}
       key={message.id}>{message.mediaUrl&&<a href={message.mediaUrl} target="_blank" rel="noopener noreferrer">{message.mediaName||props.attachmentLabel||'Attachment'}</a>}
       {message.body&&<div>{message.body}</div>}<small>{message.sentAt||''} {message.status||''}</small></article>)}
      {!thread.length&&<p className="one-empty">{props.emptyMessagesText||'No messages yet.'}</p>}
     </div>
     <form className="one-row one-conversation-compose" onSubmit={send}>
      <input className="one-control" aria-label={props.messageLabel||'Message'} value={draft} disabled={busy}
       maxLength={Number(props.messageMaxLength)||4096} placeholder={props.placeholder||'Write a message…'}
       onChange={event=>setDraft(event.target.value)}/>
      <button className="one-btn one-btn--primary" type="submit" disabled={busy||!canSend||!draft.trim()}>{props.sendLabel||'Send'}</button>
     </form>
     {!canSend&&<p className="one-muted" role="status">{props.noSendPermissionText||'You do not have permission to send from this account.'}</p>}
    </div>:<div className="one-empty">{props.emptyTitle||'Select a conversation'}</div>}
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
 </section>;
}

function ConversationThread({props,rows}) {
 const [message,setMessage]=React.useState('');
 return <section className="one-surface"><div aria-live="polite" style={{minHeight:120,maxHeight:380,overflowY:'auto'}}>
  {rows.map((row,index)=><div className={'one-message'+(row.mine||row.outbound?' one-message--me':'')} key={row.Id??row.id??index}>
   <div className="one-muted">{String(row.sender??row.author??'')}</div>{String(row.body??row.text??row.message??'')}
  </div>)}{!rows.length&&<div className="one-empty">No messages</div>}
 </div><form className="one-row" onSubmit={event=>{event.preventDefault();if(!message.trim())return;
  void sendAction(props,'send',{body:message.trim()}).then(()=>setMessage(''));}}>
  <input className="one-control" style={{flex:1}} aria-label={props.messageLabel||'Message'} placeholder={props.placeholder||'Write a message…'}
   value={message} onChange={event=>setMessage(event.target.value)}/>
  <button className="one-btn one-btn--primary" type="submit" disabled={!message.trim()}>{props.sendLabel||'Send'}</button>
 </form></section>;
}

export default function OneConversation(props) {
 const rows=Array.isArray(props.records)?props.records:[];
 if(props.viewMode==='inbox')return <div className="one-ui one-conversation-root"><ConversationInbox props={props}/></div>;
 return <div className="one-ui one-conversation-root"><ConversationThread props={props} rows={rows}/></div>;
}
