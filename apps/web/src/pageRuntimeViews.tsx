import SharedMetadataBoundPageComponent from './MetadataBoundPageComponent';
import { presentPageRecords, type ChannelGrant } from './recordPresentationAdapters';
import TemplatePageRuntimeLayout from './TemplatePageRuntimeLayout';
import { loadFlowScreenRecords } from './authClient';
import { createSetupApp } from './setupAppShell';
import { createRecordWorkspaceViews } from './recordWorkspaceViews';
import { createPageBuilder } from './pageBuilderView';
import { ReportBuilder } from './reportBuilderView';
import { createPermissions } from './permissionsView';
import { createObjectManager } from './objectManagerView';
import { createSetupHome } from './setupHomeView';
import { createSettingsViews } from './settingsWorkspaceViews';
import { pageLayoutForRecord, compactLayoutForRecord, matchesLookupFilterGroup, relatedLookupFilterOperators, type RecordData } from './recordMetadataUtils';
import { formatRecordValue, parseCsvImport } from './recordCsvUtils';
import { initialScreenValues, screenFieldIsVisible } from './flowScreenRuntimeUtils';
import { objectSettings, parseAppRoute, appRoutePath, type AppRoute } from './appRouting';
import { NavigationLoadTime, resolveCurrentAppNavigation } from './appNavigationView';
import { isStandalonePagePresentation, pageCanvasPresentationStyle } from './pageRuntimePresentation';
import { insertFlowElementAtPath } from './flowInsertElement.mjs';
import AdvancedSharingSettings from './AdvancedSharingSettings';
import {resolveSetupNavigation} from './platformSetupNavigation';
import {readVerifiedMetadata,saveVerifiedMetadata,type MetadataPublicationResponse} from './verifiedMetadataCache';
import { queueOfflineRecord, listOfflineRecords, markOfflineRecord, removeOfflineRecord,
  synchronizeOfflineRecords, type OfflineQueueOwner, type OfflineRecordItem, type OfflineRecordWrite } from './offlineRecordQueue';
