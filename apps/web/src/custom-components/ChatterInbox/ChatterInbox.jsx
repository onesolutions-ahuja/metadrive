/* Presentation-only Metadrive Chatter. Data, permissions, visibility and actions are metadata/Flow-owned. */
export default function ChatterInbox(props) {
  const p = props || {};
  const [selectedId, select] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [tab, setTab] = React.useState('all');
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const conversations = Array.isArray(p.conversations) ? p.conversations : [];
  const messages = Array.isArray(p.messages) ? p.messages : [];
  const accounts = Array.isArray(p.channelAccounts) ? p.channelAccounts : [];
  const scoped = conversations.filter(c => {
    if (!p.canViewAll && p.restrictToAssigned && c.assignedUserId !== p.currentUserId) return false;
    if (p.allowedAccountIds && Array.isArray(p.allowedAccountIds) && !p.allowedAccountIds.includes(c.channelAccountId)) return false;
    return true;
  });
  const filtered = scoped.filter(c =>
    (tab === 'all' || (tab === 'unread' && Number(c.unreadCount) > 0) ||
      (tab === 'mine' && c.assignedUserId === p.currentUserId)) &&
    [c.contactName, c.phoneNumber, c.preview].join(' ').toLowerCase().includes(search.toLowerCase()));
  const selected = scoped.find(c => String(c.id) === String(selectedId)) || null;
  const thread = selected ? messages.filter(m => String(m.conversationId) === String(selected.id))
    .sort((a,b) => String(a.sentAt || '').localeCompare(String(b.sentAt || ''))) : [];
  const accountName = id => accounts.find(a => String(a.id) === String(id))?.name || '';
  const send = async event => {
    event.preventDefault();
    if (!selected || !draft.trim() || busy || p.canSend !== true) return;
    if (typeof p.onAction !== 'function') { setError('Configure the Send Flow action in Page Builder.'); return; }
    setBusy(true); setError('');
    try {
      const result = await p.onAction({ event: 'send', value: {
        conversationId: selected.id, channelAccountId: selected.channelAccountId,
        recipientPhone: selected.phoneNumber, body: draft.trim() } });
      if (result && result.error) throw Error(String(result.error));
      if (result !== null && result !== false) setDraft('');
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
      <label className="md-chatter-search"><span aria-hidden="true">⌕</span><input aria-label="Search chats" value={search} onChange={e=>setSearch(e.target.value)} placeholder={p.searchPlaceholder || 'Search name or number'} /></label>
      <nav aria-label="Chat filters">{[['all','All'],['unread','Unread'],['mine','Assigned to me']].map(([id,label]) =>
        <button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav></header>
      <div className="md-chatter-scroll">{filtered.map(c => <button key={c.id} type="button"
        className={'md-chatter-contact ' + (selected?.id===c.id ? 'active' : '')} onClick={()=>select(c.id)}>
        <span className="md-chatter-avatar" aria-hidden="true">{String(c.contactName || c.phoneNumber || '?').slice(0,1).toUpperCase()}</span>
        <span className="md-chatter-contact-copy"><strong>{c.contactName || c.phoneNumber}</strong>
          <small>{c.preview || c.phoneNumber}</small>
          <small className="md-chatter-channel">{accountName(c.channelAccountId)}</small></span>
        <span className="md-chatter-contact-side"><small>{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</small>
        {Number(c.unreadCount)>0 && <b>{c.unreadCount}</b>}</span></button>)}
      {!filtered.length && <p className="md-chatter-empty">No conversations match your filters.</p>}</div>
    </aside>
    <div className="md-chatter-thread">
      {selected ? <><header className="md-chatter-thread-head">
        <button type="button" className="md-chatter-back" aria-label="Back to chats" onClick={()=>select(null)}>‹</button>
        <span className="md-chatter-avatar" aria-hidden="true">{String(selected.contactName || '?').slice(0,1).toUpperCase()}</span>
        <div><strong>{selected.contactName || selected.phoneNumber}</strong><small>{selected.phoneNumber} · {accountName(selected.channelAccountId)}</small></div>
        {p.enableAssignment === true && p.canAssign === true && <button type="button" className="md-chatter-assignment" disabled={busy}
          onClick={()=>action('assign',{conversationId:selected.id,channelAccountId:selected.channelAccountId})}>Assign</button>}
      </header><div className="md-chatter-messages" role="log" aria-label="Conversation messages">
        {thread.map(m => <div key={m.id} className={'md-chatter-bubble ' + (m.direction === 'outbound' || m.direction === 'Outgoing' ? 'outbound':'inbound')}>
          {m.mediaUrl && (m.mediaType === 'image' ? <img src={m.mediaUrl} alt={m.mediaName || 'Chat image'} loading="lazy"/> :
             <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">{m.mediaName || 'Attachment'}</a>)}
          {m.body && <span>{m.body}</span>}
          <small>{m.sentAt ? new Date(m.sentAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''} {m.status || ''}</small>
        </div>)}</div>
        {error && <p role="alert" className="md-chatter-error">{error}</p>}
        <form onSubmit={send} className="md-chatter-compose"><input aria-label="Message" value={draft} onChange={e=>setDraft(e.target.value)}
          disabled={busy || p.canSend !== true} maxLength={4096} placeholder={p.messagePlaceholder || 'Type a message'} />
          <button type="submit" disabled={!draft.trim() || busy || p.canSend !== true}>Send</button></form>
        {p.composerHelpText && <p className="md-chatter-help">{p.composerHelpText}</p>}
      </> : <div className="md-chatter-welcome"><strong>{p.emptyTitle || 'Select a conversation'}</strong><p>Choose a customer to see their messages.</p></div>}
    </div>
  </section>;
}
