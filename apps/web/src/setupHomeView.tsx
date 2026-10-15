import type { ReactNode } from 'react';
import { RefreshCw, Settings2, ArrowRight, Database, ChevronRight, Workflow, ShieldCheck, ExternalLink, CircleHelp, Command } from 'lucide-react';
import { setupShortcuts, type WorkspaceId } from './metadata';
type HeadingProps = { eyebrow?: string; title: string; description?: string; actions?: ReactNode };
export function createSetupHome(Heading: (props: HeadingProps) => ReactNode) {
function SetupHome({ onNavigate }: { onNavigate: (workspace: WorkspaceId) => void }) {
  return (
    <div className="home-content">
      <Heading eyebrow="Setup" title="Setup Home" description="Configure and manage your organization." actions={<button className="btn"><RefreshCw size={14} />Refresh</button>} />
      <div className="welcome-banner">
        <div className="welcome-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sphere"><Settings2 size={27} /></div></div>
        <div className="welcome-copy"><div className="eyebrow">YOUR ORGANIZATION</div><h2>Welcome to Setup</h2><p>Find the tools you need to customize your org and support your users.</p><button className="text-action">Explore Setup <ArrowRight size={15} /></button></div>
        <div className="welcome-quick"><div className="quick-label">Recently viewed</div><button onClick={() => onNavigate('object-manager')}><Database size={15} />Object Manager<ChevronRight size={14} /></button><button onClick={() => onNavigate('flow-builder')}><Workflow size={15} />Flows<ChevronRight size={14} /></button><button onClick={() => onNavigate('rbac')}><ShieldCheck size={15} />Permission Sets<ChevronRight size={14} /></button></div>
      </div>
      <div className="home-section-title"><div><h2>Quick access</h2><p>Jump back into your most-used setup tools.</p></div><button className="text-action">View all <ArrowRight size={14} /></button></div>
      <div className="shortcut-grid">
        {setupShortcuts.map(({ title, description, workspace, icon: Icon }) => (
          <button key={title} className="shortcut-card" onClick={() => onNavigate(workspace)}>
            <span className="shortcut-icon"><Icon size={19} /></span><span className="shortcut-title">{title}</span><span className="shortcut-description">{description}</span><ArrowRight className="shortcut-arrow" size={15} />
          </button>
        ))}
      </div>
      <div className="home-lower-grid">
        <section className="surface recent-surface"><div className="section-heading"><h2>Recent setup changes</h2><button className="text-action">View audit trail</button></div><div className="recent-row"><span className="recent-icon purple"><Workflow size={16} /></span><div><strong>Renewal Risk Evaluation</strong><small>Flow · Activated by Alexandra Curtis</small></div><time>Today, 10:42 AM</time></div><div className="recent-row"><span className="recent-icon blue"><Database size={16} /></span><div><strong>Renewal custom object</strong><small>Object · Modified by David Kim</small></div><time>Yesterday</time></div><div className="recent-row"><span className="recent-icon green"><ShieldCheck size={16} /></span><div><strong>Sales Manager permissions</strong><small>Permission set · Modified by Alexandra Curtis</small></div><time>Oct 6</time></div></section>
        <section className="surface help-surface"><div className="section-heading"><h2>Resources</h2><ExternalLink size={15} /></div><button className="resource-row"><span><CircleHelp size={16} /></span><div><strong>Setup help</strong><small>Learn how to configure your org</small></div><ChevronRight size={15} /></button><button className="resource-row"><span><Command size={16} /></span><div><strong>Keyboard shortcuts</strong><small>Work faster in Setup</small></div><ChevronRight size={15} /></button></section>
      </div>
    </div>
  );
}


return SetupHome;
}
