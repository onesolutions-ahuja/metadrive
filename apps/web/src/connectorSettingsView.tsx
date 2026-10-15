import { MetadataComponentProperties } from './componentPropertiesView';
import { createPageRuntimeViews } from './pageRuntimeViews';
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


export function ConnectorSettingsWorkspace({
  provider,
  providers,
  integrationConnections,
  onSelect,
  onSaveProvider,
  onSaveIntegrationConnection,
  onTestIntegrationConnection,
  onNotify,
  canManage
}: {
  provider: ConnectorProviderMetadata;
  providers: ConnectorProviderMetadata[];
  integrationConnections: IntegrationConnectionMetadata[];
  onSelect: (connectorKey: string) => void;
  onSaveProvider: (provider: ConnectorProviderMetadata) => Promise<ConnectorProviderMetadata>;
  onSaveIntegrationConnection: (connection: Omit<Pick<IntegrationConnectionMetadata, 'id' | 'connectorKey' | 'name' | 'configuration' | 'status'>, 'id'> & { id?: string; credentials: Record<string, string> }) => Promise<IntegrationConnectionMetadata>;
  onTestIntegrationConnection: (id: string) => Promise<IntegrationConnectionMetadata>;
  onNotify: (message: string) => void;
  canManage: boolean;
}) {
  const providerConnections = integrationConnections.filter((item) => item.connectorKey === provider.connectorKey);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [editingConnection, setEditingConnection] = useState(false);
  const [connectionName, setConnectionName] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<IntegrationConnectionMetadata['status']>('ACTIVE');
  const [connectionConfiguration, setConnectionConfiguration] = useState<Record<string, string>>({});
  const [connectionCredentials, setConnectionCredentials] = useState<Record<string, string>>({});
  const [savingConnection, setSavingConnection] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestError, setConnectionTestError] = useState('');
  const [editingProvider, setEditingProvider] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [providerAuthType, setProviderAuthType] = useState<ConnectorProviderMetadata['authType']>('NONE');
  const [providerBaseUrl, setProviderBaseUrl] = useState('');
  const [providerAuthHeader, setProviderAuthHeader] = useState('');
  const [providerAuthCredential, setProviderAuthCredential] = useState('');
  const [providerCredentialsSchema, setProviderCredentialsSchema] = useState('[]');
  const [providerOperations, setProviderOperations] = useState('{}');
  const [providerTest, setProviderTest] = useState('');
  const [providerTimeout, setProviderTimeout] = useState('30000');
  const [providerRetries, setProviderRetries] = useState('1');
  const [providerStatus, setProviderStatus] = useState<ConnectorProviderMetadata['status']>('ACTIVE');

  useEffect(() => {
    const existing = providerConnections[0];
    setSelectedConnectionId(existing?.id ?? '');
    setConnectionName(existing?.name ?? `${provider.name} connection`);
    setConnectionStatus(existing?.status ?? 'ACTIVE');
    setConnectionConfiguration(existing?.configuration ?? {});
    setConnectionCredentials({});
    setEditingConnection(false);
  }, [provider.connectorKey]);

  useEffect(() => {
    setProviderName(provider.name);
    setProviderAuthType(provider.authType);
    setProviderBaseUrl(provider.baseUrl);
    setProviderAuthHeader(provider.authHeader ?? '');
    setProviderAuthCredential(provider.authCredential ?? '');
    setProviderCredentialsSchema(JSON.stringify(provider.credentialsSchema, null, 2));
    setProviderOperations(JSON.stringify(provider.operations, null, 2));
    setProviderTest(provider.test ? JSON.stringify(provider.test, null, 2) : '');
    setProviderTimeout(String(provider.timeoutMs));
    setProviderRetries(String(provider.retryPolicy.maxAttempts));
    setProviderStatus(provider.status);
    setEditingProvider(false);
  }, [provider]);

  const saveProvider = async () => {
    if (!canManage) return;
    setSavingProvider(true);
    try {
      const saved = await onSaveProvider({
        connectorKey: provider.connectorKey,
        name: providerName,
        authType: providerAuthType,
        baseUrl: providerBaseUrl,
        ...(providerAuthHeader ? { authHeader: providerAuthHeader } : {}),
        ...(providerAuthCredential ? { authCredential: providerAuthCredential } : {}),
        credentialsSchema: JSON.parse(providerCredentialsSchema) as ConnectorProviderMetadata['credentialsSchema'],
        operations: JSON.parse(providerOperations) as ConnectorProviderMetadata['operations'],
        ...(providerTest.trim() ? { test: JSON.parse(providerTest) as NonNullable<ConnectorProviderMetadata['test']> } : {}),
        timeoutMs: Number(providerTimeout),
        retryPolicy: { maxAttempts: Number(providerRetries) },
        status: providerStatus
      });
      setEditingProvider(false);
      onNotify(`${saved.name} provider definition saved`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to save connector provider definition');
    } finally {
      setSavingProvider(false);
    }
  };

  const selectConnection = (id: string) => {
    const selected = providerConnections.find((item) => item.id === id);
    setSelectedConnectionId(id);
    setEditingConnection(false);
    setConnectionName(selected?.name ?? `${provider.name} connection`);
    setConnectionStatus(selected?.status ?? 'ACTIVE');
    setConnectionConfiguration(selected?.configuration ?? {});
    setConnectionCredentials({});
    setConnectionTestError('');
  };
  const saveConnection = async () => {
    if (!canManage || !editingConnection) return;
    setSavingConnection(true);
    try {
      const saved = await onSaveIntegrationConnection({
        ...(selectedConnectionId ? { id: selectedConnectionId } : {}),
        connectorKey: provider.connectorKey,
        name: connectionName,
        configuration: connectionConfiguration,
        credentials: connectionCredentials,
        status: connectionStatus
      });
      setSelectedConnectionId(saved.id);
      setEditingConnection(false);
      setConnectionName(saved.name);
      setConnectionConfiguration(saved.configuration);
      setConnectionStatus(saved.status);
      setConnectionCredentials({});
      setConnectionTestError('');
      onNotify(`${saved.name} connection saved`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to save Integration Connection');
    } finally {
      setSavingConnection(false);
    }
  };
  const selectedConnection = providerConnections.find((item) => item.id === selectedConnectionId);
  const connectionIsDirty = !selectedConnection
    || selectedConnection.name !== connectionName
    || selectedConnection.status !== connectionStatus
    || JSON.stringify(selectedConnection.configuration) !== JSON.stringify(connectionConfiguration)
    || Object.values(connectionCredentials).some((value) => value.trim().length > 0);
  const testStatusLabel = connectionTestError
    ? 'Failed'
    : !provider.test ? 'Test unavailable' : selectedConnection?.testStatus ?? 'Not tested';
  const testStatusClass = testStatusLabel === 'Connected' ? 'connected'
    : testStatusLabel === 'Failed' || testStatusLabel === 'Not configured' ? 'failed' : '';
  const testConnection = async () => {
    if (!selectedConnectionId || connectionIsDirty || editingProvider || editingConnection) return;
    setTestingConnection(true);
    setConnectionTestError('');
    try {
      await onTestIntegrationConnection(selectedConnectionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      setConnectionTestError(message);
      onNotify(message);
    } finally {
      setTestingConnection(false);
    }
  };

  return <div className="connector-settings-page">
    <div className="page-heading">
      <div><div className="eyebrow">SETUP / UNE CONNECTORS / CONNECTOR PROVIDERS</div><h1>Une Connectors</h1><p>Provider definitions and tenant connections from connector metadata.</p></div>
    </div>
    <div className="connector-settings-layout">
      <nav className="connector-record-nav surface" aria-label="Connectors">
        <div className="connector-record-nav-title">Connectors</div>
        {providers.map((item) => <button
          key={item.connectorKey}
          className={item.connectorKey === provider.connectorKey ? 'connector-record-nav-item selected' : 'connector-record-nav-item'}
          onClick={() => onSelect(item.connectorKey)}
        ><Puzzle size={15} /><span>{item.name}</span><ChevronRight size={14} /></button>)}
      </nav>
      <section className="connector-record-content">
        <header className="connector-record-heading surface">
          <div className="connector-record-icon"><Puzzle size={21} /></div>
          <div><div className="eyebrow">CONNECTOR PROVIDER · {provider.connectorKey}</div><h2>{provider.name}</h2><p>Provider definition metadata and configured tenant connections.</p></div>
        </header>
        <>
          <div className="connector-record-card surface">
            <div className="connector-card-heading"><div><h3>Provider Definition</h3><p>Metadata used by flows to build requests for this provider.</p></div>
              {editingProvider
                ? <div className="connector-connection-actions"><button className="btn btn-small" onClick={() => setEditingProvider(false)}>Cancel</button><button className="btn btn-brand btn-small" onClick={() => void saveProvider()} disabled={savingProvider}><Save size={13} />{savingProvider ? 'Saving…' : 'Save Provider'}</button></div>
                : canManage ? <button className="btn btn-small" onClick={() => setEditingProvider(true)}><Pencil size={13} />Edit Definition</button> : null}
            </div>
            {editingProvider ? <div className="connector-definition-form">
              <label className="form-label">Connector Key<input className="form-control" value={provider.connectorKey} readOnly /></label>
              <label className="form-label">Name<input className="form-control" value={providerName} onChange={(event) => setProviderName(event.target.value)} /></label>
              <label className="form-label">Authentication Type<select className="form-control" value={providerAuthType} onChange={(event) => setProviderAuthType(event.target.value as ConnectorProviderMetadata['authType'])}>{['NONE', 'BEARER', 'BASIC', 'API_KEY'].map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="form-label">Base URL<input className="form-control" type="url" value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} /></label>
              {providerAuthType === 'API_KEY' && <label className="form-label">API Key Header<input className="form-control" value={providerAuthHeader} onChange={(event) => setProviderAuthHeader(event.target.value)} /></label>}
              {['BEARER', 'API_KEY'].includes(providerAuthType) && <label className="form-label">Authentication Credential Field (optional when only one required secret)<input className="form-control" value={providerAuthCredential} onChange={(event) => setProviderAuthCredential(event.target.value)} /></label>}
              <label className="form-label">Credentials Schema (JSON)<textarea className="form-control" rows={6} value={providerCredentialsSchema} onChange={(event) => setProviderCredentialsSchema(event.target.value)} /></label>
              <label className="form-label">Operations (JSON)<textarea className="form-control" rows={6} value={providerOperations} onChange={(event) => setProviderOperations(event.target.value)} /></label>
              <label className="form-label">Safe Test Configuration (JSON, GET/HEAD only)<textarea className="form-control" rows={4} placeholder={'{"method":"GET","path":"/status","expectedStatus":200}'} value={providerTest} onChange={(event) => setProviderTest(event.target.value)} /></label>
              <div className="connector-definition-row">
                <label className="form-label">Timeout (ms)<input className="form-control" type="number" min={1000} max={120000} value={providerTimeout} onChange={(event) => setProviderTimeout(event.target.value)} /></label>
                <label className="form-label">Max Attempts<input className="form-control" type="number" min={1} max={5} value={providerRetries} onChange={(event) => setProviderRetries(event.target.value)} /></label>
                <label className="form-label">Status<select className="form-control" value={providerStatus} onChange={(event) => setProviderStatus(event.target.value as ConnectorProviderMetadata['status'])}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
              </div>
            </div> : <div className="connector-field-list">
              <div className="connector-config-field"><div className="connector-config-label"><span>Connector Key</span></div><code>{provider.connectorKey}</code></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Authentication</span></div><div className="connector-config-value">{provider.authType}</div></div>
              {provider.authCredential && <div className="connector-config-field"><div className="connector-config-label"><span>Authentication Credential</span></div><div className="connector-config-value">{provider.authCredential}</div></div>}
              <div className="connector-config-field"><div className="connector-config-label"><span>Base URL</span></div><div className="connector-config-value">{provider.baseUrl}</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Timeout</span></div><div className="connector-config-value">{provider.timeoutMs} ms</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Retry Policy</span></div><div className="connector-config-value">{provider.retryPolicy.maxAttempts} attempts</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Operations</span></div><div className="connector-config-value">{Object.entries(provider.operations).map(([name, operation]) => `${name} (${operation.method} ${operation.path})`).join(', ') || 'No operations defined'}</div></div>
              <div className="connector-config-field"><div className="connector-config-label"><span>Connection Test</span></div><div className="connector-config-value">{provider.test ? `${provider.test.method} ${provider.test.path} → HTTP ${provider.test.expectedStatus}` : 'Test unavailable (no safe endpoint configured)'}</div></div>
              <p className="connector-security-note">Provider definitions are also listed as records under Connector Providers; API secrets belong to Integration Connections.</p>
            </div>}
          </div>
          <div className="connector-record-card surface">
            <div className="connector-card-heading"><div><h3>Integration Connection</h3><p>Tenant-owned connection values and encrypted credentials used by flows.</p></div>
              <div className="connector-connection-actions">
                <select className="form-control" aria-label="Select Integration Connection" value={selectedConnectionId} onChange={(event) => selectConnection(event.target.value)}>
                  <option value="">No connection selected</option>
                  {providerConnections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                {canManage && <button className="btn btn-small" onClick={() => { selectConnection(''); setEditingConnection(true); }}><Plus size={13} />New</button>}
              </div>
            </div>
            {editingConnection && canManage
              ? <div className="connector-field-list settings-edit-row">
                  <label className="form-label">Connection Name
                    <input className="form-control" value={connectionName}
                      onChange={(event) => setConnectionName(event.target.value)} />
                  </label>
                  <label className="form-label">Status
                    <select className="form-control" value={connectionStatus}
                      onChange={(event) => setConnectionStatus(event.target.value as IntegrationConnectionMetadata['status'])}>
                      <option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option>
                    </select>
                  </label>
                  {provider.credentialsSchema.map((field) => <label className="form-label" key={field.name}>
                    {field.label}{field.required ? ' *' : ''}
                    <input className="form-control" type={field.secret ? 'password' : 'text'}
                      autoComplete="new-password"
                      value={field.secret ? (connectionCredentials[field.name] ?? '') : (connectionConfiguration[field.name] ?? '')}
                      placeholder={field.secret && selectedConnection?.credentialFields.some((entry) => entry.name === field.name && entry.configured)
                        ? 'Saved encrypted value; leave blank to keep' : ''}
                      onChange={(event) => field.secret
                        ? setConnectionCredentials((current) => ({ ...current, [field.name]: event.target.value }))
                        : setConnectionConfiguration((current) => ({ ...current, [field.name]: event.target.value }))} />
                  </label>)}
                </div>
              : <div className="settings-read-first-section">
                  <SettingsViewRow label="Connection name" value={selectedConnection?.name ?? 'No connection configured'}
                    canEdit={canManage && Boolean(selectedConnection)} onEdit={() => setEditingConnection(true)} />
                  <SettingsViewRow label="Status" value={selectedConnection?.status ?? 'Not configured'}
                    canEdit={canManage && Boolean(selectedConnection)} onEdit={() => setEditingConnection(true)} />
                  {provider.credentialsSchema.map((field) => (
                    <SettingsViewRow key={field.name} label={field.label}
                      value={field.secret
                        ? (selectedConnection?.credentialFields.some((item) => item.name === field.name && item.configured) ? '••••••••' : 'Not configured')
                        : (selectedConnection?.configuration[field.name] ?? 'Not configured')}
                      canEdit={canManage && Boolean(selectedConnection)} onEdit={() => setEditingConnection(true)} />
                  ))}
                </div>}
            <div className="connector-save-footer">
              <div className="connector-test-state" aria-live="polite">
                <span className={`connector-test-result ${testStatusClass}`}>{testStatusLabel}</span>
                {connectionTestError
                  ? <span>{connectionTestError}</span>
                  : (provider.test || selectedConnection?.testStatus === 'Test unavailable')
                    && selectedConnection?.lastTestMessage && <span>{selectedConnection.lastTestMessage}</span>}
                {selectedConnection?.lastTestedAt && <time dateTime={selectedConnection.lastTestedAt}>Last tested {new Date(selectedConnection.lastTestedAt).toLocaleString()}</time>}
                {editingConnection && connectionIsDirty && <span>Save connection changes before testing.</span>}
                <p className="connector-security-note">Credentials are encrypted at rest and are never returned to the browser. Leave a saved secret blank to keep it unchanged.</p>
              </div>
              <div className="connector-connection-actions">
                <button className="btn" onClick={() => void testConnection()} disabled={!selectedConnectionId || connectionIsDirty || editingConnection || savingConnection || testingConnection || editingProvider}>
                  {testingConnection ? 'Testing…' : 'Test Connection'}
                </button>
                {editingConnection && canManage && <>
                  <button type="button" className="btn" disabled={savingConnection}
                    onClick={() => selectConnection(selectedConnectionId)}>Cancel</button>
                  <button className="btn btn-brand" onClick={() => void saveConnection()} disabled={savingConnection || !connectionName.trim()}>
                    <Save size={14} />{savingConnection ? 'Saving…' : 'Save changes'}
                  </button>
                </>}
              </div>
            </div>
          </div>
        </>
      </section>
    </div>
  </div>;
}

