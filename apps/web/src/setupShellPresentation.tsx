// @ts-nocheck
// Shared shell presentation, composed from registered metadata-driven runtime and tools.
import * as React from 'react';
import type { ObjectMetadata, LightningPageMetadata, LightningAppMetadata } from './metadata';
import type { RecordData } from './recordMetadataUtils';
export function renderSetupShell(ctx: any) {
  const { AppExchange, AppManager, ComponentLibrary, FieldWizardModal, FlowInterviews, FlowLogs, NamedCredentials, ScheduledFlows, SetupFlowDialogs, SetupObjectDialogs, AccountSessionSecurity, ApprovalProcessManager, AutomationSettingsWorkspace, Bell, Check, ChevronLeft, ChevronRight, CircleHelp, CompanySettings, ConnectionHealthIndicator, ConnectorSettingsWorkspace, DashboardBuilder, Database, DeveloperAccountSettings, FlowBuilderWorkspace, GlobalRecordSearch, History, LightningAppRuntime, Monitor, NavigationLoadTime, ObjectManager, PageBuilder, Permissions, PlatformPageSlot, PlatformWorkspaceSurface, ProfilePasswordMenu, RecordObjectPicker, RecordWorkspace, ReportBuilder, Search, SetupHome, TenantDomains, TenantEmailRecoverySettings, TenantManagement, TenantMfaSettings, TenantRecoveryPanel, TenantSecurityAudit, TenantUsagePanel, TenantUserLockSettings, X, accessControl, accessControlError, activationAppIds, activeUtility, addField, addFlowElement, advancedMetadataLoaded, apiRequest, appUtilityRef, approvalBusyId, approvalProcesses, approvalRequests, apps, authorizeNamedCredential, canCreateDashboards, canManageApprovalProcesses, canManageApps, canManageDashboardTerritories, canManageDashboards, canManageFlows, canManageLibrary, canManageNamedCredentials, canManagePlatformTenants, canManageReportFolders, canManageUserIdentities, canRunFlows, canScheduleDashboards, cancelFlowInterview, changePage, cloneFlow, commitFlow, connectorProviders, connectorRights, createDashboardSnapshot, createFlow, createObject, currentApp, currentAppNavigation, currentFieldAccess, currentProfileId, currentRecordTypeAccess, customTabObject, customTabStyle, customTabStyles, dashboardFolders, dashboardRunningUserIds, dashboardTerritories, dashboardUserId, dashboards, deactivateFlow, decideApproval, defaultLightningPage, deleteApp, deleteApprovalProcess, deleteDashboard, deleteDashboardFolder, deleteDashboardSnapshot, deleteDashboardSubscription, deleteEmailAlert, deleteField, deleteFlow, deleteLibraryComponent, deleteNamedCredential, deleteObject, deletePlatformEvent, deleteReport, emailAlerts, executeConnectorAppLifecycleFlow, exitDashboardViewer, exportFlow, fetchFlowListPage, filteredSetupGroups, flow, flowDebug, flowHasUnsavedChanges, flowHistory, flowInterviews, flowInterviewsLoading, flowLogs, flowLogsLoading, flowRun, flowRunnerError, flowRunnerSubmitting, flowToolTab, flowValidation, flows, formulaEditorRef, goBackFlowScreen, grantConnectorLicence, importFlow, insertFormulaText, integrationConnections, isStandaloneMetadataPage, launchCustomTabWizard, libraryComponents, loadAppCommunicationHistory, loadConnectorMarketplaceApps, loadDashboardRecords, loadDashboardSnapshots, loadDashboardSubscriptions, loadFlowScreenRecords, loadNotifications, logout, markNotificationRead, metadataLoadError, metadataLoaded, namedCredentials, namedCredentialsEncryptionReady, navigateRoute, navigateSetupItem, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, newObjectDescription, newObjectLabel, newObjectPluralLabel, newObjectRecordNameLabel, newObjectSettings, notificationRef, notifications, notificationsLoading, notificationsOpen, notificationsUnreadCount, notify, object, objectSearch, objectSetting, objects, onLogout, openDashboardViewer, openFlowDebug, openPageForObject, openSetupWorkspace, page, pageCreationAppContext, pageRouteApiName, pages, platformEvents, previewReport, protectedPageRuntime, publishLibraryComponent, quickFind, readableRecordObjects, recentRoutes, recordSearch, redoFlow, refreshFlowInterviews, refreshObject, relatedLookupFilterOperators, removeFlowElement, reportFolders, reports, resetNewFieldDraft, restoreFlowVersion, rollbackLibraryComponent, rotateNamedCredential, route, routeAliasError, routeTiming, runDashboardSubscription, runFlow, runFlowDebug, runReport, runSavedFlowTests, runtimeFormFactor, saveAccessControl, saveApp, saveApprovalProcess, saveConnectorProvider, saveCustomTab, saveDashboard, saveDashboardFolder, saveDashboardSubscription, saveDashboardTerritories, saveEmailAlert, saveField, saveFlow, saveIntegrationConnection, saveLibraryComponent, saveNamedCredential, saveObject, savePage, savePageFromBuilder, savePlatformEvent, saveReport, saveReportFolder, selectDashboard, selectFlow, selectedFlowId, setActiveUtility, setCustomTabObject, setCustomTabStyle, setFlowDebug, setFlowRun, setFlowRunnerError, setFlowToolTab, setLaunchCustomTabWizard, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setNewObjectDescription, setNewObjectLabel, setNewObjectPluralLabel, setNewObjectRecordNameLabel, setNewObjectSettings, setObjectSearch, setPage, setPageCreationAppContext, setQuickFind, setRecordSearch, setSelectedFlowId, setSetupSidebarCollapsed, setShowNewField, setShowNewObject, setShowCustomTabWizard, setStandalonePageMode, setupSidebarCollapsed, showCustomTabWizard, showNewField, showNewObject, standalonePageMode, submitFlowScreen, testIntegrationConnection, testNamedCredential, toast, toggleNamedCredentialEnabled, toggleNotifications, undoFlow, uneSolutionsLogoUrl, updateFlowConfig, updateFlowLabel, validateFlow, validateNewFieldFormula, workspace } = ctx;
  return (
    <div className={standalonePageMode || isStandaloneMetadataPage ? 'lightning standalone-page-mode' : route.kind === 'setup' && route.workspace === 'page-builder' && Boolean(route.resourceApiName) ? 'lightning page-builder-editing' : 'lightning'}>
      <header className="salesforce-header">
        <button type="button" className="brand brand-home-button" aria-label="Go to home" title="Home" onClick={() => openSetupWorkspace('home')}><img className="brand-logo" src={uneSolutionsLogoUrl} alt="UNE Solutions" /></button>
        <button type="button" className="header-home-link" onClick={() =>
          navigateRoute({ kind: 'app-home', appId: currentApp?.apiName ?? 'Records' })}>
          <Monitor size={16} />Home
        </button>
        <button type="button" disabled={!readableRecordObjects.length}
          className={route.kind === 'record-list' || route.kind === 'record-detail' ? 'header-records-link active' : 'header-records-link'}
          onClick={() => {
            const targetObject = route.kind === 'record-list' || route.kind === 'record-detail'
              ? route.objectApiName : readableRecordObjects[0]?.apiName;
            if (targetObject) navigateRoute({ kind: 'record-list', objectApiName: targetObject, appId: currentApp?.apiName ?? 'Records' });
          }}><Database size={16} />Records</button>
        <RecordObjectPicker objects={readableRecordObjects}
          selected={route.kind === 'record-list' || route.kind === 'record-detail' ? route.objectApiName : ''}
          onSelect={(apiName) => navigateRoute({ kind: 'record-list', objectApiName: apiName, appId: currentApp?.apiName ?? 'Records' })} />
        <div className="header-searches">
          <GlobalRecordSearch objects={readableRecordObjects}
            searchObject={(apiName, term) => apiRequest<{ records: RecordData[] }>(
              `/records/${encodeURIComponent(apiName)}?${new URLSearchParams({ search: term, limit: '5', offset: '0' })}`)}
            onSelect={(objectApiName, recordId) => navigateRoute({
              kind: 'record-detail', objectApiName, recordId, appId: currentApp?.apiName ?? 'Records'
            })} />
          {route.kind === 'record-list' && <label className="header-list-search">
            <Search size={15} aria-hidden="true" />
            <input type="search" aria-label={`Search ${objects.find((item) => item.apiName === route.objectApiName)?.pluralLabel ?? 'current object'} records`}
              placeholder={`Search ${objects.find((item) => item.apiName === route.objectApiName)?.pluralLabel ?? 'records'}…`}
              value={recordSearch} onChange={(event) => setRecordSearch(event.target.value)} />
          </label>}
        </div>
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
            ready={metadataLoaded && (route.kind !== 'setup' || route.workspace === 'home' || advancedMetadataLoaded)}
            kind={routeTiming.kind} authMs={routeTiming.authMs} />
          <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
          
          <ConnectionHealthIndicator />
          <div className="notification-center" ref={notificationRef}>
            <button className="icon-button notification-button" aria-label={`Notifications${notificationsUnreadCount ? `, ${notificationsUnreadCount} unread` : ''}`} aria-expanded={notificationsOpen} aria-controls="notification-panel" onClick={toggleNotifications}>
              <Bell size={17} />{notificationsUnreadCount > 0 && <span className="notification-count">{notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}</span>}
            </button>
            {notificationsOpen && <section className="notification-panel" id="notification-panel" aria-label="Notifications">
              <div className="notification-panel-heading"><strong>Notifications</strong><button type="button" className="text-action" onClick={() => void loadNotifications()}>Refresh</button></div>
              {notificationsLoading ? <p className="empty-list">Loading notifications…</p> : <>
                {approvalRequests.length > 0 && <section className="notification-approvals" aria-label="Approval requests">
                  <h3>Approval Requests</h3>
                  <ul className="notification-list">{approvalRequests.map((request) => <li key={request.id}>
                    <strong>{request.objectLabel}: {request.recordName}</strong>
                    <p>Submitted by {request.submittedByName}{request.comments ? ` · ${request.comments}` : ''}</p>
                    <small>{new Date(request.createdAt).toLocaleString()}</small>
                    <div className="toolbar-actions">
                      <button type="button" className="btn btn-brand" disabled={approvalBusyId === request.id} onClick={() => void decideApproval(request, 'Approved')}>Approve</button>
                      <button type="button" className="btn" disabled={approvalBusyId === request.id} onClick={() => void decideApproval(request, 'Rejected')}>Reject</button>
                    </div>
                  </li>)}</ul>
                </section>}
                {notifications.length
                ? <ul className="notification-list">{notifications.map((notification) => <li key={notification.id} className={notification.readAt ? '' : 'unread'}>
                  <strong>{notification.title}</strong><p>{notification.body}</p>
                  <small>{new Date(notification.createdAt).toLocaleString()} · {notification.flowApiName}</small>
                  {!notification.readAt && <button type="button" className="text-action" onClick={() => void markNotificationRead(notification)}>Mark as read</button>}
                </li>)}</ul>
                : approvalRequests.length ? null : <p className="empty-list">You’re all caught up.</p>}
              </>}
            </section>}
          </div>
          <ProfilePasswordMenu onLogout={logout} onPasswordChanged={onLogout} />
        </div>
      </header>

      {route.kind !== 'setup' && currentAppNavigation.some((entry) => entry.type === 'App Page' && pages.some((page) => page.apiName === entry.apiName && page.pageType === 'App Page' && page.status === 'Active')) && <div className="app-strip" style={{ '--brand': currentApp?.brandColor ?? '#0176d3' } as React.CSSProperties}>
        {currentApp?.apiName !== 'Records' && <div className="app-title">
          <span className="app-icon"><Database size={18} /></span>
          {apps.length > 1
            ? <select className="app-title-switcher" aria-label="Switch app" value={currentApp?.apiName ?? ''}
                onChange={(event) => navigateRoute({ kind: 'app-home', appId: event.target.value })}>
                {apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
              </select>
            : <strong className="app-current-label">{currentApp?.label ?? 'Records'}</strong>}
        </div>}
        <nav className="primary-tabs" aria-label="Workspace navigation">
          {currentAppNavigation.filter((entry) => entry.type === 'App Page').map((entry) => {
            const apiName = entry.apiName;
            const appPage = pages.find((item) => item.apiName === apiName && item.pageType === 'App Page' && item.status === 'Active');
            if (!appPage) return null;
            return <button className={route.kind === 'app-page' && route.pageApiName === apiName ? 'primary-tab active' : 'primary-tab'}
              key={apiName} onClick={() => navigateRoute({ kind: 'app-page', appId: currentApp?.apiName ?? '', pageApiName: apiName })}><Monitor className="rail-icon" size={17} />{appPage.label}</button>;
          })}

        </nav>

      </div>

      }

      <main className={route.kind === 'setup' ? 'setup-layout setup-no-tabs' : 'setup-layout'}>
        {route.kind === 'setup' && !route.dashboardView && workspace !== 'flow-builder' && !(workspace === 'page-builder' && Boolean(route.resourceApiName)) && (
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
                          || (workspace === 'page-builder' && item === 'Lightning App Builder')
                          || (workspace === 'app-manager' && item === 'App Manager')
                          || (workspace === 'component-library' && item === 'Component Library')
                          || (workspace === 'app-exchange' && item === 'AppExchange')
                          || (workspace === 'named-credentials' && item === 'Named Credentials')
                          || (workspace === 'connector-settings' && item === 'Une Connectors')
                          || (workspace === 'flow-interviews' && item === 'Paused and Waiting Interviews')
                          || (workspace === 'scheduled-flows' && item === 'Scheduled Flows')
                          || (workspace === 'flow-logs' && item === 'Failed Flow Logs')) ? 'tree-item selected' : 'tree-item'}
                        aria-label={`Open ${item}`}
                        title={item}
                        data-short-label={item.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')}
                        onClick={() => navigateSetupItem(item)}
                      >
                        <span>{item}</span>
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
          {(route.kind === 'record-list' || route.kind === 'record-detail') && <RecordWorkspace route={route} objects={objects} apps={apps} pages={pages}
            availableFlows={flows.filter(item => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            onLaunchFlow={(apiName: string, inputs?: Record<string, unknown>) => void runFlow(apiName, inputs)}
            reports={reports} metadataLoaded={metadataLoaded} profileId={currentProfileId} canManageUserIdentities={canManageUserIdentities} userRoles={accessControl.roles}
            fieldAccess={currentFieldAccess} recordTypeAccess={currentRecordTypeAccess} libraryComponents={libraryComponents} headerSearch={recordSearch} onNavigate={navigateRoute} />}
          {route.kind === 'route-alias' && <section className="setup-card" role="status">
            {routeAliasError ? <p role="alert">{routeAliasError}</p> : <p>Resolving route alias…</p>}
          </section>}
          {route.kind === 'app-home' && <LightningAppRuntime appId={route.appId} objects={objects} apps={apps} pages={pages} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName: string, inputs: Record<string, unknown>) => void runFlow(apiName, inputs)} onStandaloneModeChange={setStandalonePageMode} />}
          {route.kind === 'app-page' && <LightningAppRuntime appId={route.appId} pageApiName={route.pageApiName} objects={objects} apps={apps} pages={pages} reports={reports}
            libraryComponents={libraryComponents} availableFlows={flows.filter((item) => ['Screen Flow', 'Autolaunched Flow'].includes(item.flowType))
              .map(({ apiName, label, flowType, status }) => ({ apiName, label, flowType, status }))}
            formFactor={runtimeFormFactor} onNavigate={navigateRoute}
            onLaunchFlow={(apiName: string, inputs: Record<string, unknown>) => void runFlow(apiName, inputs)} onStandaloneModeChange={setStandalonePageMode} />}
          {route.kind === 'setup' && workspace === 'home' && (
            <SetupHome onNavigate={openSetupWorkspace} />
          )}
          {route.kind === 'setup' && workspace === 'object-manager' && (
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
              page={pages.find((item) => item.targetObject === object.apiName && item.pageType === 'Record Page') ?? page}
              onNotify={notify}
            />
            </PlatformWorkspaceSurface>
          )}
          {route.kind === 'setup' && workspace === 'page-builder' && advancedMetadataLoaded && route.resourceApiName && !pages.some((item) => item.apiName === route.resourceApiName) && (
            <section className="setup-card" role="alert" style={{ padding: 24 }}>
              <h2>{metadataLoadError ? "Unable to load Lightning pages" : "Lightning page not found"}</h2>
              <p>{metadataLoadError ? `Metadata API error: ${metadataLoadError}` : `The page "${route.resourceApiName}" was not returned by the metadata API. No other page has been substituted.`}</p>
              <p>Check that the page exists in this tenant and that your account can access it.</p>
              <button className="btn" onClick={() => navigateRoute({ kind: 'setup', workspace: 'page-builder' })}>Open saved pages</button>
            </section>
          )}
          {route.kind === 'setup' && workspace === 'page-builder' && (!route.resourceApiName || (advancedMetadataLoaded && pages.some((item) => item.apiName === route.resourceApiName))) && <PageBuilder key={route.resourceApiName ?? 'page-list'} editorMode={Boolean(route.resourceApiName)} onBackToPages={() => { setPage(pages.find(item => item.apiName === page.apiName) ?? page); navigateRoute({ kind: 'setup', workspace: 'page-builder' }); }} page={page} pages={pages}
            preparedAppId={pageCreationAppContext[page.apiName] ?? ''}
            dashboards={dashboards}
            onPrepareApp={(pageApiName: string, appId: string) => setPageCreationAppContext(current => ({
              ...current, [pageApiName]: appId
            }))}
            onAppLinked={(pageApiName: string) => setPageCreationAppContext(current => {
              const next = { ...current };
              delete next[pageApiName];
              return next;
            })} objects={objects} apps={apps} profiles={accessControl.profiles} reports={reports} libraryComponents={libraryComponents} flows={flows} onChange={changePage} onSelectPage={(apiName: string) => { const selected = pages.find((item) => item.apiName === apiName); if (selected) { setPage(selected); navigateRoute({ kind: 'setup', workspace: 'page-builder', resourceApiName: selected.apiName }); } }} onTargetObjectChange={openPageForObject} onLaunchFlow={(apiName: string, inputs: Record<string, unknown>) => void runFlow(apiName, inputs)} onSave={savePageFromBuilder} onSaveApp={saveApp} onDeleteApp={deleteApp} request={apiRequest} canManageRoutes={canManageApps} onExit={() => { setPage(pages.find((item) => item.apiName === route.resourceApiName) ?? pages[0] ?? defaultLightningPage); pageRouteApiName.current = ''; navigateRoute({ kind: 'setup', workspace: 'home' }); }} onNotify={notify} />}
          {route.kind === 'setup' && workspace === 'app-manager' && <PlatformWorkspaceSurface workspace="app-manager" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppManager apps={apps} objects={objects} pages={pages} onSave={saveApp} onDelete={deleteApp} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'dashboard-builder' && <DashboardBuilder
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
          />}
          {route.kind === 'setup' && workspace === 'component-library' && <ComponentLibrary components={libraryComponents} canManage={canManageLibrary} onSave={saveLibraryComponent} onDelete={deleteLibraryComponent} onPublish={publishLibraryComponent} onRollback={rollbackLibraryComponent} />}
          {route.kind === 'setup' && workspace === 'approval-processes' && <PlatformWorkspaceSurface workspace="approval-processes" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="approval-workspace"><ApprovalProcessManager
            processes={approvalProcesses}
            objects={objects}
            users={accessControlError ? [] : accessControl.users}
            canManage={canManageApprovalProcesses}
            onSave={saveApprovalProcess}
            onDelete={deleteApprovalProcess}
            onNotify={notify}
          /></PlatformPageSlot></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'named-credentials' && <PlatformWorkspaceSurface workspace="named-credentials" componentRuntime={protectedPageRuntime} permitted={canManageNamedCredentials} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="credentials"><NamedCredentials
            credentials={namedCredentials}
            canManage={canManageNamedCredentials}
            encryptionReady={namedCredentialsEncryptionReady}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            onRotate={rotateNamedCredential}
            onTest={testNamedCredential}
            onOAuthAuthorize={authorizeNamedCredential}
            onToggleEnabled={toggleNamedCredentialEnabled}
          /></PlatformPageSlot></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'app-exchange' && <PlatformWorkspaceSurface workspace="app-exchange" componentRuntime={protectedPageRuntime} permitted={connectorRights.view} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><AppExchange
            credentials={namedCredentials}
            flows={flows.map(({apiName,label,status,elements}) => ({
              apiName, label, status,
              elements: elements.map((element) => ({type:element.type,config:element.config as Record<string,unknown>}))
            }))}
            canManageFlows={canManageFlows}
            canManageCredentials={connectorRights.edit}
            canView={connectorRights.view}
            canManageSecrets={connectorRights.secrets}
            canTest={connectorRights.test}
            canInstall={connectorRights.install}
            canLicenceAdmin={connectorRights.licence}
            encryptionReady={namedCredentialsEncryptionReady}
            onGrantLicence={grantConnectorLicence}
            loadApps={loadConnectorMarketplaceApps}
            executeLifecycleFlow={executeConnectorAppLifecycleFlow}
            onSave={saveNamedCredential}
            onDelete={deleteNamedCredential}
            onRotate={rotateNamedCredential}
            onTest={testNamedCredential}
            onOAuthAuthorize={authorizeNamedCredential}
            loadHistory={loadAppCommunicationHistory}
            onOpenFlow={selectFlow}
            onOpenRecord={(objectName,id) => navigateRoute({kind:'record-detail', objectApiName:objectName, recordId:id})}
          /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'connector-settings' && (() => {
            const provider = connectorProviders.find((item) => item.connectorKey === route.resourceApiName) ?? connectorProviders[0];
            return <PlatformWorkspaceSurface workspace="connector-settings" componentRuntime={protectedPageRuntime} permitted={connectorRights.view} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:"setup",workspace:"page-builder",resourceApiName:apiName});}}><PlatformPageSlot slotKey="connector-workspace">{provider ? <ConnectorSettingsWorkspace
              key={provider.connectorKey}
              provider={provider}
              providers={connectorProviders}
              integrationConnections={integrationConnections}
              onSelect={(connectorKey: string) => navigateRoute({ kind: 'setup', workspace: 'connector-settings', resourceApiName: connectorKey })}
              onSaveProvider={saveConnectorProvider}
              onSaveIntegrationConnection={saveIntegrationConnection}
              onTestIntegrationConnection={testIntegrationConnection}
              canManage={connectorRights.edit}
              onNotify={notify}
            /> : <div className="connector-settings-page"><div className="surface connector-empty">Connector metadata is loading…</div></div>}</PlatformPageSlot></PlatformWorkspaceSurface>;
          })()}
          {route.kind === 'setup' && workspace === 'report-builder' && <ReportBuilder reports={reports} reportFolders={reportFolders} canManageReportFolders={canManageReportFolders} accessControl={accessControl} objects={objects} onSave={saveReport} onSaveFolder={saveReportFolder} onDelete={deleteReport} onRun={runReport} onPreview={previewReport} onNotify={notify} />}
          {route.kind === 'setup' && workspace === 'scheduled-flows' && (
            <ScheduledFlows flows={flows} objects={objects} loading={!metadataLoaded} onEdit={selectFlow} />
          )}
          {route.kind === 'setup' && workspace === 'flow-interviews' && (
            <FlowInterviews
              interviews={flowInterviews}
              loading={flowInterviewsLoading}
              canManage={canManageFlows}
              onRefresh={() => void refreshFlowInterviews()}
              onCancel={(interview) => void cancelFlowInterview(interview)}
              onOpenFlow={selectFlow}
            />
          )}
          {route.kind === 'setup' && workspace === 'flow-logs' && (
            <FlowLogs logs={flowLogs} loading={flowLogsLoading} onOpenFlow={selectFlow} />
          )}
          {route.kind === 'setup' && workspace === 'automation-settings' && <PlatformWorkspaceSurface workspace="automation-settings" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><PlatformPageSlot slotKey="automation-policy"><AutomationSettingsWorkspace canManage={canManageFlows} /></PlatformPageSlot></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'flow-builder' && (
            <FlowBuilderWorkspace
              landing={!route.resourceApiName}
              flow={flow}
              flows={flows}
              onListFlows={fetchFlowListPage}
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
              onRotateNamedCredential={rotateNamedCredential}
              onSaveEmailAlert={saveEmailAlert}
              onDeleteEmailAlert={deleteEmailAlert}
              onSavePlatformEvent={savePlatformEvent}
              onDeletePlatformEvent={deletePlatformEvent}
              onNotify={notify}
            />
          )}
          {route.kind === 'setup' && workspace === 'company-settings' && <PlatformWorkspaceSurface workspace="company-settings" componentRuntime={protectedPageRuntime} permitted={canReadMetadata} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} ><><PlatformPageSlot slotKey="company-info"><CompanySettings canManage={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="domains"><TenantDomains request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="developer-accounts"><DeveloperAccountSettings request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="usage"><TenantUsagePanel request={apiRequest} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="recovery"><TenantRecoveryPanel request={apiRequest} operator={false} permitted={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="mfa"><TenantMfaSettings onReauthenticate={onLogout} canManage={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="email-recovery"><TenantEmailRecoverySettings canManage={canManageUserIdentities} /></PlatformPageSlot><PlatformPageSlot slotKey="locks"><TenantUserLockSettings /></PlatformPageSlot><PlatformPageSlot slotKey="sessions"><AccountSessionSecurity onReauthenticate={onLogout} /></PlatformPageSlot><PlatformPageSlot slotKey="audit"><TenantSecurityAudit /></PlatformPageSlot></></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'tenant-management' && <PlatformWorkspaceSurface workspace="tenant-management" componentRuntime={protectedPageRuntime} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}} permitted={canManagePlatformTenants}><TenantManagement request={apiRequest} permitted={canManagePlatformTenants} /></PlatformWorkspaceSurface>}
          {route.kind === 'setup' && workspace === 'rbac' && <PlatformWorkspaceSurface workspace="rbac" componentRuntime={protectedPageRuntime} permitted={canReadSecurity} pages={pages} libraryComponents={libraryComponents} device={runtimeFormFactor} canEditSystemPage={canManagePlatformTenants} onEditSystemPage={(apiName: string)=>{const selected=pages.find(p=>p.apiName===apiName);if(selected)setPage(selected);navigateRoute({kind:'setup',workspace:'page-builder',resourceApiName:apiName});}}><Permissions
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
          /></PlatformWorkspaceSurface>}
        </section>
      </main>
      {showNewField && <React.Suspense fallback={null}><FieldWizardModal context={{ X, addField, formulaEditorRef, insertFormulaText, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, object, objects, relatedLookupFilterOperators, resetNewFieldDraft, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setShowNewField, showNewField, validateNewFieldFormula }} /></React.Suspense>}
      {(showNewObject || showCustomTabWizard) && <React.Suspense fallback={null}><SetupObjectDialogs context={{ showNewObject, setShowNewObject, setShowCustomTabWizard, newObjectLabel, setNewObjectLabel, newObjectPluralLabel, setNewObjectPluralLabel, newObjectRecordNameLabel, setNewObjectRecordNameLabel, newObjectSettings, setNewObjectSettings, newObjectDescription, setNewObjectDescription, launchCustomTabWizard, setLaunchCustomTabWizard, createObject, showCustomTabWizard, customTabObject, setCustomTabObject, customTabStyle, setCustomTabStyle, customTabStyles, saveCustomTab }} /></React.Suspense>}
      {(flowRun || flowDebug) && <React.Suspense fallback={null}><SetupFlowDialogs context={{ flowRun, setFlowRun, flowRunnerError, setFlowRunnerError, submitFlowScreen, goBackFlowScreen, flowRunnerSubmitting, flowDebug, setFlowDebug, runFlowDebug, libraryComponents, loadFlowScreenRecords }} /></React.Suspense>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}
