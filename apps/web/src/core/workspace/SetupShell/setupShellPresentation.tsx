// @ts-nocheck
import CompanySettingsWorkspace from '../../settings/CompanySettingsWorkspace/CompanySettingsWorkspace';
import MobileSettingsHome from '../../settings/MobileSettingsHome';
// Shared shell presentation, composed from registered metadata-driven runtime and tools.
import * as React from 'react';
import './InstalledAppMenu.css';
import { resolvePageToolbarActions } from '../../pages/PageRuntime/pageToolbarActions';
import { workspaces, type ObjectMetadata, type LightningPageMetadata, type LightningAppMetadata } from '../../metadata/Definitions/metadata';
import type { RecordData } from '../../records/RecordWorkspace/recordMetadataUtils';
export function renderSetupShell(ctx: any) {
  const { AppExchange, AppManager, ComponentLibrary, FieldWizardModal, FlowInterviews, FlowLogs, NamedCredentials, ScheduledFlows, SetupFlowDialogs, SetupObjectDialogs, AccountSessionSecurity, ApprovalProcessManager, AutomationSettingsWorkspace, Bell, Check, ChevronLeft, ChevronRight, CircleHelp, CompanySettings, ConnectionHealthIndicator, DashboardBuilder, Database, DeveloperAccountSettings, FlowBuilderWorkspace, GlobalRecordSearch, History, LightningAppRuntime, Monitor, NavigationLoadTime, ObjectManager, PageBuilder, Permissions, PlatformPageSlot, PlatformWorkspaceSurface, ProfilePasswordMenu, RecordObjectPicker, RecordWorkspace, ReportBuilder, Search, SetupHome, TenantDomains, TenantEmailRecoverySettings, TenantManagement, TenantMfaSettings, TenantRecoveryPanel, TenantSecurityAudit, TenantUsagePanel, TenantUserLockSettings, X, accessControl, accessControlError, accessControlLoaded, activationAppIds, activeUtility, addField, addFlowElement, advancedMetadataLoaded, apiRequest, appUtilityRef, approvalBusyId, approvalProcesses, approvalRequests, apps, setApps, setPages, authorizeNamedCredential, canCreateDashboards, canManageApprovalProcesses, canManageApps, canReadMetadata, canReadSecurity, canManageDashboardTerritories, canManageDashboards, canManageFlows, canManageLibrary, canManageNamedCredentials, canManagePlatformTenants, canManageReportFolders, canManageUserIdentities, canRunFlows, canScheduleDashboards, cancelFlowInterview, changePage, cloneFlow, commitFlow, connectorProviders, connectorRights, connectorRightsLoaded, connectorRightsError, createDashboardSnapshot, createFlow, createObject, currentApp, currentAppNavigation, currentFieldAccess, currentProfileId, currentRecordTypeAccess, customTabObject, customTabStyle, customTabStyles, dashboardFolders, dashboardRunningUserIds, dashboardTerritories, dashboardUserId, dashboards, deactivateFlow, decideApproval, defaultLightningPage, deleteApp, deleteApprovalProcess, deleteDashboard, deleteDashboardFolder, deleteDashboardSnapshot, deleteDashboardSubscription, deleteEmailAlert, deletePage, deleteField, deleteFlow, deleteLibraryComponent, deleteNamedCredential, deleteObject, deletePlatformEvent, deleteReport, emailAlerts, executeConnectorAppLifecycleFlow, exitDashboardViewer, exportFlow, fetchFlowListPage, filteredSetupGroups, flow, flowDefinitionsLoaded, flowDefinitionsError, reportsLoaded, reportsError, dashboardsLoaded, dashboardsError, flowDebug, flowHasUnsavedChanges, flowHistory, flowInterviews, flowInterviewsLoading, flowLogs, flowLogsLoading, flowRun, flowRunnerError, flowRunnerSubmitting, flowToolTab, flowValidation, flows, formulaEditorRef, goBackFlowScreen, grantConnectorLicence, importFlow, insertFormulaText, integrationConnections, isStandaloneMetadataPage, launchCustomTabWizard, libraryComponents, loadAppCommunicationHistory, loadConnectorMarketplaceApps, loadDashboardRecords, loadDashboardSnapshots, loadDashboardSubscriptions, loadFlowScreenRecords, loadNotifications, logout, markNotificationRead, metadataLoadError, metadataLoaded, namedCredentials, namedCredentialsLoaded, namedCredentialsError, namedCredentialsEncryptionReady, navigateRoute, navigateSetupItem, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, newObjectDescription, newObjectLabel, newObjectPluralLabel, newObjectRecordNameLabel, newObjectSettings, notificationRef, notifications, notificationsLoading, notificationsOpen, notificationsUnreadCount, notify, object, objectSearch, objectSetting, objects, onLogout, openDashboardViewer, openFlowDebug, openPageForObject, openSetupWorkspace, page, pageCreationAppContext, pageRouteApiName, pages, platformEvents, previewReport, protectedPageRuntime, publishLibraryComponent, quickFind, readableRecordObjects, recentRoutes, recordSearch, redoFlow, refreshFlowInterviews, refreshObject, relatedLookupFilterOperators, removeFlowElement, reportFolders, reports, resetNewFieldDraft, restoreFlowVersion, rollbackLibraryComponent, rotateNamedCredential, route, routeAliasError, routeTiming, runDashboardSubscription, runFlow, runFlowDebug, runReport, runSavedFlowTests, runtimeFormFactor, saveAccessControl, saveApp, saveApprovalProcess, saveConnectorProvider, saveCustomTab, saveDashboard, saveDashboardFolder, saveDashboardSubscription, saveDashboardTerritories, saveEmailAlert, saveField, saveFlow, saveIntegrationConnection, saveLibraryComponent, saveNamedCredential, saveObject, savePage, savePageFromBuilder, savePlatformEvent, saveReport, saveReportFolder, selectDashboard, selectFlow, selectedFlowId, setActiveUtility, setCustomTabObject, setCustomTabStyle, setFlowDebug, setFlowRun, setFlowRunnerError, setFlowToolTab, setLaunchCustomTabWizard, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setNewObjectDescription, setNewObjectLabel, setNewObjectPluralLabel, setNewObjectRecordNameLabel, setNewObjectSettings, setObjectSearch, setPage, setPageCreationAppContext, setQuickFind, setRecordSearch, setSelectedFlowId, setSetupSidebarCollapsed, setShowNewField, setShowNewObject, setShowCustomTabWizard, setStandalonePageMode, setupSidebarCollapsed, showCustomTabWizard, showNewField, showNewObject, standalonePageMode, submitFlowScreen, testIntegrationConnection, testNamedCredential, toast, setToast, toggleNamedCredentialEnabled, toggleNotifications, undoFlow, uneSolutionsLogoUrl, updateFlowConfig, updateFlowLabel, validateFlow, validateNewFieldFormula, workspace } = ctx;
  const activeAppPage = route.kind === 'app-page'
    ? pages.find((candidate: LightningPageMetadata) => candidate.apiName === route.pageApiName && candidate.status === 'Active')
    : null;
  const pageToolbarActions = resolvePageToolbarActions(activeAppPage, libraryComponents);
  const activeAppPages = route.kind === 'app-page' || route.kind === 'app-home'
    ? currentAppNavigation.filter((entry: any) => entry.type === 'App Page')
        .map((entry: any) => pages.find((page: LightningPageMetadata) =>
          page.apiName === entry.apiName && page.pageType === 'App Page' && page.status === 'Active'))
        .filter(Boolean)
    : [];
  return (
    <div className={standalonePageMode || isStandaloneMetadataPage ? 'lightning standalone-page-mode' : route.kind === 'setup' && route.workspace === 'page-builder' && Boolean(route.resourceApiName) ? 'lightning page-builder-editing' : 'lightning'}>
      <header className="salesforce-header">
        <button type="button" className="brand brand-home-button" aria-label="Go to home" title="Home" onClick={() => openSetupWorkspace('home')}><img className="brand-logo" src={uneSolutionsLogoUrl} alt="UNE Solutions" /></button>
        <label className="header-installed-apps">
          <span>Apps</span>
          <select aria-label="Open installed app" value="" onChange={(event) => {
            if (event.target.value === '__home__') { openSetupWorkspace('home'); return; }
            if (event.target.value === '__records__') {
              const targetObject = route.kind === 'record-list' || route.kind === 'record-detail'
                ? route.objectApiName : readableRecordObjects[0]?.apiName;
              if (targetObject) navigateRoute({kind:'record-list',objectApiName:targetObject,appId:'Records'});
              return;
            }
            const app=apps.find((item)=>item.apiName===event.target.value);
            if(!app)return;
            const firstPage=app.navigationOrder.find(item=>item.type==='App Page' &&
              app.navigationPageApiNames.includes(item.apiName) &&
              pages.some(page=>page.apiName===item.apiName && page.pageType==='App Page' && page.status==='Active'));
            navigateRoute(firstPage ? {kind:'app-page',appId:app.apiName,pageApiName:firstPage.apiName}
              : {kind:'app-home',appId:app.apiName});
          }}>
            <option value="">Open app…</option>
            <option value="__home__">Home</option>
            {readableRecordObjects.length > 0 && <option value="__records__">Records</option>}
            {apps.filter((app) => app.apiName !== 'Records').map(app=><option key={app.apiName} value={app.apiName}>{app.label}</option>)}
          </select>
        </label>
        <div className="header-searches">
          <GlobalRecordSearch objects={readableRecordObjects}
            searchObject={(apiName, term) => apiRequest<{ records: RecordData[] }>(
              `/records/${encodeURIComponent(apiName)}?${new URLSearchParams({ search: term, limit: '5', offset: '0' })}`)}
            onSelect={(objectApiName, recordId) => navigateRoute({
              kind: 'record-detail', objectApiName, recordId, appId: currentApp?.apiName ?? 'Records'
            })} />

        </div>
        {(activeAppPages.length > 0 || activeAppPage) && <div className="header-page-context" aria-label="Current app pages"
          data-page-session-key={activeAppPage ? route.appId + ':' + route.pageApiName : undefined}>
          <nav className="header-page-tabs" aria-label="Workspace navigation">
            {activeAppPages.map((appPage: LightningPageMetadata) =>
              <button type="button" key={appPage.apiName}
                className={route.kind === 'app-page' && route.pageApiName === appPage.apiName ? 'header-page-tab active' : 'header-page-tab'}
                aria-current={route.kind === 'app-page' && route.pageApiName === appPage.apiName ? 'page' : undefined}
                onClick={() => navigateRoute({kind:'app-page',appId:currentApp?.apiName ?? '',pageApiName:appPage.apiName})}>{appPage.label}</button>)}
            {!activeAppPages.length && activeAppPage && <span className="header-page-title">{activeAppPage.label}</span>}
          </nav>
          {pageToolbarActions.map(action =>
            <button key={action.componentId} type="button" className="btn header-page-action"
              onClick={() => window.dispatchEvent(new CustomEvent('metadrive:page-toolbar-action', {
                detail: {pageSessionKey: route.appId + ':' + route.pageApiName, componentId: action.componentId, action: action.event}
              }))}>{action.label}</button>)}
        </div>}
        <div className="header-tools" ref={appUtilityRef}>
          <button type="button" className="icon-button header-history-button" title="History" aria-label="History" aria-expanded={activeUtility === 'History'}
            onClick={() => setActiveUtility((current) => current === 'History' ? null : 'History')}><History size={17} /></button>
          {activeUtility === 'History' && <section className="app-utility-popover" aria-label="History utility">
            <div className="app-utility-heading"><strong>History</strong><button className="icon-button" aria-label="Close History" onClick={() => setActiveUtility(null)}><X size={14} /></button></div>
            <div className="app-utility-history">{recentRoutes.length
              ? recentRoutes.map((item) => <button key={item.key} onClick={() => { navigateRoute(item.route); setActiveUtility(null); }}>{item.label}</button>)
              : <p>No recent items.</p>}</div>
          </section>}
          <NavigationLoadTime routeKey={routeTiming.routeKey} startedAt={routeTiming.startedAt}
            ready={metadataLoaded && (route.kind !== 'setup' || route.workspace === 'home' || advancedMetadataLoaded) && (route.kind !== 'setup' || route.workspace !== 'rbac' || accessControlLoaded || Boolean(accessControlError))}
            kind={routeTiming.kind} authMs={routeTiming.authMs} />
          <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
          
          <ConnectionHealthIndicator />
          <ProfilePasswordMenu onLogout={logout} onPasswordChanged={onLogout} />
        </div>
      </header>

      <main className={route.kind === 'setup' ? 'setup-layout setup-no-tabs' : 'setup-layout'}>
        {route.kind === 'setup' && runtimeFormFactor !== 'Phone' && !route.dashboardView && workspace !== 'flow-builder' && !(workspace === 'page-builder' && Boolean(route.resourceApiName)) && (
          <aside className={setupSidebarCollapsed ? 'setup-sidebar setup-sidebar-collapsed' : 'setup-sidebar'}>
            <div className="setup-sidebar-toolbar">
              <strong>Setup</strong>
              <button type="button" className="setup-sidebar-toggle" aria-label={setupSidebarCollapsed ? 'Expand Setup menu' : 'Collapse Setup menu'} aria-expanded={!setupSidebarCollapsed} onClick={() => setSetupSidebarCollapsed((collapsed) => !collapsed)}>
                {setupSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>
            <div className="quick-find">
              <div className="quick-find-title">Quick Find</div>
              <div className="quick-find-input">
                <Search size={14} />
                <input value={quickFind} onChange={(event) => setQuickFind(event.target.value)} placeholder="Quick Find" aria-label="Quick Find" />
                {quickFind && <button onClick={() => setQuickFind('')} aria-label="Clear search"><X size={13} /></button>}
              </div>
            </div>
            <div className="setup-tree">
              {filteredSetupGroups.map((group) => (
                <div className="setup-tree-group" key={group.group}>
                  <div className="tree-group-label">{group.group}</div>
                  {group.items.map((item) => (
                    <React.Fragment key={item}>
                      <button
                        className={((workspace === 'object-manager' && item === 'Object Manager')
                          || (workspace === 'page-builder' && item === 'Page Builder')
                          || (workspace === 'app-manager' && item === 'App Manager')
                          || (workspace === 'app-exchange' && item === 'AppExchange')
                          || (workspace === 'tenant-management' && item === 'Tenant Management')
                          || (workspace === 'named-credentials' && item === 'Named Credentials')
                                                    || (workspace === 'flow-interviews' && item === 'Paused and Waiting Interviews')
                          || (workspace === 'scheduled-flows' && item === 'Scheduled Flows')
                          || (workspace === 'flow-logs' && item === 'Flow History')) ? 'tree-item selected' : 'tree-item'}
                        aria-label={item === "Tenant Management" && !canManagePlatformTenants ? "Open My Tenant Management" : `Open ${item}`}
                        title={item}
                        data-short-label={item.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')}
                        onClick={() => navigateSetupItem(item)}
                      >
                        <span>{item === 'Tenant Management' && !canManagePlatformTenants ? 'My Tenant Management' : item}</span>
                        <ChevronRight size={13} />
                      </button>

                    </React.Fragment>
                  ))}
                </div>
              ))}
              {filteredSetupGroups.length === 0 && <div className="empty-tree">No setup items found</div>}
            </div>
            <div className="sidebar-footer"><span className="online-dot" /> Setup menu</div>
          </aside>
        )}

        <section className={`workspace ${route.kind !== 'setup' ? 'workspace-records' : ''} ${workspace === 'flow-builder' ? 'workspace-flow' : ''}`}>
          {route.kind === 'setup' && runtimeFormFactor === 'Phone' && workspace !== 'home' && !route.dashboardView &&
            <nav className="mobile-settings-back-bar" aria-label="Settings navigation">
              <button type="button" onClick={() => openSetupWorkspace('home')}><ChevronLeft size={20} aria-hidden="true" />Settings</button>
              <strong>{workspaces.find(item => item.id === workspace)?.label ?? 'Settings'}</strong>
            </nav>}
          {(route.kind === 'record-list' || route.kind === 'record-detail') && <RecordWorkspace route={route} objects={objects} apps={apps} pages={pages}
            availableFlows={flows.filter(item => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ id, apiName, label, flowType, status }) => ({ id, apiName, label, flowType, status }))}
            onLaunchFlow={(apiName: string, inputs?: Record<string, unknown>,context?:{requestId?:string}) => void runFlow(apiName, inputs,context)}
            reports={reports} metadataLoaded={metadataLoaded} profileId={currentProfileId} canManageUserIdentities={canManageUserIdentities} userRoles={accessControl.roles}
            fieldAccess={currentFieldAccess} recordTypeAccess={currentRecordTypeAccess} libraryComponents={libraryComponents} headerSearch={recordSearch} onSearchChange={setRecordSearch}
            navigableObjects={readableRecordObjects} onNavigate={navigateRoute} />}
          {route.kind === 'route-alias' && <section className="setup-card" role="status">
            {routeAliasError ? <p role="alert">{routeAliasError}</p> : <p>Resolving route alias…</p>}
          </section>}
          {route.kind === 'app-home' && <LightningAppRuntime appId={route.appId} objects={objects} apps={apps} pages={pages} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ id, apiName, label, flowType, status }) => ({ id, apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName: string, inputs: Record<string, unknown>,context?:{requestId?:string}) => void runFlow(apiName, inputs,context)} onStandaloneModeChange={setStandalonePageMode} />}
          {route.kind === 'app-page' && <LightningAppRuntime appId={route.appId} pageApiName={route.pageApiName} objects={objects} apps={apps} pages={pages} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ id, apiName, label, flowType, status }) => ({ id, apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName: string, inputs: Record<string, unknown>,context?:{requestId?:string}) => void runFlow(apiName, inputs,context)} onStandaloneModeChange={setStandalonePageMode} />}
          {route.kind === 'setup' && workspace === 'home' && (runtimeFormFactor === 'Phone'
            ? <MobileSettingsHome
                request={apiRequest}
                loading={!metadataLoaded}
                onOpen={navigateSetupItem}
                rights={{
                  viewMetadata:canReadMetadata, editMetadata:canManageApps,
                  viewSecurity:canReadSecurity, manageSecurity:canManageUserIdentities,
                  manageFlows:canManageFlows, manageTenants:canManagePlatformTenants,
                  namedDevices:readableRecordObjects.some(item=>item.apiName==='NamedDevice__c')
                }} />
            : <SetupHome onNavigate={openSetupWorkspace} request={apiRequest} />
          )}
          {route.kind === 'setup' && workspace === 'object-manager' && (
            !advancedMetadataLoaded ? <section className="setup-card" role="status">Loading live object definitions…</section> :
            metadataLoadError && objects.length === 0 ? <section className="setup-card" role="alert">Unable to load object definitions: {metadataLoadError}</section> :
            objects.length === 0 || !objects.some((item: ObjectMetadata) => item.apiName === object.apiName) ?
              <section className="setup-card" aria-label="Object Manager" style={{padding:24}}>
                <h2>{objects.length === 0 ? 'No objects yet' : 'Object not found'}</h2>
                <p>{objects.length === 0
                  ? 'This installation has no Object definitions. Create your first Object in Object Manager.'
                  : 'The requested Object is not installed in this workspace.'}</p>
                <div className="toolbar-actions">
                  {objects.length > 0 && <button className="btn" type="button" onClick={() => navigateRoute({
                    kind:'setup',workspace:'object-manager',objectApiName:objects[0].apiName,setting:'Fields & Relationships'
                  })}>Open available Object</button>}
                  {canManageApps && <button type="button" className="btn btn-brand" onClick={() => setShowNewObject(true)}>Create Object</button>}
                </div>
              </section> :
              (
            <PlatformWorkspaceSurface workspace="object-manager" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} >
            <ObjectManager
              object={object}
              objects={objects}
              flows={flows}
              pages={pages}
              reports={reports}
              dashboards={dashboards}
              profiles={accessControlError ? [] : accessControl.profiles}
              activationAppIds={activationAppIds}
              selectedSetting={objectSetting}
              search={objectSearch}
              onSearch={setObjectSearch}
              onObjectSelect={(nextObject: ObjectMetadata) => navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: nextObject.apiName, setting: 'Fields & Relationships' })}
              onSettingSelect={(setting: string) => navigateRoute({ kind: 'setup', workspace: 'object-manager', objectApiName: object.apiName, setting: setting === 'Objects' ? 'Details' : setting })}
              onOpenDependency={(target: { setting?: string; objectApiName?: string; workspace?: 'flow-builder' | 'page-builder' | 'report-builder' | 'dashboard-builder'; resourceApiName?: string }) => {
                if (target.workspace === 'page-builder' && target.resourceApiName) {
                  const selectedPage = pages.find((candidate) => candidate.apiName === target.resourceApiName);
                  if (selectedPage) setPage(selectedPage);
                }
                navigateRoute(target.workspace
                  ? { kind: 'setup', workspace: target.workspace, resourceApiName: target.resourceApiName }
                  : { kind: 'setup', workspace: 'object-manager', objectApiName: target.objectApiName ?? object.apiName, setting: target.setting ?? 'Fields & Relationships' });
              }}
              onNewField={() => { resetNewFieldDraft(); setNewFieldLayoutIds(object.pageLayouts?.map((layout) => layout.id) ?? []); setShowNewField(true); }}
              onCreateObject={() => setShowNewObject(true)}
              onSaveObject={saveObject}
              onRefreshObject={refreshObject}
              onDeleteObject={deleteObject}
              onSaveField={saveField}
              onDeleteField={deleteField}
              onSavePage={savePage}
              onOpenPageBuilder={() => openPageForObject(object.apiName)}
              onOpenRecords={() => navigateRoute({ kind: 'record-list', objectApiName: object.apiName })}
              page={pages.find((item) => item.targetObject === object.apiName && item.pageType === 'Record Page') ?? null}
              onNotify={notify}
            />
            </PlatformWorkspaceSurface>
              )
          )}
          {route.kind === 'setup' && workspace === 'page-builder' && !advancedMetadataLoaded && <section className="setup-card" role="status">Loading live page definitions…</section>}
          {route.kind === 'setup' && workspace === 'page-builder' && advancedMetadataLoaded && route.resourceApiName && !pages.some((item) => item.apiName === route.resourceApiName) && (
            <section className="setup-card" role="alert" style={{ padding: 24 }}>
              <h2>{metadataLoadError ? "Unable to load Lightning pages" : "Lightning page not found"}</h2>
              <p>{metadataLoadError ? `Metadata API error: ${metadataLoadError}` : `The page "${route.resourceApiName}" was not returned by the metadata API. No other page has been substituted.`}</p>
              <p>Check that the page exists in this tenant and that your account can access it.</p>
              <button className="btn" onClick={() => navigateRoute({ kind: 'setup', workspace: 'page-builder' })}>Open saved pages</button>
            </section>
          )}
          {route.kind === 'setup' && workspace === 'page-builder' && advancedMetadataLoaded && (!route.resourceApiName || (advancedMetadataLoaded && pages.some((item) => item.apiName === route.resourceApiName))) && <PageBuilder key={route.resourceApiName ?? 'page-list'} editorMode={Boolean(route.resourceApiName)} onBackToPages={() => { setPage(pages.find(item => item.apiName === page.apiName) ?? page); navigateRoute({ kind: 'setup', workspace: 'page-builder' }); }} page={page} pages={pages}
            preparedAppId={pageCreationAppContext[page.apiName] ?? ''}
            dashboards={dashboards}
            onPrepareApp={(pageApiName: string, appId: string) => setPageCreationAppContext(current => ({
              ...current, [pageApiName]: appId
            }))}
            onAppLinked={(pageApiName: string) => setPageCreationAppContext(current => {
              const next = { ...current };
              delete next[pageApiName];
              return next;
            })} objects={objects} apps={apps} profiles={accessControl.profiles} reports={reports} libraryComponents={libraryComponents} flows={flows} onChange={changePage} onSelectPage={(apiName: string) => { const selected = pages.find((item) => item.apiName === apiName); if (selected) { setPage(selected); navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: selected.apiName }); } }} onTargetObjectChange={openPageForObject} onLaunchFlow={(apiName: string, inputs: Record<string, unknown>,context?:{requestId?:string}) => void runFlow(apiName, inputs,context)} onSave={savePageFromBuilder} onSaveApp={saveApp} onDeleteApp={deleteApp} onDeletePage={deletePage} request={apiRequest} canManageRoutes={canManageApps} onExit={() => { setPage(pages.find((item) => item.apiName === route.resourceApiName) ?? pages[0] ?? defaultLightningPage); pageRouteApiName.current = ''; navigateRoute({ kind: 'setup', workspace: 'home' }); }} onNotify={notify} />}
          {route.kind === 'setup' && workspace === 'app-manager' && !advancedMetadataLoaded && <section className="setup-card" role="status">Loading live applications…</section>}
          {route.kind === 'setup' && workspace === 'app-manager' && advancedMetadataLoaded && <PlatformWorkspaceSurface workspace="app-manager" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppManager apps={apps} objects={objects} pages={pages} flows={flows} libraryComponents={libraryComponents} reports={reports} dashboards={dashboards}
            onSave={saveApp} onDelete={deleteApp} request={apiRequest}
            onOpenWorkspace={(destination) => navigateRoute({kind:'setup', workspace:destination})} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'dashboard-builder' && (
            dashboardsError ? <section className="setup-card" role="alert">Unable to load dashboards: {dashboardsError}</section> :
            !dashboardsLoaded || !advancedMetadataLoaded ? <section className="setup-card" role="status">Loading live dashboards…</section> :
            <DashboardBuilder
            dashboards={dashboards}
            dashboardFolders={dashboardFolders}
            objects={objects}
            libraryComponents={libraryComponents}
            reports={reports}
            smtpCredentials={namedCredentials.filter((credential) => credential.protocol === 'SMTP')}
            canSchedule={canScheduleDashboards}
            shareUsers={accessControlError ? [] : accessControl.users.filter((user) => user.id !== dashboardUserId)}
            shareGroups={accessControlError ? [] : accessControl.permissionSetGroups}
            folderPublicGroups={accessControlError ? [] : accessControl.publicGroups}
            folderRoles={accessControlError ? [] : accessControl.roles}
            folderPermissionSetGroups={accessControlError ? [] : accessControl.permissionSetGroups}
            dashboardTerritories={dashboardTerritories}
            canManageTerritories={canManageDashboardTerritories}
            subscriptionUsers={accessControlError ? [] : accessControl.users}
            runningUserIds={dashboardRunningUserIds}
            userId={dashboardUserId}
            canCreate={canCreateDashboards}
            canManageAll={canManageDashboards}
            viewerMode={route.kind === 'setup' && route.dashboardView === true}
            selectedApiName={route.kind === 'setup' ? route.resourceApiName : undefined}
            onSelect={selectDashboard}
            onOpenViewer={openDashboardViewer}
            onExitViewer={exitDashboardViewer}
            onLoadRecords={loadDashboardRecords}
            onRunReport={runReport}
            onLoadSnapshots={loadDashboardSnapshots}
            onCreateSnapshot={createDashboardSnapshot}
            onDeleteSnapshot={deleteDashboardSnapshot}
            onLoadSubscriptions={loadDashboardSubscriptions}
            onSaveSubscription={saveDashboardSubscription}
            onDeleteSubscription={deleteDashboardSubscription}
            onRunSubscription={runDashboardSubscription}
            onSave={saveDashboard}
            onDelete={deleteDashboard}
            onSaveFolder={saveDashboardFolder}
            onDeleteFolder={deleteDashboardFolder}
            onSaveTerritories={saveDashboardTerritories}
            onNotify={notify}
          />)}
          {route.kind === 'setup' && workspace === 'named-credentials' && (
            namedCredentialsError ? <section className="setup-card" role="alert">Unable to load credentials: {namedCredentialsError}</section> :
            !namedCredentialsLoaded ? <section className="setup-card" role="status">Loading live named credentials…</section> :
            namedCredentialsError ? <section className="setup-card" role="alert">Unable to load Named Credentials: {namedCredentialsError}. Check OneEngine NamedCredential read access and retry.</section> :
            <PlatformWorkspaceSurface workspace="named-credentials" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="credentials"><NamedCredentials
            credentials={namedCredentials}
            canManage={canManageNamedCredentials}
            encryptionReady={namedCredentialsEncryptionReady}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            onRotate={rotateNamedCredential}
            onTest={testNamedCredential}
            canTest={canManageNamedCredentials}
            onOAuthAuthorize={authorizeNamedCredential}
            onToggleEnabled={toggleNamedCredentialEnabled}
          /></PlatformPageSlot></PlatformWorkspaceSurface>)}
          {route.kind === 'setup' && workspace === 'app-exchange' && (
            connectorRightsError ? <section className="setup-card" role="alert">Unable to verify AppExchange access: {connectorRightsError}</section> :
            !namedCredentialsLoaded || !connectorRightsLoaded || !advancedMetadataLoaded ? <section className="setup-card" role="status">Loading live AppExchange configuration…</section> :
            <PlatformWorkspaceSurface workspace="app-exchange" componentRuntime={protectedPageRuntime} permitted={connectorRights.view} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppExchange
            credentials={namedCredentials}
            flows={flows.map(({apiName,label,status,elements}) => ({
              apiName, label, status,
              elements: elements.map((element) => ({type:element.type,config:element.config as Record<string,unknown>}))
            }))}
            canManageFlows={canManageFlows}
            canManageCredentials={connectorRights.edit}
            canView={connectorRights.view}
            canManageSecrets={connectorRights.secrets}
            canInstall={connectorRights.install}
            encryptionReady={namedCredentialsEncryptionReady}
            loadApps={loadConnectorMarketplaceApps}
            canManageLicences={Boolean(connectorRights.licence)}
            grantLicence={async(appKey:string)=>{
              await apiRequest('/connector-apps/'+encodeURIComponent(appKey)+'/licence',{method:'POST',body:'{}'});
            }}
            installApp={async(appKey:string)=>{
              await apiRequest('/apps/'+encodeURIComponent(appKey)+'/install',{method:'POST',body:'{}'});
              const [installed,published]=await Promise.all([
                apiRequest<{apps:LightningAppMetadata[]}>('/metadata/apps'),
                apiRequest<{pages:LightningPageMetadata[]}>('/metadata/pages')]);
              setApps(installed.apps);setPages(published.pages);
            }}
            uninstallApp={async(appKey:string)=>{
              await apiRequest('/metadata/apps/'+encodeURIComponent(appKey),{method:'DELETE'});
              const [installed,published]=await Promise.all([
                apiRequest<{apps:LightningAppMetadata[]}>('/metadata/apps'),
                apiRequest<{pages:LightningPageMetadata[]}>('/metadata/pages')]);
              setApps(installed.apps);setPages(published.pages);
            }}
            executeLifecycleFlow={async(flowName:string,appKey:string)=>{
              await executeConnectorAppLifecycleFlow(flowName,appKey);
              // Load authoritative tenant-scoped app and page metadata after lifecycle changes.
              const [appResult,pageResult]=await Promise.all([
                apiRequest<{apps:LightningAppMetadata[]}>('/metadata/apps'),
                apiRequest<{pages:LightningPageMetadata[]}>('/metadata/pages')
              ]);
              setApps(appResult.apps);
              setPages(pageResult.pages);
            }}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            loadHistory={loadAppCommunicationHistory}
            onOpenFlow={selectFlow}
            onOpenRecord={(objectName,id) => navigateRoute({kind:'record-detail', objectApiName:objectName, recordId:id})}
          /></PlatformWorkspaceSurface>)}
          {route.kind === 'setup' && workspace === 'report-builder' && (
            reportsError ? <section className="setup-card" role="alert">Unable to load reports: {reportsError}</section> :
            !reportsLoaded || !advancedMetadataLoaded ? <section className="setup-card" role="status">Loading live reports…</section> :
            <ReportBuilder reports={reports} reportFolders={reportFolders} canManageReportFolders={canManageReportFolders} accessControl={accessControl} objects={objects} onSave={saveReport} onSaveFolder={saveReportFolder} onDelete={deleteReport} onRun={runReport} onPreview={previewReport} onNotify={notify} />)}
          {route.kind === 'setup' && workspace === 'scheduled-flows' && (
            flowDefinitionsError ? <section className="setup-card" role="alert">Unable to load saved flows: {flowDefinitionsError}</section> :
            <ScheduledFlows flows={flows} objects={objects} loading={!flowDefinitionsLoaded || !advancedMetadataLoaded} onEdit={selectFlow} />
          )}
          {route.kind === 'setup' && workspace === 'flow-interviews' && (
            <FlowInterviews
              request={apiRequest}
              interviews={flowInterviews}
              loading={flowInterviewsLoading}
              canManage={canManageFlows}
              onRefresh={() => void refreshFlowInterviews()}
              onCancel={(interview) => void cancelFlowInterview(interview)}
              onOpenFlow={selectFlow}
            />
          )}
          {route.kind === 'setup' && workspace === 'flow-logs' && (
            <FlowLogs logs={flowLogs} loading={flowLogsLoading} onOpenFlow={selectFlow}
              hasMore={Boolean(ctx.flowLogCursor)} loadingMore={Boolean(ctx.flowLogsLoadingMore)}
              onLoadMore={ctx.loadMoreFlowHistory} />
          )}
          {route.kind === 'setup' && workspace === 'automation-settings' && <PlatformWorkspaceSurface workspace="automation-settings" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="automation-policy"><AutomationSettingsWorkspace canManage={canManageFlows} /></PlatformPageSlot></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'flow-builder' && (
            flowDefinitionsError ? <section className="setup-card" role="alert">Unable to load flows: {flowDefinitionsError}</section> :
            !flowDefinitionsLoaded || !advancedMetadataLoaded ? <section className="setup-card" role="status">Loading live flow definitions…</section> :
            <FlowBuilderWorkspace
              landing={!route.resourceApiName}
              flow={flow}
              flows={flows}
              onListFlows={fetchFlowListPage}
              onLoadCapabilities={() => apiRequest('/metadata/flow-capabilities')}
              onLoadExternalServices={() => apiRequest('/metadata/external-services')}
              onImportExternalService={(apiName, label, spec) => apiRequest('/metadata/external-services/import', {
                method: 'POST', body: JSON.stringify({ apiName, label, spec })
              })}
              libraryComponents={libraryComponents}
              platformEvents={platformEvents}
              objects={objects}
              users={accessControl.users}
              approvalProcesses={approvalProcesses}
              namedCredentials={namedCredentials}
              emailAlerts={emailAlerts}
              connectorProviders={connectorProviders}
              integrationConnections={integrationConnections}
              validation={flowValidation}
              isDirty={flowHasUnsavedChanges()}
              canRunFlows={canRunFlows}
              selectedId={selectedFlowId}
              toolTab={flowToolTab}
              canUndo={flowHistory.current.undo.length > 0}
              canRedo={flowHistory.current.redo.length > 0}
              onExit={() => openSetupWorkspace('home')}
              onFlowChange={commitFlow}
              onSelectFlow={selectFlow}
              onRestoreFlowVersion={restoreFlowVersion}
              onExportFlow={exportFlow}
              onImportFlow={(file) => void importFlow(file)}
              onCloneFlow={(candidate) => void cloneFlow(candidate)}
              onDeactivateFlow={(apiName) => void deactivateFlow(apiName)}
              onDeleteFlow={(apiName) => void deleteFlow(apiName)}
              onCreateFlow={createFlow}
              onUndo={undoFlow}
              onRedo={redoFlow}
              onSelect={setSelectedFlowId}
              onToolTab={setFlowToolTab}
              onAdd={addFlowElement}
              onUpdateLabel={updateFlowLabel}
              onUpdateConfig={updateFlowConfig}
              onRemove={removeFlowElement}
              onValidate={() => void validateFlow(flow)}
              onSave={() => void saveFlow({ ...flow, status: 'Draft' })}
              onActivate={() => void saveFlow({ ...flow, status: 'Active' })}
              onRun={() => void runFlow()}
              onDebug={openFlowDebug}
              onRunTests={runSavedFlowTests}
              onSaveNamedCredential={saveNamedCredential}
              onDeleteNamedCredential={deleteNamedCredential}
              onSaveEmailAlert={saveEmailAlert}
              onDeleteEmailAlert={deleteEmailAlert}
              onSavePlatformEvent={savePlatformEvent}
              onDeletePlatformEvent={deletePlatformEvent}
              onNotify={notify}
            />
          )}
          {route.kind === 'setup' && workspace === 'company-settings' && <PlatformWorkspaceSurface workspace="company-settings" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} ><CompanySettingsWorkspace mobile={runtimeFormFactor === 'Phone'} onNavigateDeveloper={(target: string) => navigateRoute({kind:'setup',workspace:target})} developerAccess={{metadata:canReadMetadata,apps:canManageApps,flows:canManageFlows,dashboards:canManageDashboards,reports:canReadMetadata,approvals:canManageApprovalProcesses,security:canReadSecurity}} company={<CompanySettings canManage={canManageUserIdentities} />} domains={<PlatformPageSlot slotKey="domains"><TenantDomains request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot>} developer={<PlatformPageSlot slotKey="developer-accounts"><DeveloperAccountSettings request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot>} usage={<PlatformPageSlot slotKey="usage"><TenantUsagePanel request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot>} recovery={<PlatformPageSlot slotKey="recovery"><TenantRecoveryPanel request={apiRequest} operator={false} permitted={canManageUserIdentities} /></PlatformPageSlot>} mfa={<PlatformPageSlot slotKey="mfa"><TenantMfaSettings onReauthenticate={onLogout} canManage={canManageUserIdentities} /></PlatformPageSlot>} emailRecovery={<PlatformPageSlot slotKey="email-recovery"><TenantEmailRecoverySettings canManage={canManageUserIdentities} /></PlatformPageSlot>} locks={<PlatformPageSlot slotKey="locks"><TenantUserLockSettings /></PlatformPageSlot>} sessions={<PlatformPageSlot slotKey="sessions"><AccountSessionSecurity onReauthenticate={onLogout} /></PlatformPageSlot>} audit={<PlatformPageSlot slotKey="audit"><TenantSecurityAudit /></PlatformPageSlot>} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'tenant-management' && !canManagePlatformTenants && <PlatformWorkspaceSurface
            workspace="company-settings" componentRuntime={protectedPageRuntime}
            permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents}
            device={runtimeFormFactor} canEditSystemPage={false}>
            <section aria-label="My tenant management" className="company-workspace">
              <header className="company-workspace-heading">
                <div><p className="company-workspace-eyebrow">OneEngine / Tenant administration</p>
                  <h1>My Tenant Management</h1>
                  <p>Manage your own organisation through OneEngine permissions. Platform-wide tenant creation and management remain restricted to the Platform Developer policy.</p>
                </div>
              </header>
              <CompanySettingsWorkspace mobile={runtimeFormFactor === 'Phone'} onNavigateDeveloper={(target: string) => navigateRoute({kind:'setup',workspace:target})} developerAccess={{metadata:canReadMetadata,apps:canManageApps,flows:canManageFlows,dashboards:canManageDashboards,reports:canReadMetadata,approvals:canManageApprovalProcesses,security:canReadSecurity}}
                company={<CompanySettings canManage={canManageUserIdentities} />}
                domains={<PlatformPageSlot slotKey="domains"><TenantDomains request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot>}
                developer={<PlatformPageSlot slotKey="developer-accounts"><DeveloperAccountSettings request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot>}
                usage={<PlatformPageSlot slotKey="usage"><TenantUsagePanel request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot>}
                recovery={<PlatformPageSlot slotKey="recovery"><TenantRecoveryPanel request={apiRequest} operator={false} permitted={canManageUserIdentities} /></PlatformPageSlot>}
                mfa={<PlatformPageSlot slotKey="mfa"><TenantMfaSettings onReauthenticate={onLogout} canManage={canManageUserIdentities} /></PlatformPageSlot>}
                emailRecovery={<PlatformPageSlot slotKey="email-recovery"><TenantEmailRecoverySettings canManage={canManageUserIdentities} /></PlatformPageSlot>}
                locks={<PlatformPageSlot slotKey="locks"><TenantUserLockSettings /></PlatformPageSlot>}
                sessions={<PlatformPageSlot slotKey="sessions"><AccountSessionSecurity onReauthenticate={onLogout} /></PlatformPageSlot>}
                audit={<PlatformPageSlot slotKey="audit"><TenantSecurityAudit /></PlatformPageSlot>}
              />
            </section>
          </PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'tenant-management' && canManagePlatformTenants && <PlatformWorkspaceSurface workspace="tenant-management" componentRuntime={protectedPageRuntime} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} permitted={canManagePlatformTenants}><TenantManagement request={apiRequest} permitted={canManagePlatformTenants} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'rbac' && (
            accessControlError ? <section className="setup-card" role="alert">Unable to load tenant users and permissions: {accessControlError}. Refresh to retry.</section> :
            !accessControlLoaded ? <section className="setup-card" role="status">Loading live tenant users and permissions…</section> :
            <PlatformWorkspaceSurface workspace="rbac" componentRuntime={protectedPageRuntime} permitted={canReadSecurity} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><Permissions
            accessControl={accessControl}
            accessControlError={accessControlError}
            objects={objects}
            routeResourceApiName={route.resourceApiName}
            routeResourceId={route.resourceId}
            onRouteResourceChange={(resourceApiName: string, resourceId: string) => navigateRoute({
              kind: 'setup', workspace: 'rbac', resourceApiName, ...(resourceId ? { resourceId } : {})
            })}
            onSave={saveAccessControl}
            onNotify={notify}
            onOpenUserRecords={() => navigateRoute({kind:'record-list',objectApiName:'User'})}
          /></PlatformWorkspaceSurface>)}
        </section>
      </main>
      {showNewField && <React.Suspense fallback={null}><FieldWizardModal context={{ X, addField, formulaEditorRef, insertFormulaText, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, object, objects, relatedLookupFilterOperators, resetNewFieldDraft, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setShowNewField, showNewField, validateNewFieldFormula }} /></React.Suspense>}
      {(showNewObject || showCustomTabWizard) && <React.Suspense fallback={null}><SetupObjectDialogs context={{ showNewObject, setShowNewObject, setShowCustomTabWizard, newObjectLabel, setNewObjectLabel, newObjectPluralLabel, setNewObjectPluralLabel, newObjectRecordNameLabel, setNewObjectRecordNameLabel, newObjectSettings, setNewObjectSettings, newObjectDescription, setNewObjectDescription, launchCustomTabWizard, setLaunchCustomTabWizard, createObject, showCustomTabWizard, customTabObject, setCustomTabObject, customTabStyle, setCustomTabStyle, customTabStyles, saveCustomTab }} /></React.Suspense>}
      {(flowRun || flowDebug) && <React.Suspense fallback={null}><SetupFlowDialogs context={{ flowRun, setFlowRun, flowRunnerError, setFlowRunnerError, submitFlowScreen, goBackFlowScreen, flowRunnerSubmitting, flowDebug, setFlowDebug, runFlowDebug, libraryComponents, loadFlowScreenRecords }} /></React.Suspense>}
      {toast && <div className="toast" role="status"><Check size={16} aria-hidden="true" /><span className="toast-message">{toast}</span><button type="button" className="toast-dismiss" aria-label="Dismiss notification" title="Dismiss notification" onClick={() => setToast('')}><X size={16} aria-hidden="true" /></button></div>}
    </div>
  );
}