import SchemaBuilder from './SchemaBuilder';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  ClipboardPaste,
  Command,
  Copy,
  Database,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  FileText,
  Filter,
  GripVertical,
  Grid2X2,
  ListFilter,
  Maximize2,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Puzzle,
  Smartphone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Star,
  Undo2,
  Redo2,
  Trash2,
  Tablet,
  UsersRound,
  X,
  Workflow,
  Wifi,
  WifiOff,
  PanelLeft,
  PanelRight
} from 'lucide-react';
import FlowBuilderWorkspace from './FlowBuilder';
import FlowScreenContent from './FlowScreenContent';
import FlowLogs from './FlowLogs';
import FlowInterviews from './FlowInterviews';
import ScheduledFlows from './ScheduledFlows';
import DashboardBuilder from './DashboardBuilder';
import ComponentLibrary from './ComponentLibrary';
import RegisteredComponent from './RegisteredComponent';
import CustomComponentPropertyEditor from './CustomComponentPropertyEditor';
import FlowInputBindingEditor from './FlowInputBindingEditor';
import RecordFilterEditor from './RecordFilterEditor';
import ComponentVisibilityEditor from './ComponentVisibilityEditor';
import PageRouteDirectory from './PageRouteDirectory';
import { isComponentVisible } from './componentVisibility';
import PageComponentVisualEditor from './PageComponentVisualEditor';
import { canNestComponent, componentVisualStyle, directChildren, isLayoutType, isDescendantOf, layoutTypes } from './pageComponentLayout';
import PageComponentStyleEditor from './PageComponentStyleEditor';
import { isCanvasLocked, wrapCanvasComponent, ungroupCanvasComponent } from './canvasInteractions';
import { filterPageComponentRecords, needsMetadataComponentRuntime } from './pageComponentBindings';
import { childrenOf, canNest, componentLayoutProps, hasPageComponentAppearance, isLayoutContainer, rawLayoutParentId, reparentComponent, resolvePageComponentStyle, type LayoutDevice } from './pageComponentLayout';
import AppExchange from './AppExchange';
import AppManager from './AppManager';
import PlatformWorkspaceSurface from './PlatformWorkspaceSurface';
import { GlobalRecordSearch, RecordObjectPicker, useDismissOnOutside } from './TopbarRecords';
import { pageIsAvailableInApp, resolvePageActionRoute } from './pageActionRouting';
import NamedCredentials from './NamedCredentials';
import TenantManagement from './TenantManagement';
import TenantDomains from './TenantDomains';
import TenantRecoveryPanel from './TenantRecoveryPanel';
import TenantUsagePanel from './TenantUsagePanel';
import DeveloperAccountSettings from './DeveloperAccountSettings';
import SettingsViewRow from './SettingsViewRow';
import ApprovalProcessManager from './ApprovalProcessManager';
import { standardPageComponents } from './componentCatalog';
import EmbeddedDashboard from './EmbeddedDashboard';
import { inspectPageDependencies } from './pageDependencies';
import {
  canvasDimensionsForOrientation,
  canvasBoundPosition,
  canvasOrientation,
  canvasScaleToFitWidth,
  canvasUnitsFromScreenDelta
} from './pageCanvas';
import {
  createComponentPreviewProps,
  getPageBuilderComponentCategories,
  pageBuilderPaletteCategories
} from './pageBuilderPalette';
import {
  defaultFlow,
  defaultLightningPage,
  defaultAccessControl,
  objectMetadata,
  setupShortcuts,
  workspaces,
  type ObjectMetadata,
  type FieldMetadata,
  type FieldSetMetadata,
  type PageLayoutMetadata,
  type PageLayoutCustomLinkMetadata,
  type CompactLayoutMetadata,
  type RecordTypeMetadata,
  type RelatedLookupFilterMetadata,
  type ObjectActionMetadata,
  type ObjectSettingsMetadata,
  type ProfileMetadata,
  type PageActivationAssignmentMetadata,
  type FlowDefinitionMetadata,
  type FlowExecutionLogMetadata,
  type FlowInterviewMetadata,
  type FlowElementMetadata,
  type FlowResourceMetadata,
  type FlowValidationMetadata,
  type PlatformEventMetadata,
  type LightningPageTemplate,
  type NamedCredentialMetadata,
  type EmailAlertMetadata,
  type CustomNotificationMetadata,
  type ApprovalRequestMetadata,
  type ApprovalProcessMetadata,
  type ApprovalProcessInput,
  type ConnectorProviderMetadata,
  type IntegrationConnectionMetadata,
  type LightningPageMetadata,
  type PageComponentMetadata,
  type LibraryComponentMetadata,
  type DashboardFilterMetadata,
  type DashboardMetadata,
  type DashboardFolderMetadata,
  type DashboardFolderInput,
  type DashboardTerritoryMetadata,
  type DashboardSubscription,
  type DashboardSubscriptionInput,
  type DashboardSnapshot,
  type ReportMetadata,
  type ReportBucketMetadata,
  type ReportFolderMetadata,
  type ReportFolderInput,
  type ReportRunMetadata,
  type ReportStandardFiltersMetadata,
  type ReportFilterMetadata,
  type ReportDateRange,
  type ReportDateGrouping,
  type ReportSummaryOperation,
  type ReportCrossFilterMetadata,
  type AccessControlMetadata,
  type CurrencySettingsMetadata,
  type LightningAppMetadata,
  type PermissionSetMetadata,
  type PermissionSetGroupMetadata,
  type PublicGroupMetadata,
  type QueueMetadata,
  type SharingRuleMetadata,
  type UserMetadata,
  type WorkspaceId
} from './metadata';


