import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw, Settings2, ArrowRight, Database, ChevronRight, Workflow, ShieldCheck, ExternalLink, CircleHelp, Command } from 'lucide-react';
import { setupShortcuts, type WorkspaceId } from '../../metadata/Definitions/metadata';
type HeadingProps = { eyebrow?: string; title: string; description?: string; actions?: ReactNode };
export function createSetupHome(Heading: (props: HeadingProps) => ReactNode) {
function SetupHome({ onNavigate, request }: { onNavigate: (workspace: WorkspaceId) => void; request: <T>(path:string)=>Promise<T> }) {
  type SecurityEvent = {id:string;at:string;action:string};
  const [events,setEvents] = useState<SecurityEvent[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const reload = useCallback(() => {
    let active = true;
    setLoading(true);setError('');
    void request<{events:SecurityEvent[]}>('/auth/security-events?limit=3')
      .then(result => {if(active)setEvents(result.events ?? []);})
      .catch(() => {if(active){setError('Security activity unavailable for this user.');setEvents([]);}})
      .finally(() => {if(active)setLoading(false);});
    return () => {active=false;};
  },[request]);
  useEffect(() => reload(), [reload]);
  return (
    <div className="home-content">
      <Heading eyebrow="Setup" title="Setup Home" description="Configure and manage your organization." actions={<button className="btn" onClick={reload} disabled={loading}><RefreshCw size={14} />Refresh</button>} />
      <div className="welcome-banner">
        <div className="welcome-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sphere"><Settings2 size={27} /></div></div>
        <div className="welcome-copy"><div className="eyebrow">YOUR ORGANIZATION</div><h2>Welcome to Setup</h2><p>Find the tools you need to customize your org and support your users.</p><button className="text-action" onClick={() => onNavigate('object-manager')}>Explore Setup <ArrowRight size={15} /></button></div>
        <div className="welcome-quick"><div className="quick-label">Common setup tools</div><button onClick={() => onNavigate('object-manager')}><Database size={15} />Object Manager<ChevronRight size={14} /></button><button onClick={() => onNavigate('flow-builder')}><Workflow size={15} />Flows<ChevronRight size={14} /></button><button onClick={() => onNavigate('rbac')}><ShieldCheck size={15} />Permission Sets<ChevronRight size={14} /></button></div>
      </div>
      <div className="home-section-title"><div><h2>Quick access</h2><p>Open setup tools for this organisation.</p></div></div>
      <div className="shortcut-grid">
        {setupShortcuts.map(({ title, description, workspace, icon: Icon }) => (
          <button key={title} className="shortcut-card" onClick={() => onNavigate(workspace)}>
            <span className="shortcut-icon"><Icon size={19} /></span><span className="shortcut-title">{title}</span><span className="shortcut-description">{description}</span><ArrowRight className="shortcut-arrow" size={15} />
          </button>
        ))}
      </div>
      <div className="home-lower-grid">
        <section className="surface recent-surface"><div className="section-heading"><h2>Recent security activity</h2></div>
          {loading ? <p role="status">Loading security activity…</p> : error ? <p role="status">{error}</p> : events.length === 0 ? <p>No security activity recorded.</p> :
            events.map(event => <div className="recent-row" key={event.id}><span className="recent-icon green"><ShieldCheck size={16} /></span><div><strong>{event.action}</strong><small>Tenant security event</small></div><time>{new Date(event.at).toLocaleString()}</time></div>)}
        </section>
        <section className="surface help-surface"><div className="section-heading"><h2>Resources</h2><ExternalLink size={15} /></div><button className="resource-row"><span><CircleHelp size={16} /></span><div><strong>Setup help</strong><small>Learn how to configure your org</small></div><ChevronRight size={15} /></button><button className="resource-row"><span><Command size={16} /></span><div><strong>Keyboard shortcuts</strong><small>Work faster in Setup</small></div><ChevronRight size={15} /></button></section>
      </div>
    </div>
  );
}


return SetupHome;
}
