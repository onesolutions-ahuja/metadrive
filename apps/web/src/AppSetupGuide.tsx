import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink } from 'lucide-react';
import { assessApplicationSetup, type SetupDestination } from './appSetupReadiness';
import type {
  DashboardMetadata, FlowDefinitionMetadata, LibraryComponentMetadata,
  LightningAppMetadata, LightningPageMetadata, ObjectMetadata, ReportMetadata
} from './metadata';
import './AppSetupGuide.css';

type Props = {
  app: LightningAppMetadata;
  apps: LightningAppMetadata[];
  objects: ObjectMetadata[];
  pages: LightningPageMetadata[];
  flows?: FlowDefinitionMetadata[];
  libraryComponents?: LibraryComponentMetadata[];
  reports?: ReportMetadata[];
  dashboards?: DashboardMetadata[];
  creating?: boolean;
  onOpenWorkspace?: (destination: SetupDestination) => void;
};

export default function AppSetupGuide(props: Props) {
  const checks = useMemo(() => assessApplicationSetup({
    app: props.app, apps: props.creating ? props.apps : props.apps.filter(item => item.apiName !== props.app.apiName),
    objects: props.objects, pages: props.pages,
    flows: props.flows, libraryComponents: props.libraryComponents,
    reports: props.reports, dashboards: props.dashboards
  }), [props.app, props.apps, props.creating, props.objects, props.pages,
    props.flows, props.libraryComponents, props.reports, props.dashboards]);
  const configured = checks.filter(item => item.level === 'configured').length;
  const actions = checks.filter(item => item.level === 'action').length;
  const review = checks.filter(item => item.level === 'review').length;
  return <section className="app-setup-guide" aria-label="Application setup review">
    <div className="app-setup-guide-heading">
      <div>
        <h2>Application setup review</h2>
        <p>Build with shared Objects, Pages, Components and Flows. Configuration checks are not runtime tests.</p>
      </div>
      <div className="app-setup-guide-counts" aria-label="Configuration check totals">
        <span>{configured} configured</span>
        <span>{actions} need action</span>
        <span>{review} need verification</span>
      </div>
    </div>
    <ol className="app-setup-guide-list">
      {checks.map((check, index) => <li key={check.id} className={'app-setup-guide-item app-setup-guide-' + check.level}>
        <div className="app-setup-guide-icon" aria-hidden="true">
          {check.level === 'configured' ? <CheckCircle2 size={17}/> :
            check.level === 'action' ? <AlertTriangle size={17}/> : <CircleHelp size={17}/>}
        </div>
        <div className="app-setup-guide-content">
          <div className="app-setup-guide-item-heading">
            <strong>{index + 1}. {check.title}</strong>
            <span>{check.level === 'configured' ? 'Configured' : check.level === 'action' ? 'Action needed' : 'Not verified'}</span>
          </div>
          <p>{check.detail}</p>
          {check.findings.length > 0 && <ul>{check.findings.map((finding, position) =>
            <li key={position}>{finding}</li>)}</ul>}
        </div>
        {check.destination && props.onOpenWorkspace &&
          <button type="button" className="btn btn-small" onClick={() => props.onOpenWorkspace?.(check.destination!)}>
            Open <ExternalLink size={13} aria-hidden="true"/>
          </button>}
      </li>)}
    </ol>
    <p className="app-setup-guide-note">Launching or installing an app does not validate payments, legal checks, stock, permissions, or cross-device operation. Verify those independently in the runtime before use.</p>
  </section>;
}