export function createPageRuntimeViews(apiRequest: <T>(path:string, init?:RequestInit) => Promise<T>) {
function RuntimeReportChart({ report, objects }: { report: ReportMetadata | undefined; objects: ObjectMetadata[] }) {
  const [run, setRun] = useState<ReportRunMetadata | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!report) {
      setRun(null);
      setError('');
      return;
    }
    let active = true;
    setRun(null);
    setError('');
    void apiRequest<ReportRunMetadata>(`/reports/${encodeURIComponent(report.apiName)}/run`, {
      method: 'POST',
      body: JSON.stringify({ offset: 0, limit: 500 })
    }).then((result) => {
      if (active) setRun(result);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to run the selected report');
    });
    return () => { active = false; };
  }, [report?.apiName]);
  if (!report) return <div className="records-empty">Choose a saved report in the page component properties.</div>;
  if (error) return <div className="records-message" role="alert">{error}</div>;
  if (!run) return <div className="records-loading">Running {report.label}…</div>;
  const object = objects.find((item) => item.apiName === report.objectApiName);
  const groupedApiName = report.groupByFieldApiNames[0]
    ?? report.fieldApiNames.find((name) => !/^(Number|Currency|Percent)(\(|$)/.test(object?.fields.find((field) => field.apiName === name)?.dataType ?? ''));
  const measureApiName = report.fieldApiNames.find((name) =>
    /^(Number|Currency|Percent)(\(|$)/.test(object?.fields.find((field) => field.apiName === name)?.dataType ?? ''));
  const grouped = new Map<string, number>();
  for (const row of run.rows) {
    const label = groupedApiName ? String(row[groupedApiName] ?? 'No value') : `Row ${grouped.size + 1}`;
    const value = measureApiName ? Number(row[measureApiName]) : 1;
    grouped.set(label, (grouped.get(label) ?? 0) + (Number.isFinite(value) ? value : 0));
  }
  const bars = [...grouped.entries()].slice(0, 12);
  const maximum = Math.max(1, ...bars.map(([, value]) => Math.abs(value)));
  return <div className="runtime-report-chart">
    <div className="runtime-report-chart-heading"><strong>{report.label}</strong><span>{run.totalRows} report row{run.totalRows === 1 ? '' : 's'}</span></div>
    {bars.length === 0 ? <div className="records-empty">The selected report returned no rows.</div>
      : <div className="runtime-report-chart-bars" role="img" aria-label={`${report.label} report chart`}>
        {bars.map(([label, value]) => <div className="runtime-report-chart-bar" key={label} title={`${label}: ${value}`}>
          <span className="runtime-report-chart-value">{new Intl.NumberFormat().format(value)}</span>
          <span className="runtime-report-chart-track"><i style={{ height: `${Math.max(3, Math.abs(value) / maximum * 100)}%` }} /></span>
          <span className="runtime-report-chart-label">{label}</span>
        </div>)}
      </div>}
    {run.truncated && <small className="runtime-report-chart-note">Chart uses the first {run.pageSize} report rows.</small>}
  </div>;
}

const MetadataBoundPageComponent = (props: Omit<React.ComponentProps<typeof SharedMetadataBoundPageComponent>,'apiRequest'>) =>
 <SharedMetadataBoundPageComponent {...props} apiRequest={apiRequest}/>;

function usePageLayoutDevice(): LayoutDevice {
  const currentDevice = (): LayoutDevice => window.innerWidth <= 640 ? 'Phone' : window.innerWidth <= 1024 ? 'Tablet' : 'Desktop';
  const [layoutDevice, setLayoutDevice] = useState<LayoutDevice>(currentDevice);
  useEffect(() => {
    const onResize = () => setLayoutDevice(currentDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layoutDevice;
}

function LightningAppRuntime({
  appId,
  pageApiName,
  objects,
  apps,
  pages,
  reports,
  libraryComponents,
  availableFlows,
  formFactor,
  onNavigate,
  onLaunchFlow,
  onStandaloneModeChange
}: {
  appId: string;
  pageApiName?: string;
  objects: ObjectMetadata[];
  apps: LightningAppMetadata[];
  pages: LightningPageMetadata[];
  reports: ReportMetadata[];
  libraryComponents: LibraryComponentMetadata[];
  availableFlows: Array<Pick<FlowDefinitionMetadata, 'apiName' | 'label' | 'flowType' | 'status'>>;
  formFactor: 'Desktop' | 'Phone';
  onNavigate: (route: AppRoute) => void;
  onLaunchFlow: (flowApiName: string, inputs?: Record<string, unknown>) => void;
  onStandaloneModeChange: (enabled: boolean) => void;
}) {
  const [page, setPage] = useState<LightningPageMetadata | null>(null);
  const layoutDevice = usePageLayoutDevice();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('');
  useEffect(() => {
    let active = true;
    setPage(null);
    setError('');
    setLoading(true);
    const endpoint = pageApiName
      ? `/apps/${encodeURIComponent(appId)}/pages/${encodeURIComponent(pageApiName)}?formFactor=${formFactor}`
      : `/apps/${encodeURIComponent(appId)}/home-page?formFactor=${formFactor}`;
    void apiRequest<{ page: LightningPageMetadata | null }>(endpoint).then((payload) => {
      if (active) setPage(payload.page);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load Lightning page');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [appId, pageApiName, formFactor]);
  useEffect(() => {
    setActiveTab('');
  }, [page?.apiName]);
  useEffect(() => {
    onStandaloneModeChange(isStandalonePagePresentation(page));
    return () => onStandaloneModeChange(false);
  }, [page?.layoutMode, onStandaloneModeChange]);
  if (error) return <div className="records-page"><div className="records-message" role="alert">{error}</div></div>;
  if (loading) return <div className="records-page"><div className="records-loading">Loading Lightning page…</div></div>;
  if (!page) return <main className="records-page"><section className="records-empty" aria-labelledby="records-home-empty-heading"><h1 id="records-home-empty-heading">Home Page not assigned</h1><p>No active Home Page is assigned to this app and profile.</p><p>An administrator can assign a Home Page in Lightning App Builder.</p></section></main>;
  const isStandaloneRuntime = isStandalonePagePresentation(page);
  const regions: Array<'header' | 'main' | 'sidebar'> = ['header', 'main', 'sidebar'];
  const appVisibilityContext = { formFactor } as const;
  const isAppComponentVisible = (component: PageComponentMetadata) =>
    isComponentVisible(component, appVisibilityContext, false);
  const renderComponent = (component: PageComponentMetadata): React.ReactNode => {
    if (!isAppComponentVisible(component)) return null;
    if (isLayoutType(component.type)) return <div key={component.id} className="page-nested-layout" style={resolvePageComponentStyle(component.properties, component.type, layoutDevice)}>{childrenOf(page.components, component.id).map((child) => renderComponent(child))}</div>;
    if (component.type.startsWith('Custom:')) {
      const definition = libraryComponents.find((item) =>
        item.apiName === component.type.slice('Custom:'.length) && item.surfaces.includes('page'));
      const nestedChildren = isLayoutContainer(component)
        ? childrenOf(page.components, component.id).filter(isAppComponentVisible).map((child) => page.layoutMode === 'free-canvas'
            ? renderCanvasComponent(child, true) : renderComponent(child))
        : undefined;
      if (!definition) return <div className="records-message" role="status" key={component.id}>
        Component is no longer registered: {component.label}
      </div>;
      const content = !isLayoutContainer(component) && needsMetadataComponentRuntime(component.properties)
        ? <MetadataBoundPageComponent definition={definition} component={component}
            objects={objects} apps={apps} pages={pages} currentAppId={appId} pageSessionKey={appId + ':' + page.apiName} reports={reports} availableFlows={availableFlows} formFactor={formFactor}
            onNavigate={onNavigate} onLaunchFlow={onLaunchFlow} />
        : <RegisteredComponent definition={definition} props={{
            ...component.properties, ...componentLayoutProps(component.properties, layoutDevice),
            label: component.label, properties: component.properties,
            device: layoutDevice, children: nestedChildren
          }} />;
      const rendered = nestedChildren?.length && definition.trustedBundled !== true
        ? <div className="metadata-nested-host" data-nested-host={component.id}>{content}{nestedChildren}</div>
        : content;
      return page.layoutMode === 'free-canvas' ? rendered
        : <div key={component.id} style={resolvePageComponentStyle(component.properties, component.type, layoutDevice)}>{rendered}</div>;
    }
    if (component.type === 'Dashboard') return <section className="record-fields-card surface" key={component.id}>
      <EmbeddedDashboard dashboardApiName={String(component.properties.dashboardApiName ?? '')}
        request={apiRequest} libraryComponents={libraryComponents} />
    </section>;
    if (component.type === 'Report Chart') {
      const reportApiName = typeof component.properties.reportApiName === 'string' ? component.properties.reportApiName : '';
      return <section className="record-fields-card surface" key={component.id}>
        <div className="record-fields-heading"><h2>{component.label}</h2></div>
        <RuntimeReportChart report={reports.find((report) => report.apiName === reportApiName)} objects={objects} />
      </section>;
    }
    if (component.type === 'Tabs') {
      const tabs = Array.isArray(component.properties.tabs)
        ? component.properties.tabs.filter((tab): tab is string => typeof tab === 'string')
        : [];
      const selected = tabs.includes(activeTab) ? activeTab : tabs[0];
      const content = page.components.find((item) =>
        item.id !== component.id && isAppComponentVisible(item) && item.label.toLocaleLowerCase() === selected?.toLocaleLowerCase());
      return <section className="record-fields-card surface" key={component.id}>
        <div className="record-tabs" role="tablist" aria-label={component.label}>
          {tabs.map((tab) => <button type="button" role="tab" aria-selected={selected === tab}
            className={selected === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </div>
        <div className="record-runtime-tab-panel" role="tabpanel">
          {content ? renderComponent(content) : <div className="records-empty">{selected ? `No page component is assigned to “${selected}”.` : 'Configure tabs in the page properties.'}</div>}
        </div>
      </section>;
    }
    if (component.type === 'Accordion') return <details className="record-fields-card surface app-page-accordion" key={component.id} open>
      <summary>{component.label}</summary>
      <p>{typeof component.properties.content === 'string' ? component.properties.content : 'Add content in the component properties.'}</p>
    </details>;
    return <div className="records-message" role="status" key={component.id}>{component.label} is not supported on app pages.</div>;
  };
  const renderCanvasComponent = (component: PageComponentMetadata, nested = false) => {
    if (!isAppComponentVisible(component)) return null;
    return <div key={component.id} className={nested ? 'free-canvas-runtime-component nested-page-runtime' : 'free-canvas-runtime-component'}
      data-layout-component-id={component.id}
      style={{
        ...(nested
          ? { position: 'relative', left: 'auto', top: 'auto', width: '100%', height: 'auto', minHeight: 40 }
          : {
              left: component.position?.x ?? 0,
              top: component.position?.y ?? 0,
              width: component.position?.width ?? 320,
              height: component.position?.height ?? 180
            }),
        ...resolvePageComponentStyle(component.properties, component.type, layoutDevice),
        ...(isStandaloneRuntime && component.properties?.standalonePresentation === true && !nested
          ? { left: 0, top: 0, width: '100%', height: '100%' } : {})
      } as React.CSSProperties}>
      {renderComponent(component)}
    </div>;
  };
  if (page.layoutMode === 'free-canvas') return <div className="free-canvas-runtime"
    data-lightning-page={page.apiName}
    data-layout-mode="free-canvas"
    style={pageCanvasPresentationStyle(page)}>
    {childrenOf(page.components, null).map((component) => renderCanvasComponent(component))}
  </div>;
  const renderRegion = (region: 'header' | 'main' | 'sidebar') =>
    childrenOf(page.components, null).filter((component) => isAppComponentVisible(component) && (component.region ?? 'main') === region).map(component => {
      const content = renderComponent(component);
      return content && !component.type.startsWith('Custom:') && !isLayoutType(component.type)
        && hasPageComponentAppearance(component.properties)
        ? <div key={component.id} style={resolvePageComponentStyle(component.properties, component.type, layoutDevice)}>{content}</div>
        : content;
    });
  return <TemplatePageRuntimeLayout apiName={page.apiName} label={page.label}
    pageType={page.pageType} template={page.template}
    fullscreen={isStandaloneRuntime && page.layoutMode === 'template'} phone={formFactor === 'Phone'} layoutVariant={page.components.find(component => component.properties?.standalonePresentation === true)?.properties?.presentationLayout as string | undefined}
    header={renderRegion('header')} main={renderRegion('main')} sidebar={renderRegion('sidebar')} />;
}


return { RuntimeReportChart, MetadataBoundPageComponent, usePageLayoutDevice, LightningAppRuntime };
}
