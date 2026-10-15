/* Presentation-only Metadrive Chatter. Data, permissions, visibility and actions are metadata/Flow-owned. */
export default function ChatterInbox(props) {
  const p = props || {};
  const [selectedId, select] = React.useState(null);
  const [newChat, setNewChat] = React.useState(false);
  const [newRecipient, setNewRecipient] = React.useState('');
  const [sentNotice, setSentNotice] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [tab, setTab] = React.useState('all');
  const [selectedAccount, setSelectedAccount] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const conversations = Array.isArray(p.conversations) ? p.conversations : [];
  const messages = Array.isArray(p.messages) ? p.messages : [];
  const accounts = Array.isArray(p.channelAccounts) ? p.channelAccounts : [];
  const assignedAccounts = accounts.filter(a => Array.isArray(p.allowedAccountIds) && p.allowedAccountIds.includes(a.id));
  const scoped = conversations.filter(c => {
    if (selectedAccount && String(c.channelAccountId) !== selectedAccount) return false;
    if (!p.canViewAll && p.restrictToAssigned && c.assignedUserId && c.assignedUserId !== p.currentUserId) return false;
    if (p.allowedAccountIds && Array.isArray(p.allowedAccountIds) && !p.allowedAccountIds.includes(c.channelAccountId)) return false;
    return true;
  });
  const filtered = scoped.filter(c =>
    (tab === 'all' || (tab === 'unread' && Number(c.unreadCount) > 0) ||
      (tab === 'mine' && c.assignedUserId === p.currentUserId)) &&
    [c.contactName, c.phoneNumber, c.preview].join(' ').toLowerCase().includes(search.toLowerCase()));
  const selected = scoped.find(c => String(c.id) === String(selectedId)) || null;
  const selectableAgents = (Array.isArray(p.eligibleAssignees) ? p.eligibleAssignees : [])
    .filter(a => selected && a.channelAccountId === selected.channelAccountId);
  const canSendSelected = newChat ? assignedAccounts.some(a => String(a.id) === selectedAccount && a.canSend !== false) && !!selectedAccount : selected?.canSend === true && p.canSend === true;
  const canAssignSelected = selected?.canAssign === true && p.enableAssignment === true;
  const thread = selected ? messages.filter(m => String(m.conversationId) === String(selected.id))
    .sort((a,b) => String(a.sentAt || '').localeCompare(String(b.sentAt || ''))) : [];
  const accountName = id => accounts.find(a => String(a.id) === String(id))?.name || '';
  const send = async event => {
    event.preventDefault();
    if (!draft.trim() || busy || !canSendSelected) return;
    const recipient = newChat ? newRecipient.trim() : selected?.phoneNumber;
    const account = newChat ? selectedAccount : selected?.channelAccountId;
    if (!recipient || !account || (newChat && !/^\+?[1-9]\d{5,14}$/.test(recipient))) { setError('Enter an international phone number including country code.'); return; }
    if (typeof p.onAction !== 'function') { setError('Configure the Send Flow action in Page Builder.'); return; }
    setBusy(true); setError('');
    try {
      const result = await p.onAction({ event: 'send', value: {
        conversationId: newChat ? JSON.stringify([account, recipient]) : selected.id, channelAccountId: account,
        recipientPhone: recipient, body: draft.trim() } });
      if (result && result.error) throw Error(String(result.error));
      if (result !== null && result !== false) {setDraft('');setSentNotice('Send request submitted. Provider delivery status may update later.');}
    } catch (e) { setError(e instanceof Error ? e.message : 'Message was not sent'); }
    finally { setBusy(false); }
  };
  const action = async (event, value) => {
    if (typeof p.onAction !== 'function') { setError('Configure this action in Page Builder.'); return; }
    setBusy(true); setError('');
    try { await p.onAction({ event, value }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  };
  return <section className={'md-chatter ' + (selected ? 'md-chatter-open' : '')}
    style={{'--chatter-accent': p.accentColor || '#168657', '--chatter-background': p.backgroundColor || '#f7f8f7'}}>
    <aside className="md-chatter-list">
      <header><div className="md-chatter-heading"><h2>{p.title || 'Chatter'}</h2><span>{scoped.length} chats</span></div>
      <button type="button" className="md-chatter-new" disabled={!assignedAccounts.some(a=>a.canSend!==false)} onClick={()=>{setNewChat(true);select(null);setError('');setSentNotice('');setSelectedAccount(id=>id||String(assignedAccounts.find(a=>a.canSend!==false)?.id||''));}}>+ New Chat</button>
      <label className="md-chatter-account-picker">Account <select aria-label="WhatsApp account" value={selectedAccount} onChange={e=>{setSelectedAccount(e.target.value);select(null);setNewChat(false);setAssigneeId('');}} disabled={!assignedAccounts.length}>
        <option value="">All assigned accounts</option>
        {assignedAccounts.map(a=><option key={a.id} value={String(a.id)}>{a.name || a.id}</option>)}
      </select></label>
      <label className="md-chatter-search"><span aria-hidden="true">⌕</span><input aria-label="Search chats" value={search} onChange={e=>setSearch(e.target.value)} placeholder={p.searchPlaceholder || 'Search name or number'} /></label>
      <nav aria-label="Chat filters">{[['all','All'],['unread','Unread'],['mine','Assigned to me']].map(([id,label]) =>
        <button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav></header>
      <div className="md-chatter-scroll">{filtered.map(c => <button key={c.id} type="button"
        className={'md-chatter-contact ' + (selected?.id===c.id ? 'active' : '')} onClick={()=>{select(c.id);setNewChat(false);setSentNotice('');setAssigneeId('');}}>
        <span className="md-chatter-avatar" aria-hidden="true">{String(c.contactName || c.phoneNumber || '?').slice(0,1).toUpperCase()}</span>
        <span className="md-chatter-contact-copy"><strong>{c.contactName || c.phoneNumber}</strong>
          <small>{c.preview || c.phoneNumber}</small>
          <small className="md-chatter-channel">{accountName(c.channelAccountId)}</small></span>
        <span className="md-chatter-contact-side"><small>{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</small>
        {Number(c.unreadCount)>0 && <b>{c.unreadCount}</b>}</span></button>)}
      {!filtered.length && <p className="md-chatter-empty" role="status">{!Array.isArray(p.allowedAccountIds) || !p.allowedAccountIds.length
        ? 'No WhatsApp channel access is assigned to your user. Ask an authorized administrator to assign a channel grant in OneEngine.'
        : !conversations.length ? 'No readable WhatsApp conversations were found for your assigned channels.'
        : 'No conversations match your filters.'}</p>}</div>
    </aside>
    <div className="md-chatter-thread">
      {newChat ? <div className="md-chatter-new-thread"><header><button type="button" onClick={()=>setNewChat(false)}>‹ Back</button><strong>New WhatsApp chat</strong></header><form className="md-chatter-compose" onSubmit={send}><label>Sending account<select aria-label="Send from account" value={selectedAccount} onChange={e=>setSelectedAccount(e.target.value)}>{assignedAccounts.filter(a=>a.canSend!==false).map(a=><option key={a.id} value={String(a.id)}>{a.name||a.id}</option>)}</select></label><label>Customer phone number<input aria-label="Customer phone number" type="tel" value={newRecipient} onChange={e=>setNewRecipient(e.target.value)} placeholder="447700900123" required /></label><label>Message<textarea aria-label="New chat message" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={4096} required /></label><button type="submit" disabled={busy||!canSendSelected||!draft.trim()}>Send</button></form>{error&&<p role="alert">{error}</p>}{sentNotice&&<p role="status">{sentNotice}</p>}</div> : selected ? <><header className="md-chatter-thread-head">
        <button type="button" className="md-chatter-back" aria-label="Back to chats" onClick={()=>select(null)}>‹</button>
        <span className="md-chatter-avatar" aria-hidden="true">{String(selected.contactName || '?').slice(0,1).toUpperCase()}</span>
        <div><strong>{selected.contactName || selected.phoneNumber}</strong><small>{selected.phoneNumber} · {accountName(selected.channelAccountId)}</small></div>
        {canAssignSelected && <><select aria-label="Assign conversation to" className="md-chatter-assignment"
          value={assigneeId} onChange={e=>setAssigneeId(e.target.value)} disabled={busy}>
          <option value="">Select agent</option>
          {selectableAgents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select><button type="button" className="md-chatter-assignment" disabled={busy || !assigneeId}
          onClick={()=>action('assign',{conversationId:selected.id,channelAccountId:selected.channelAccountId,
            assigneeId})}>Assign</button></>}
      </header><div className="md-chatter-messages" role="log" aria-label="Conversation messages">
        {thread.map(m => <div key={m.id} className={'md-chatter-bubble ' + (m.direction === 'outbound' || m.direction === 'Outgoing' ? 'outbound':'inbound')}>
          {m.mediaUrl && (m.mediaType === 'image' ? <img src={m.mediaUrl} alt={m.mediaName || 'Chat image'} loading="lazy"/> :
             <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">{m.mediaName || 'Attachment'}</a>)}
          {m.body && <span>{m.body}</span>}
          <small>{m.sentAt ? new Date(m.sentAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''} {m.status || ''}</small>
        </div>)}</div>
        {error && <p role="alert" className="md-chatter-error">{error}</p>}
        <form onSubmit={send} className="md-chatter-compose"><input aria-label="Message" value={draft} onChange={e=>setDraft(e.target.value)}
          disabled={busy || !canSendSelected} maxLength={4096} placeholder={p.messagePlaceholder || 'Type a message'} />
          <button type="submit" disabled={!draft.trim() || busy || !canSendSelected}>Send</button></form>
        {p.composerHelpText && <p className="md-chatter-help">{p.composerHelpText}</p>}
      </> : <div className="md-chatter-welcome"><strong>{p.emptyTitle || 'Select a conversation'}</strong><p>Choose a customer to see their messages.</p></div>}
    </div>
  </section>;
}
