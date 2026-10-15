import BuilderTemplatePreviewLayout from './BuilderTemplatePreviewLayout';
import { reconcileNavigationOrder } from './appNavigation';
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


export function createPageBuilder(MetadataComponentProperties: React.ComponentType<any>, MetadataBoundPageComponent: React.ComponentType<any>) {
function PageBuilder({
  page, pages, objects, apps, profiles, reports, dashboards, libraryComponents, flows, onChange, onSelectPage, onTargetObjectChange, onSave, onSaveApp, onDeleteApp, onExit, onNotify, onLaunchFlow,
  preparedAppId, onPrepareApp, onAppLinked, request, canManageRoutes, editorMode, onBackToPages
}: {
  page: LightningPageMetadata;
  pages: LightningPageMetadata[];
  objects: ObjectMetadata[];
  apps: LightningAppMetadata[];
  profiles: ProfileMetadata[];
  reports: ReportMetadata[];
  dashboards: DashboardMetadata[];
  libraryComponents: LibraryComponentMetadata[];
  flows: FlowDefinitionMetadata[];
  onChange: (page: LightningPageMetadata) => void;
  onSelectPage: (apiName: string) => void;
  onTargetObjectChange: (targetObject: string) => void;
  onSave: (page: LightningPageMetadata, previousApiName: string, successMessage?: string) => Promise<boolean>;
  onSaveApp: (app: LightningAppMetadata, updating: boolean) => Promise<void>;
  onDeleteApp: (apiName: string) => Promise<void>;
  onExit: () => void;
  onNotify: (message: string) => void;
  onLaunchFlow: (flowApiName: string, inputs?: Record<string, unknown>) => void;
  preparedAppId: string;
  onPrepareApp: (pageApiName: string, appId: string) => void;
  onAppLinked: (pageApiName: string) => void;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  canManageRoutes: boolean;
  editorMode: boolean;
  onBackToPages: () => void;
}) {
  const [builderAppApiName, setBuilderAppApiName] = useState(preparedAppId);
  useEffect(() => {
    if (preparedAppId) setBuilderAppApiName(preparedAppId);
  }, [preparedAppId]);
  const pageTemplates: Array<{ id: LightningPageTemplate; label: string; regions: Array<'header' | 'main' | 'sidebar'> }> = [
    { id: 'one-region', label: 'One Region', regions: ['main'] },
    { id: 'header-main', label: 'Header and Main', regions: ['header', 'main'] },
    { id: 'main-sidebar', label: 'Main with Sidebar', regions: ['main', 'sidebar'] },
    { id: 'header-main-sidebar', label: 'Header, Main, and Sidebar', regions: ['header', 'main', 'sidebar'] }
  ];
  const template = pageTemplates.find((item) => item.id === page.template) ?? pageTemplates[0];
  const builderApp = apps.find((app) => app.apiName === builderAppApiName);
  const appPageApiNames = new Set(builderApp?.navigationPageApiNames ?? []);
  const appPages = builderApp
    ? pages.filter((item) => item.status === 'Active' && (
      appPageApiNames.has(item.apiName)
      || (item.activationAssignments ?? []).some((assignment) => assignment.appId === builderApp.apiName)
    ))
    : [];
  // Show all tenant pages even if an installation needs activation repair.
  const pagePickerPages = [...pages.filter((item) => item.apiName !== page.apiName), page]
    .sort((left, right) => (Date.parse(right.updatedAt ?? '') || 0) - (Date.parse(left.updatedAt ?? '') || 0));
  const currentPageIsAssignedToBuilderApp = appPages.some((item) => item.apiName === page.apiName);
  const targetObject = objects.find((object) => object.apiName === page.targetObject);
  const pageTypeComponents = page.pageType === 'Record Page'
    ? standardPageComponents.map((component) => component.apiName)
    : standardPageComponents
      .filter((component) => ['Accordion', 'Tabs', 'Report Chart', 'Dashboard'].includes(component.apiName))
      .map((component) => component.apiName);
  const relatedListOptions = [...new Map(objects.flatMap((childObject) => childObject.fields.flatMap((field) => {
    const relationship = field.relationship;
    if (relationship?.targetObject !== page.targetObject || !relationship.childRelationshipName) return [];
    return [[relationship.childRelationshipName, childObject.pluralLabel] as const];
  })))].map(([apiName, label]) => ({ apiName, label }));
  const defaultRelatedLists = relatedListOptions.slice(0, 3).map((item) => item.apiName);
  const availableComponents = pageTypeComponents.filter((component) =>
    (component !== 'Activities' || targetObject?.settings?.allowActivities)
    && (component !== 'Chatter' || targetObject?.settings?.allowInChatter)
    && (component !== 'Report Chart' || targetObject?.settings?.allowReports));
  const stringList = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
  const [selectedId, setSelectedId] = useState(page.components[0]?.id ?? '');
  const savedPageApiName = useRef(page.apiName);
  const device: 'Desktop' | 'Tablet' | 'Phone' = page.devices.length === 1 && page.devices[0] === 'Phone' || page.canvasWidth <= 600
    ? 'Phone' : page.canvasWidth < 1400 ? 'Tablet' : 'Desktop';
  const orientation = canvasOrientation(page.canvasWidth, page.canvasHeight);
  const [paletteTab, setPaletteTab] = useState<'Components' | 'Fields' | 'Layers'>('Components');
  const [paletteSearch, setPaletteSearch] = useState('');
  const [paletteCategory, setPaletteCategory] = useState<(typeof pageBuilderPaletteCategories)[number]>('All Components');
  const [favouriteComponents, setFavouriteComponents] = useState<string[]>([]);
  const [favouritesLoaded, setFavouritesLoaded] = useState(false);
  const [componentPanelWidth, setComponentPanelWidth] = useState(280);
  const [componentPanelVisible, setComponentPanelVisible] = useState(true);
  const [propertiesPanelVisible, setPropertiesPanelVisible] = useState(true);
  const [propertiesPanelWidth, setPropertiesPanelWidth] = useState(310);
  const propertiesResizeStart = useRef<{ pointerId: number; pointerX: number; width: number } | null>(null);
  const [pageListObject, setPageListObject] = useState(page.targetObject || objects[0]?.apiName || '');
  const [pageListSearch, setPageListSearch] = useState('');
  const paletteResizeStart = useRef<{ pointerId: number; pointerX: number; width: number } | null>(null);
  const [customPropertiesDraft, setCustomPropertiesDraft] = useState('');
  const [customPropertiesError, setCustomPropertiesError] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [showCanvasConditions, setShowCanvasConditions] = useState(false);
  const externalPreviewWindowRef = useRef<Window | null>(null);
  const [externalPreviewTarget, setExternalPreviewTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    return () => { externalPreviewWindowRef.current?.close(); externalPreviewWindowRef.current = null; };
  }, []);
  const openExternalPreview = () => {
    if (externalPreviewWindowRef.current && !externalPreviewWindowRef.current.closed) {
      externalPreviewWindowRef.current.focus();
      return;
    }
    const popup = window.open('', 'metadrive-page-preview', 'popup=yes,width=1280,height=860,resizable=yes,scrollbars=yes');
    if (!popup) { onNotify('Please allow the page preview popup in your browser.'); return; }
    externalPreviewWindowRef.current = popup;
    popup.document.title = `${page.label} — Preview`;
    for (const sheet of Array.from(document.querySelectorAll('link[rel="stylesheet"],style'))) {
      popup.document.head.appendChild(sheet.cloneNode(true));
    }
    popup.document.body.style.margin = '0';
    const container = popup.document.createElement('main');
    container.id = 'metadrive-popup-preview';
    popup.document.body.appendChild(container);
    popup.addEventListener('beforeunload', () => {
      if (externalPreviewWindowRef.current === popup) {
        externalPreviewWindowRef.current = null;
        setExternalPreviewTarget(null);
      }
    });
    setExternalPreviewTarget(container);
  };

  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [dynamicFormsUpgradeOpen, setDynamicFormsUpgradeOpen] = useState(false);
  const [migrationLayoutId, setMigrationLayoutId] = useState('');
  const [fitCanvas, setFitCanvas] = useState(true);
  const [fitScale, setFitScale] = useState(1);
  const pagePreviewAreaRef = useRef<HTMLDivElement | null>(null);
  const [canvasRefreshKey, setCanvasRefreshKey] = useState(0);
  const [createPageOpen, setCreatePageOpen] = useState(false);
  const [routeDirectoryOpen, setRouteDirectoryOpen] = useState(false);
  const [dependenciesOpen, setDependenciesOpen] = useState(false);
  const [newPageLabel, setNewPageLabel] = useState('');
  const [newPageType, setNewPageType] = useState<LightningPageMetadata['pageType']>('Record Page');
  const [newPageTemplate, setNewPageTemplate] = useState<LightningPageTemplate>('header-main-sidebar');
  const [newPageLayoutMode, setNewPageLayoutMode] = useState<LightningPageMetadata['layoutMode']>('template');
  const [newPageTargetObject, setNewPageTargetObject] = useState(page.targetObject || objects[0]?.apiName || '');
  const [newPageAppId, setNewPageAppId] = useState('');
  const [newPageDevices, setNewPageDevices] = useState<Array<'Desktop' | 'Phone'>>(['Desktop']);
  const [newPageDeviceChoice, setNewPageDeviceChoice] = useState<'Desktop' | 'Tablet' | 'Phone'>('Desktop');
  const [newPageCanvasWidth, setNewPageCanvasWidth] = useState(1440);
  const [newPageCanvasHeight, setNewPageCanvasHeight] = useState(900);
  const [dragOverId, setDragOverId] = useState('');
  const [undoStack, setUndoStack] = useState<LightningPageMetadata[]>([]);
  const [redoStack, setRedoStack] = useState<LightningPageMetadata[]>([]);
  type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  const canvasResizeStart = useRef<{ id: string; pointerId: number; pointerX: number; pointerY: number; x: number; y: number; width: number; height: number; edge: ResizeEdge } | null>(null);
  const [canvasResizePreview, setCanvasResizePreview] = useState<{ id: string; x: number; y: number; width: number; height: number } | null>(null);
  const canvasSnap = false;
  const canvasMoveStart = useRef<{
    id: string; pointerId: number; pointerX: number; pointerY: number;
    original: { x: number; y: number; width: number; height: number };
    element: HTMLElement; x: number; y: number;
  } | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'Overview' | 'Design' | 'Data & Actions'>('Overview');
  const [componentClipboard, setComponentClipboard] = useState<PageComponentMetadata | null>(null);
  const [recordScope, setRecordScope] = useState<PageActivationAssignmentMetadata['scope']>('Org Default');
  const [recordAppId, setRecordAppId] = useState(builderAppApiName || apps[0]?.apiName || '');
  const [recordProfileId, setRecordProfileId] = useState('');
  const [recordTypeId, setRecordTypeId] = useState('');
  const [recordFormFactors, setRecordFormFactors] = useState<Array<'Desktop' | 'Phone'>>(['Desktop']);
  const [homeAppId, setHomeAppId] = useState(apps[0]?.apiName ?? '');
  const [homeScope, setHomeScope] = useState<'App Default' | 'App and Profile'>('App Default');
  const [homeProfileId, setHomeProfileId] = useState('');
  const [homeFormFactors, setHomeFormFactors] = useState<Array<'Desktop' | 'Phone'>>(['Desktop']);
  const [saving, setSaving] = useState(false);
  const fields = targetObject?.fields ?? [];
  const pageLayouts = targetObject?.pageLayouts ?? [];
  const selected = page.components.find((component) => component.id === selectedId);
  // Metadata pages may hydrate after PageBuilder mounts; select their first
  // component when records arrive so the inspector is immediately usable.
  useEffect(() => {
    if (pageSettingsOpen || page.components.length === 0) return;
    if (!page.components.some(component => component.id === selectedId)) {
      setSelectedId(page.components[0].id);
    }
  }, [page.apiName, page.components.length]);
  const selectedCustomDefinition = selected?.type.startsWith('Custom:')
    ? libraryComponents.find((item) => item.apiName === selected.type.slice('Custom:'.length))
    : undefined;
  const selectedComponentDescription = selectedCustomDefinition?.description
    ?? standardPageComponents.find((component) => component.apiName === selected?.type)?.description
    ?? (selected?.type === 'Field Section' ? 'Group record fields into a configurable section.' : '');
  const assignedMigrationLayout = pageLayouts.find((layout) =>
    layout.id === targetObject?.pageLayoutAssignments?.[0]?.pageLayoutId) ?? pageLayouts[0];
  const selectedMigrationLayout = pageLayouts.find((layout) => layout.id === migrationLayoutId) ?? assignedMigrationLayout;
  const dynamicFormsEnabled = page.components.some((component) => component.type === 'Field Section' || component.type === 'Record Field');
  const paletteComponents = [
    ...layoutTypes.map((type) => ({ id: type, type, label: type, description: `Nest components inside a ${type.toLowerCase()} layout.`, categories: ['Layout'] as (typeof pageBuilderPaletteCategories)[number][] })),
    ...(page.layoutMode === 'template' ? standardPageComponents
      .filter((component) => availableComponents.includes(component.apiName))
      .map((component) => ({
        id: component.apiName,
        type: component.apiName,
        label: component.label,
        description: component.description,
        categories: getPageBuilderComponentCategories(component.apiName, component.label, component.description, true)
      })) : []),
    ...(page.layoutMode === 'template' && dynamicFormsEnabled ? [{
      id: 'Field Section',
      type: 'Field Section',
      label: 'Field Section',
      description: 'Group selected record fields into a one- or two-column section.',
      categories: ['Layout'] as (typeof pageBuilderPaletteCategories)[number][]
    }] : []),
    ...libraryComponents.filter((component) => component.surfaces.includes('page')).map((component) => ({
      id: `Custom:${component.apiName}`,
      type: `Custom:${component.apiName}`,
      label: component.label,
      description: component.description,
      categories: getPageBuilderComponentCategories(component.apiName, component.label, component.description)
    }))
  ];
  const filteredPaletteComponents = paletteComponents.filter((component) => {
    const inCategory = paletteCategory === 'All Components'
      || (paletteCategory === 'Favourites'
        ? favouriteComponents.includes(component.id)
        : component.categories.includes(paletteCategory));
    const searchContent = `${component.label} ${component.id} ${component.description} ${component.categories.join(' ')}`.toLowerCase();
    return inCategory && searchContent.includes(paletteSearch.trim().toLowerCase());
  });
  const toggleFavourite = (componentId: string) => setFavouriteComponents((current) =>
    current.includes(componentId) ? current.filter((item) => item !== componentId) : [...current, componentId]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('metadrive:page-builder:favourites');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
          throw new Error('Saved favourites are not a list of component IDs.');
        }
        setFavouriteComponents(parsed);
      }
    } catch (failure) {
      onNotify(`Unable to load component favourites: ${failure instanceof Error ? failure.message : 'Browser storage is unavailable.'}`);
    } finally {
      setFavouritesLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!favouritesLoaded) return;
    try {
      window.localStorage.setItem('metadrive:page-builder:favourites', JSON.stringify(favouriteComponents));
    } catch (failure) {
      onNotify(`Unable to save component favourites: ${failure instanceof Error ? failure.message : 'Browser storage is unavailable.'}`);
    }
  }, [favouriteComponents, favouritesLoaded]);
  useEffect(() => {
    const savedIdentityExists = pages.some((item) => item.apiName === savedPageApiName.current);
    const currentIdentityExists = pages.some((item) => item.apiName === page.apiName);
    if (!savedIdentityExists && currentIdentityExists) savedPageApiName.current = page.apiName;
  }, [page.apiName, pages]);
  useEffect(() => {
    setCustomPropertiesDraft(selected?.type.startsWith('Custom:') ? JSON.stringify(selected.properties, null, 2) : '');
    setCustomPropertiesError('');
  }, [selected?.id, selected?.type]);
  useEffect(() => {
    setSelectedId(page.components[0]?.id ?? '');
    setPaletteTab('Components');
    // Render the saved page at its fixed device size; no editor device switch.
    setFitCanvas(true);
    setUndoStack([]);
    setRedoStack([]);
    setPreviewMode(false);
    setPageSettingsOpen(false);
    setDynamicFormsUpgradeOpen(false);
    setMigrationLayoutId('');
  }, []);
  useEffect(() => {
    setFitCanvas(true);
  }, [page.apiName]);
  useEffect(() => {
    const previewArea = pagePreviewAreaRef.current;
    if (!fitCanvas || page.layoutMode !== 'free-canvas' || !previewArea) {
      setFitScale(1);
      return;
    }
    const updateScale = () => {
      const availableWidth = Math.max(1, previewArea.clientWidth - 72);
      setFitScale(canvasScaleToFitWidth(page.canvasWidth, availableWidth));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(previewArea);
    return () => observer.disconnect();
  }, [fitCanvas, page.layoutMode, page.canvasWidth, page.canvasHeight]);
  useEffect(() => {
    if (page.pageType !== 'Record Page') setPaletteTab('Components');
  }, [page.pageType]);
  useEffect(() => {
    if (builderAppApiName) setRecordAppId(builderAppApiName);
  }, [builderAppApiName]);
  const selectSavedPage = (apiName: string) => {
    savedPageApiName.current = apiName;
    onSelectPage(apiName);
  };
  const changeTargetObject = (apiName: string) => {
    const existingPage = pages.find((item) => item.pageType === 'Record Page' && item.targetObject === apiName);
    const nextApiName = existingPage?.apiName ?? `${apiName.replace(/__c$/, '')}_Record_Page`;
    const nextObject = objects.find((item) => item.apiName === apiName);
    savedPageApiName.current = nextApiName;
    setMigrationLayoutId(nextObject?.pageLayoutAssignments?.[0]?.pageLayoutId ?? nextObject?.pageLayouts?.[0]?.id ?? '');
    onTargetObjectChange(apiName);
  };
  const applyPage = (nextPage: LightningPageMetadata) => {
    if (JSON.stringify(page) === JSON.stringify(nextPage)) return;
    setUndoStack((current) => [...current.slice(-49), page]);
    setRedoStack([]);
    onChange(nextPage);
  };
  const updateComponent = (id: string, update: Partial<LightningPageMetadata['components'][number]>) => {
    const target = page.components.find(component => component.id === id);
    if (!target) return;
    // Lock prevents accidental edits; an explicit unlock is always allowed.
    if (isCanvasLocked(target) && update.properties?.editorLocked !== false) return;
    applyPage({ ...page, components: page.components.map((component) => component.id === id ? { ...component, ...update } : component) });
  };
  const toggleCanvasLock = (component: PageComponentMetadata) =>
    updateComponent(component.id, { properties: { ...component.properties, editorLocked: !isCanvasLocked(component) } });
  const moveLayer = (id: string, offset: -1 | 1) => {
    const index = page.components.findIndex(component => component.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= page.components.length ||
      isCanvasLocked(page.components[index]) || isCanvasLocked(page.components[target])) return;
    const components = [...page.components];
    [components[index], components[target]] = [components[target], components[index]];
    applyPage({ ...page, components });
  };
  const wrapSelectedInContainer = () => {
    if (!selected || !selected.position || isCanvasLocked(selected) || rawLayoutParentId(selected)) return;
    const groupId = 'group-' + crypto.randomUUID();
    applyPage({ ...page, components: wrapCanvasComponent(page.components, selected.id, groupId) });
    setSelectedId(groupId);
    setPaletteTab('Layers');
  };
  const ungroupSelected = () => {
    if (!selected || selected.type !== 'Container' || isCanvasLocked(selected)) return;
    const children = childrenOf(page.components, selected.id);
    if (!children.length || children.some(isCanvasLocked)) return;
    applyPage({ ...page, components: ungroupCanvasComponent(page.components, selected.id) });
    setSelectedId(children[0].id);
  };
  const startComponentPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    paletteResizeStart.current = { pointerId: event.pointerId, pointerX: event.clientX, width: componentPanelWidth };
  };
  const moveComponentPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = paletteResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setComponentPanelWidth(Math.min(440, Math.max(220, start.width + event.clientX - start.pointerX)));
  };
  const endComponentPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (paletteResizeStart.current?.pointerId === event.pointerId) paletteResizeStart.current = null;
  };
  const startPropertiesResize = (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); propertiesResizeStart.current = { pointerId: event.pointerId, pointerX: event.clientX, width: propertiesPanelWidth }; };
  const movePropertiesResize = (event: React.PointerEvent<HTMLButtonElement>) => { const start = propertiesResizeStart.current; if (start?.pointerId === event.pointerId) setPropertiesPanelWidth(Math.max(240, Math.min(520, start.width + start.pointerX - event.clientX))); };
  const endPropertiesResize = (event: React.PointerEvent<HTMLButtonElement>) => { if (propertiesResizeStart.current?.pointerId === event.pointerId) propertiesResizeStart.current = null; };
  const updateCustomProperties = (value: string) => {
    setCustomPropertiesDraft(value);
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Properties must be a JSON object.');
      }
      if (selected) updateComponent(selected.id, { properties: parsed as Record<string, unknown> });
      setCustomPropertiesError('');
    } catch (failure) {
      setCustomPropertiesError(failure instanceof Error ? failure.message : 'Enter valid JSON properties.');
    }
  };
  // Move only the selected DOM element while dragging. Commit metadata and
  // a single undo step on release, avoiding a page-wide render per pointer frame.
  const startCanvasMove = (event: React.PointerEvent<HTMLDivElement>, component: PageComponentMetadata) => {
    if (previewMode || !component.position || component.properties.canvasLocked === true
      || event.button !== 0 || canvasMoveStart.current) return;
    const element = event.currentTarget.closest<HTMLElement>('.free-canvas-component');
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasMoveStart.current = {
      id: component.id, pointerId: event.pointerId,
      pointerX: event.clientX, pointerY: event.clientY,
      original: { ...component.position }, element,
      x: component.position.x, y: component.position.y
    };
    setSelectedId(component.id);
    setPageSettingsOpen(false);
  };
  const moveCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = canvasMoveStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const scale = fitCanvas ? fitScale : 1;
    const x = start.original.x + canvasUnitsFromScreenDelta(event.clientX - start.pointerX, scale);
    const y = start.original.y + canvasUnitsFromScreenDelta(event.clientY - start.pointerY, scale);
    const next = canvasBoundPosition({ ...start.original, x, y },
      { width: page.canvasWidth, height: page.canvasHeight }, canvasSnap);
    start.x = next.x; start.y = next.y;
    start.element.style.transform =
      `translate(${next.x - start.original.x}px, ${next.y - start.original.y}px)`;
  };
  const endCanvasMove = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = canvasMoveStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    canvasMoveStart.current = null;
    start.element.style.transform = '';
    if (!cancelled && (start.x !== start.original.x || start.y !== start.original.y)) {
      updateComponent(start.id, { position: { ...start.original, x: start.x, y: start.y } });
    }
  };
  const reorderLayer = (id: string, direction: -1 | 1) => {
    const items = [...page.components];
    const index = items.findIndex(item => item.id === id);
    if (index < 0) return;
    const parent = rawLayoutParentId(items[index]);
    const siblings = items.map((item, position) => rawLayoutParentId(item) === parent ? position : -1).filter(position => position >= 0);
    const indexAmongSiblings = siblings.indexOf(index);
    const target = siblings[indexAmongSiblings + direction];
    if (target === undefined) return;
    [items[index], items[target]] = [items[target], items[index]];
    applyPage({ ...page, components: items });
  };
  const startCanvasResize = (event: React.PointerEvent<HTMLButtonElement>, component: PageComponentMetadata, edge: ResizeEdge) => {
    if (!component.position || component.properties.canvasLocked === true) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    canvasResizeStart.current = { id: component.id, pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY,
      x: component.position.x, y: component.position.y, width: component.position.width, height: component.position.height, edge };
    setSelectedId(component.id); setInspectorTab('Overview');
    setCanvasResizePreview({ id: component.id, ...component.position });
  };
  const moveCanvasResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = canvasResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const component = page.components.find(item => item.id === start.id);
    if (!component?.position) return;
    const definition = component.type.startsWith('Custom:') ? libraryComponents.find(item => item.apiName === component.type.slice('Custom:'.length)) : undefined;
    const minWidth = Math.min(start.width, definition?.resize?.minWidth ?? 20);
    const minHeight = Math.min(start.height, definition?.resize?.minHeight ?? 20);
    const dx = Math.round(canvasUnitsFromScreenDelta(event.clientX - start.pointerX, fitScale));
    const dy = Math.round(canvasUnitsFromScreenDelta(event.clientY - start.pointerY, fitScale));
    const west = start.edge.includes('w'), east = start.edge.includes('e'), north = start.edge.includes('n'), south = start.edge.includes('s');
    let x = start.x, y = start.y, width = start.width, height = start.height;
    if (east) width = Math.max(minWidth, Math.min(page.canvasWidth - start.x, start.width + dx));
    if (south) height = Math.max(minHeight, Math.min(page.canvasHeight - start.y, start.height + dy));
    if (west) { x = Math.max(0, Math.min(start.x + start.width - minWidth, start.x + dx)); width = start.width + start.x - x; }
    if (north) { y = Math.max(0, Math.min(start.y + start.height - minHeight, start.y + dy)); height = start.height + start.y - y; }
    setCanvasResizePreview({ id: start.id, x, y, width, height });
  };
  const endCanvasResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = canvasResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const size = canvasResizePreview?.id === start.id ? canvasResizePreview :
      { id: start.id, x: start.x, y: start.y, width: start.width, height: start.height };
    const component = page.components.find(item => item.id === start.id);
    if (component?.position) updateComponent(start.id, { position: { x:size.x, y:size.y, width:size.width, height:size.height } });
    canvasResizeStart.current = null; setCanvasResizePreview(null);
  };
  const hasOverlappingPageAssignment = (assignment: PageActivationAssignmentMetadata) =>
    (page.activationAssignments ?? []).some((existing) =>
      existing.scope === assignment.scope
      && existing.appId === assignment.appId
      && existing.profileId === assignment.profileId
      && existing.recordTypeId === assignment.recordTypeId
      && existing.formFactors.some((factor) => assignment.formFactors.includes(factor)));
  const addComponent = (type: string, position = page.components.length, region: 'header' | 'main' | 'sidebar' = 'main', canvasPosition?: PageComponentMetadata['position'], parentId: string | null = null) => {
    const customApiName = type.startsWith('Custom:') ? type.slice('Custom:'.length) : '';
    const custom = libraryComponents.find((item) => item.apiName === customApiName && item.surfaces.includes('page'));
    const dynamicFormComponent = type === 'Field Section' && page.pageType === 'Record Page' && dynamicFormsEnabled;
    if (!availableComponents.includes(type) && !custom && !dynamicFormComponent && !isLayoutType(type)) {
      onNotify(`Enable the matching object feature before adding the ${type} component`);
      return;
    }
    const id = `${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}`;
    const components = [...page.components];
    const defaultWidth = Math.min(page.canvasWidth, custom?.resize?.defaultWidth ?? 320);
    const defaultHeight = Math.min(page.canvasHeight, custom?.resize?.defaultHeight ?? 180);
    const freeCanvasPosition = page.layoutMode === 'free-canvas'
      ? {
        x: Math.min(canvasPosition?.x ?? 24 + (page.components.length * 24) % Math.max(1, page.canvasWidth - defaultWidth), page.canvasWidth - defaultWidth),
        y: Math.min(canvasPosition?.y ?? 24 + (page.components.length * 24) % Math.max(1, page.canvasHeight - defaultHeight), page.canvasHeight - defaultHeight),
        width: defaultWidth,
        height: defaultHeight
      }
      : undefined;
    components.splice(Math.max(0, Math.min(position, components.length)), 0, {
      id, type, label: custom?.label ?? type,
      properties: custom
        ? { libraryComponentId: custom.apiName, ...(parentId ? { layoutParentId: parentId } : {}) }
        : type === 'Report Chart'
          ? { reportApiName: '' }
          : type === 'Dashboard'
            ? { dashboardApiName: '' }
          : type === 'Related List'
            ? { relatedLists: defaultRelatedLists }
            : type === 'Field Section'
              ? { fieldApiNames: [], columns: 2 }
            : {},
      visible: true, parentId: parentId ?? undefined, region,
      ...(freeCanvasPosition ? { position: freeCanvasPosition } : {})
    });
    applyPage({ ...page, components });
    setSelectedId(id);
  };
  const addField = (fieldApiName: string) => {
    if (dynamicFormsEnabled) {
      const field = fields.find((item) => item.apiName === fieldApiName);
      if (!field) return;
      const id = `record-field-${crypto.randomUUID()}`;
      const component: PageComponentMetadata = {
        id,
        type: 'Record Field',
        label: field.label,
        properties: { fieldApiName },
        visible: true,
        region: 'main'
      };
      applyPage({ ...page, components: [...page.components, component] });
      setSelectedId(id);
      setPageSettingsOpen(false);
      return;
    }
    const detail = page.components.find((component) => component.type === 'Record Detail');
    if (!detail) {
      const id = `record-detail-${crypto.randomUUID()}`;
      applyPage({ ...page, components: [...page.components, { id, type: 'Record Detail', label: 'Record Detail', properties: { fields: [fieldApiName] }, visible: true }] });
      setSelectedId(id);
      return;
    }
    const currentFields = Array.isArray(detail.properties.fields) ? detail.properties.fields.filter((value): value is string => typeof value === 'string') : [];
    const nextFields = currentFields.includes(fieldApiName) ? currentFields.filter((value) => value !== fieldApiName) : [...currentFields, fieldApiName];
    updateComponent(detail.id, { properties: { ...detail.properties, fields: nextFields } });
    setSelectedId(detail.id);
  };
  const addFieldToSection = (sectionId: string, fieldApiName: string) => {
    const section = page.components.find((component) => component.id === sectionId && component.type === 'Field Section');
    if (!section) {
      addField(fieldApiName);
      return;
    }
    const fieldApiNames = stringList(section.properties.fieldApiNames, []);
    if (fieldApiNames.includes(fieldApiName)) return;
    updateComponent(sectionId, { properties: { ...section.properties, fieldApiNames: [...fieldApiNames, fieldApiName] } });
    setSelectedId(sectionId);
    setPageSettingsOpen(false);
  };
  const moveSectionField = (sectionId: string, fieldIndex: number, offset: -1 | 1) => {
    const section = page.components.find((component) => component.id === sectionId && component.type === 'Field Section');
    if (!section) return;
    const fieldApiNames = stringList(section.properties.fieldApiNames, []);
    const nextIndex = fieldIndex + offset;
    if (nextIndex < 0 || nextIndex >= fieldApiNames.length) return;
    [fieldApiNames[fieldIndex], fieldApiNames[nextIndex]] = [fieldApiNames[nextIndex]!, fieldApiNames[fieldIndex]!];
    updateComponent(sectionId, { properties: { ...section.properties, fieldApiNames } });
  };
  const upgradeRecordDetail = (recordDetail: PageComponentMetadata) => {
    if (!selectedMigrationLayout) {
      onNotify('Select a page layout before upgrading Record Detail to Dynamic Forms');
      return;
    }
    const sections = selectedMigrationLayout.sections.map((section) => ({
      id: `field-section-${crypto.randomUUID()}`,
      type: 'Field Section',
      label: section.label,
      properties: {
        fieldApiNames: [...new Set(section.fieldApiNames.filter((fieldApiName) => fields.some((field) => field.apiName === fieldApiName)))],
        columns: section.columns
      },
      visible: true,
      region: recordDetail.region ?? 'main' as const
    }));
    const migratedSections = sections.length ? sections : [{
      id: `field-section-${crypto.randomUUID()}`,
      type: 'Field Section',
      label: 'Record Details',
      properties: { fieldApiNames: stringList(recordDetail.properties.fields, fields.slice(0, 6).map((field) => field.apiName)), columns: 2 },
      visible: true,
      region: recordDetail.region ?? 'main' as const
    }];
    const componentIndex = page.components.findIndex((component) => component.id === recordDetail.id);
    const components = [...page.components];
    components.splice(componentIndex, 1, ...migratedSections);
    applyPage({ ...page, components });
    setSelectedId(migratedSections[0].id);
    setDynamicFormsUpgradeOpen(false);
    onNotify(`Record Detail upgraded from ${selectedMigrationLayout.label}`);
  };
  const removeSelected = () => {
    if (!selected || isCanvasLocked(selected)) return;
    const parentId = rawLayoutParentId(selected);
    const remaining = page.components.filter((component) => component.id !== selected.id)
      .map((component) => rawLayoutParentId(component) === selected.id
        ? { ...component, properties: {
            ...component.properties,
            ...(parentId ? { layoutParentId: parentId } : { layoutParentId: undefined })
          } }
        : component);
    applyPage({ ...page, components: remaining });
    setSelectedId(parentId ?? remaining[0]?.id ?? '');
  };
  const addRecordAssignment = () => {
    const needsApp = recordScope !== 'Org Default';
    const needsProfile = recordScope === 'App and Profile' || recordScope === 'App, Record Type, and Profile';
    const needsRecordType = recordScope === 'App, Record Type, and Profile';
    const availableRecordTypes = (targetObject?.recordTypes ?? []).filter((recordType) => recordType.active);
    const formFactors = recordFormFactors.filter((factor) => page.devices.includes(factor));
    if (!formFactors.length
      || (needsApp && !recordAppId)
      || (needsProfile && !recordProfileId)
      || (needsRecordType && !availableRecordTypes.some((recordType) => recordType.id === recordTypeId))) {
      onNotify('Choose all required assignment values and at least one supported form factor');
      return;
    }
    const assignment: PageActivationAssignmentMetadata = {
      id: `record-activation-${crypto.randomUUID()}`,
      scope: recordScope,
      appId: needsApp ? recordAppId : null,
      profileId: needsProfile ? recordProfileId : null,
      recordTypeId: needsRecordType ? recordTypeId : null,
      formFactors
    };
    if (hasOverlappingPageAssignment(assignment)) {
      onNotify('An activation assignment already exists for this target and form factor');
      return;
    }
    applyPage({ ...page, activationAssignments: [...(page.activationAssignments ?? []), assignment] });
  };
  const addHomeAssignment = () => {
    const formFactors = homeFormFactors.filter((factor) => page.devices.includes(factor));
    if (!homeAppId || !formFactors.length || (homeScope === 'App and Profile' && !homeProfileId)) {
      onNotify('Choose an app, form factor, and profile when required');
      return;
    }
    const assignment: PageActivationAssignmentMetadata = {
      id: `home-activation-${crypto.randomUUID()}`,
      scope: homeScope,
      appId: homeAppId,
      profileId: homeScope === 'App and Profile' ? homeProfileId : null,
      recordTypeId: null,
      formFactors
    };
    if (hasOverlappingPageAssignment(assignment)) {
      onNotify('An activation assignment already exists for this app, profile, and form factor');
      return;
    }
    applyPage({ ...page, activationAssignments: [...(page.activationAssignments ?? []), assignment] });
  };
  const removePageAssignment = (id: string) => {
    const activationAssignments = (page.activationAssignments ?? []).filter((assignment) => assignment.id !== id);
    applyPage({
      ...page,
      activationAssignments,
      status: page.status === 'Active' && !activationAssignments.length ? 'Draft' : page.status
    });
  };
  const copySelected = () => {
    if (selected) setComponentClipboard(structuredClone(selected));
  };
  const cutSelected = () => {
    if (!selected || isCanvasLocked(selected)) return;
    setComponentClipboard(structuredClone(selected));
    removeSelected();
  };
  const pasteComponent = () => {
    if (!componentClipboard) return;
    const pasted: PageComponentMetadata = {
      ...structuredClone(componentClipboard),
      id: `${componentClipboard.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}`,
      label: `${componentClipboard.label} Copy`,
      region: selected?.region ?? componentClipboard.region ?? 'main',
      properties: { ...structuredClone(componentClipboard.properties), layoutParentId: selected && canNest(page.components, componentClipboard.id, selected.id) ? selected.id : undefined }
    };
    const components = [...page.components];
    const selectedIndex = selected ? components.findIndex((component) => component.id === selected.id) : -1;
    components.splice(selectedIndex < 0 ? components.length : selectedIndex + 1, 0, pasted);
    applyPage({ ...page, components });
    setSelectedId(pasted.id);
  };
  const moveSelected = (offset: -1 | 1) => { if (selected) moveLayer(selected.id, offset); };
  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((current) => [...current, page]);
    setUndoStack((current) => current.slice(0, -1));
    onChange(previous);
    setSelectedId(previous.components[0]?.id ?? '');
  };
  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack((current) => [...current, page]);
    setRedoStack((current) => current.slice(0, -1));
    onChange(next);
    setSelectedId(next.components[0]?.id ?? '');
  };
  useEffect(() => {
    if (page.layoutMode !== 'free-canvas') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented || (target instanceof HTMLElement &&
        (['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || target.isContentEditable))) return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (command && key === 'c' && selected && !previewMode) {
        event.preventDefault(); copySelected();
      } else if (command && key === 'v' && componentClipboard && !previewMode) {
        event.preventDefault(); pasteComponent();
      } else if (!command && (event.key === 'Delete' || event.key === 'Backspace')
        && selected && !previewMode && !isCanvasLocked(selected)) {
        event.preventDefault(); removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const savePage = async (status?: 'Active' | 'Draft', candidate: LightningPageMetadata = page, returnToList = false) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(candidate.apiName)) {
      onNotify('API Name must start with a letter and contain only letters, numbers, and underscores');
      return;
    }
    if (pages.some((item) => item.apiName.toLowerCase() === candidate.apiName.toLowerCase()
      && item.apiName !== savedPageApiName.current)) {
      onNotify('A Lightning page with this API name already exists');
      return;
    }
    if (status === 'Active' && candidate.pageType === 'Record Page' && !candidate.activationAssignments?.length) {
      onNotify('Add at least one activation assignment before activating this record page');
      return;
    }
    if (status === 'Active' && candidate.pageType === 'Home Page' && !candidate.activationAssignments?.length) {
      onNotify('Assign this Home Page to an app or app and profile before activating it');
      return;
    }
    if (status === 'Active' && candidate.pageType === 'App Page' && apps.length === 0) {
      onNotify('Create a Lightning app before activating an App Page');
      return;
    }
    const nextPage = status ? { ...candidate, status } : page;
    setSaving(true);
    try {
      const saved = await onSave(nextPage, candidate.apiName);
      if (saved) {
        if (nextPage.status === 'Active' && nextPage.pageType === 'App Page') {
          const targetAppId = builderAppApiName || preparedAppId;
          const destinationApp = apps.find(item => item.apiName === targetAppId);
          if (destinationApp && !destinationApp.navigationPageApiNames.includes(nextPage.apiName)) {
            const navigationPageApiNames = [...destinationApp.navigationPageApiNames, nextPage.apiName];
            try {
              await onSaveApp({
                ...destinationApp, navigationPageApiNames,
                navigationOrder: reconcileNavigationOrder(
                  destinationApp.navigationItems, navigationPageApiNames, destinationApp.navigationOrder
                )
              }, true);
              onAppLinked(nextPage.apiName);
            } catch (error) {
              onNotify(error instanceof Error ? error.message : 'Page activated, but app navigation could not be updated');
            }
          } else if (destinationApp) onAppLinked(nextPage.apiName);
        }
        savedPageApiName.current = nextPage.apiName;
        setUndoStack([]);
        setRedoStack([]);
        if (returnToList) onBackToPages();
      }
    } finally {
      setSaving(false);
    }
  };
  const clonePage = async () => {
    const baseApiName = `${page.apiName}_Copy`;
    let apiName = baseApiName;
    let suffix = 2;
    while (pages.some((item) => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      apiName = `${baseApiName}_${suffix}`;
      suffix += 1;
    }
    const cloned: LightningPageMetadata = {
      ...structuredClone(page),
      apiName,
      label: `${page.label} Copy`,
      updatedAt: undefined,
      status: 'Draft',
      activationAssignments: [],
      components: page.components.map((component) => ({
        ...component,
        id: `${component.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID()}`
      }))
    };
    setSaving(true);
    try {
      const saved = await onSave(cloned, apiName, 'Lightning page cloned as a new draft');
      if (saved) {
        savedPageApiName.current = apiName;
        setSelectedId(cloned.components[0]?.id ?? '');
        setPageSettingsOpen(cloned.components.length === 0);
        setPreviewMode(false);
        setUndoStack([]);
        setRedoStack([]);
      }
    } finally {
      setSaving(false);
    }
  };
  const pageDeviceLabel = (item: LightningPageMetadata) => item.canvasWidth <= 600 || (item.devices.length === 1 && item.devices[0] === 'Phone') ? 'Phone' : item.canvasWidth < 1400 ? 'Tablet' : 'Desktop';
  const visiblePages = pages.filter(item => (!pageListObject || item.targetObject === pageListObject) && `${item.label} ${item.apiName}`.toLowerCase().includes(pageListSearch.trim().toLowerCase())).sort((a,b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0));
  const openCreatePage = () => { setNewPageTargetObject(pageListObject || page.targetObject || objects[0]?.apiName || ''); setNewPageLayoutMode('free-canvas'); setNewPageType('Home Page'); setNewPageDeviceChoice('Desktop'); setNewPageDevices(['Desktop']); setNewPageCanvasWidth(1440); setNewPageCanvasHeight(900); setCreatePageOpen(true); };
  const createPage = async () => {
    if (saving) return;
    const label = newPageLabel.trim();
    if (!label) return;
    if (!objects.some(item => item.apiName === newPageTargetObject)) {
      onNotify('Choose an existing data object for the new page');
      return;
    }
    if (!newPageDevices.length) {
      onNotify('Choose at least one supported device');
      return;
    }
    const baseApiName = label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'New_Page';
    const apiName = /^[A-Za-z]/.test(baseApiName) ? baseApiName : `Page_${baseApiName}`;
    if (page.apiName.toLowerCase() === apiName.toLowerCase()
      || pages.some(item => item.apiName.toLowerCase() === apiName.toLowerCase())) {
      onNotify('A Lightning page with this API name already exists');
      return;
    }
    const nextPage: LightningPageMetadata = {
      apiName, label, targetObject: newPageTargetObject,
      pageType: newPageLayoutMode === 'free-canvas' ? 'Home Page' : newPageType,
      layoutMode: newPageLayoutMode, template: newPageTemplate,
      canvasWidth: newPageCanvasWidth,
      canvasHeight: newPageCanvasHeight,
      status: 'Draft', devices: [...newPageDevices], components: [],
      // App Pages belong to app navigation; only Record/Home pages use activation assignments.
      activationAssignments: newPageAppId && newPageType !== 'App Page'
        ? [{
          id: crypto.randomUUID(), scope: 'App Default', appId: newPageAppId,
          profileId: null, recordTypeId: null, formFactors: [...newPageDevices]
        }] : []
    };
    setSaving(true);
    try {
      // Persist first: the route resolver must never replace a new unsaved page
      // with the previously selected page on its next metadata refresh.
      if (newPageAppId) onPrepareApp(apiName, newPageAppId);
      const saved = await onSave(nextPage, apiName, 'Lightning page draft created');
      if (!saved) { onAppLinked(apiName); return; }
      savedPageApiName.current = apiName;
      if (newPageAppId) setBuilderAppApiName(newPageAppId);
      setSelectedId('');
      setPageSettingsOpen(true);
      setCreatePageOpen(false);
      setNewPageLabel('');
      setUndoStack([]);
      setRedoStack([]);
      setPreviewMode(false);
    } finally {
      setSaving(false);
    }
  };
  const setPageTemplate = (nextTemplate: LightningPageTemplate) => {
    const definition = pageTemplates.find((item) => item.id === nextTemplate);
    if (!definition) return;
    const availableRegions = new Set(definition.regions);
    applyPage({
      ...page,
      template: nextTemplate,
      components: page.components.map((component) => ({
        ...component,
        region: availableRegions.has(component.region ?? 'main') ? component.region ?? 'main' : 'main'
      }))
    });
  };
  const setPageLayoutMode = (layoutMode: LightningPageMetadata['layoutMode']) => {
    if (layoutMode === 'free-canvas') {
      if (page.pageType !== 'Home Page') {
        onNotify('Free Canvas is available on Home Pages. Create a Home Page to use it.');
        return;
      }
      if (page.components.some((component) => !component.type.startsWith('Custom:'))) {
        onNotify('Remove standard components before switching this page to Free Canvas');
        return;
      }
      applyPage({
        ...page,
        layoutMode,
        components: page.components.map((component, index) => ({
          ...component,
          position: component.position ?? {
            x: Math.min(24 + index * 24, page.canvasWidth - 320),
            y: Math.min(24 + index * 24, page.canvasHeight - 180),
            width: 320,
            height: 180
          }
        }))
      });
    } else {
      applyPage({ ...page, layoutMode });
    }
  };
  const canvasPositionFromEvent = (event: React.DragEvent<HTMLElement>, width = 320, height = 180) => {
    const canvas = event.currentTarget.closest('.page-stage')?.querySelector<HTMLElement>('.free-canvas-stage');
    if (!canvas) return undefined;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = page.canvasWidth / bounds.width;
    const scaleY = page.canvasHeight / bounds.height;
    const bound = canvasBoundPosition({
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
      width, height
    }, { width: page.canvasWidth, height: page.canvasHeight }, canvasSnap);
    return { ...bound, width, height };
  };
  const moveCanvasComponent = (event: React.DragEvent<HTMLElement>, component: PageComponentMetadata) => {
    if (page.layoutMode !== 'free-canvas' || previewMode) return;
    const nextPosition = canvasPositionFromEvent(event, component.position?.width ?? 320, component.position?.height ?? 180);
    if (!nextPosition || !component.position) return;
    updateComponent(component.id, {
      position: {
        ...component.position,
        x: Math.min(nextPosition.x, page.canvasWidth - component.position.width),
        y: Math.min(nextPosition.y, page.canvasHeight - component.position.height)
      }
    });
  };
  const handleDrop = (event: React.DragEvent<HTMLElement>, targetIndex = page.components.length, region: 'header' | 'main' | 'sidebar' = 'main', parentId: string | null = null) => {
    event.preventDefault();
    event.stopPropagation();
    const data = event.dataTransfer.getData('text/plain');
    setDragOverId('');
    if (data.startsWith('component:')) {
      const draggedId = event.dataTransfer.getData('application/x-metadrive-component-id');
      if (!draggedId) {
        addComponent(data.slice('component:'.length), targetIndex, region,
          page.layoutMode === 'free-canvas' ? canvasPositionFromEvent(event) : undefined, parentId);
        return;
      }
      const dragged = page.components.find(item => item.id === draggedId);
      if (dragged?.properties.canvasLocked === true) {
        onNotify('Unlock this component before moving it.');
        return;
      }
      if (!canNest(page.components, draggedId, parentId)) {
        onNotify('Cannot nest a component inside itself or one of its descendants.');
        return;
      }
      if (page.layoutMode === 'free-canvas') {
        const draggedComponent = page.components.find((component) => component.id === draggedId);
        if (!draggedComponent || isCanvasLocked(draggedComponent)) return;
        const reparented = reparentComponent(page.components, draggedId, parentId);
        const position = !parentId ? canvasPositionFromEvent(event,
          draggedComponent.position?.width ?? 320, draggedComponent.position?.height ?? 180) : undefined;
        applyPage({ ...page, components: reparented.map((item) =>
          item.id === draggedId && position && item.position
            ? { ...item, position: {
                ...item.position,
                x: position.x,
                y: position.y
              } } : item) });
        setSelectedId(draggedId);
        return;
      }
      const sourceIndex = page.components.findIndex((component) => component.id === draggedId);
      if (sourceIndex < 0) return;
      const components = [...page.components];
      if (isCanvasLocked(components[sourceIndex])) return;
      const [draggedComponent] = components.splice(sourceIndex, 1);
      if (!draggedComponent) return;
      const targetElement = event.currentTarget;
      const isComponentTarget = targetElement.classList.contains('record-component');
      const insertAfterTarget = isComponentTarget
        && event.clientY > targetElement.getBoundingClientRect().top + targetElement.getBoundingClientRect().height / 2;
      const dropIndex = targetIndex + (insertAfterTarget ? 1 : 0);
      const insertionIndex = sourceIndex < dropIndex ? dropIndex - 1 : dropIndex;
      components.splice(Math.max(0, Math.min(insertionIndex, components.length)), 0, { ...draggedComponent, parentId: undefined, region });
      applyPage({ ...page, components: reparentComponent(components, draggedId, parentId) });
      setSelectedId(draggedId);
    } else if (data.startsWith('field:')) {
      const sectionId = event.currentTarget.getAttribute('data-component-id');
      if (sectionId && page.components.some((component) => component.id === sectionId && component.type === 'Field Section')) {
        addFieldToSection(sectionId, data.slice('field:'.length));
      } else {
        addField(data.slice('field:'.length));
      }
    }
  };
  const renderPageComponent = (component: LightningPageMetadata['components'][number], index: number, libraryPreview = false, interactivePreview = false) => {
    if (!component.visible) return null;
    const customDefinition = component.type.startsWith('Custom:')
      ? libraryComponents.find((item) => item.apiName === component.type.slice('Custom:'.length))
      : undefined;
    const inPage = page.components.some((item) => item.id === component.id);
    const nested = inPage && !childrenOf(page.components, null).some((item) => item.id === component.id);
    const nestedChildren = isLayoutContainer(component) && (!libraryPreview || interactivePreview)
      ? childrenOf(page.components, component.id).map((child) =>
          renderPageComponent(child, page.components.findIndex((item) => item.id === child.id), libraryPreview, interactivePreview))
      : undefined;
    const visualStyle = resolvePageComponentStyle(component.properties, component.type, device);
    const previewProperties = createComponentPreviewProps(
      customDefinition?.apiName ?? component.type,
      component.label,
      customDefinition?.description ?? selectedComponentDescription
    );
    const customPreviewProps = {
      ...previewProperties,
      ...component.properties,
      ...componentLayoutProps(component.properties, device),
      label: component.label,
      properties: component.properties,
      object: page.pageType === 'Record Page' ? targetObject : undefined,
      device,
      preview: true,
      disabled: true,
      onAction: previewProperties.onAction,
      onChange: previewProperties.onChange,
      onNavigate: previewProperties.onNavigate,
      children: nestedChildren
    };
    const accordionContent = typeof component.properties.content === 'string' && component.properties.content.trim()
      ? component.properties.content
      : 'Review account details to confirm renewal dates and billing preferences.';
    return <div
      key={component.id}
      ref={libraryPreview && !interactivePreview ? (element) => { if (element) element.inert = true; } : undefined}
      className={`record-component ${(!libraryPreview || interactivePreview) && page.layoutMode === 'free-canvas' ? 'free-canvas-component' : ''} ${isCanvasLocked(component) ? 'canvas-component-locked' : ''} ${nested ? 'nested-page-component' : ''} ${isLayoutContainer(component) ? 'layout-container-component' : ''} ${libraryPreview ? 'component-rendered-preview' : ''} ${selectedId === component.id && !previewMode && !libraryPreview ? 'selected' : ''} ${dragOverId === component.id && !libraryPreview ? 'drop-target' : ''}`}
      style={{
        ...((!libraryPreview || interactivePreview) && page.layoutMode === 'free-canvas'
          ? nested
            ? { position: 'relative', left: 'auto', top: 'auto', width: '100%', height: 'auto', minHeight: 40 }
            : {
                left: canvasResizePreview?.id === component.id ? canvasResizePreview.x : component.position?.x ?? 0,
                top: canvasResizePreview?.id === component.id ? canvasResizePreview.y : component.position?.y ?? 0,
                width: canvasResizePreview?.id === component.id ? canvasResizePreview.width : component.position?.width ?? customDefinition?.resize?.defaultWidth ?? 320,
                height: canvasResizePreview?.id === component.id ? canvasResizePreview.height : component.position?.height ?? customDefinition?.resize?.defaultHeight ?? 180
              }
          : {}),
        ...visualStyle,
        ...(component.properties?.fillRegion===true && page.layoutMode==='template' ? {height:'100%',minHeight:0}: {})
      } as React.CSSProperties}
      onClick={!libraryPreview ? (event) => { event.stopPropagation(); if (!previewMode) { setSelectedId(component.id); setPageSettingsOpen(false); } } : undefined}
      onClickCapture={libraryPreview && !interactivePreview ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
      onKeyDown={!libraryPreview ? (event) => {
         if (event.currentTarget !== event.target || previewMode) return;
         if (event.key === 'Enter' || event.key === ' ') {
           event.preventDefault(); setSelectedId(component.id); setPageSettingsOpen(false);
         } else if (page.layoutMode === 'free-canvas' && component.position && !nested && component.properties.canvasLocked !== true
           && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
           event.preventDefault();
           const delta = event.shiftKey ? 1 : canvasSnap ? 8 : 1;
           const pos = component.position;
           const x = pos.x + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0);
           const y = pos.y + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0);
           updateComponent(component.id, { position: {
             ...pos, x: Math.max(0, Math.min(page.canvasWidth - pos.width, x)),
             y: Math.max(0, Math.min(page.canvasHeight - pos.height, y))
           } });
         }
       } : undefined}
      onDragOver={!libraryPreview ? (event) => { event.preventDefault(); event.stopPropagation(); setDragOverId(isLayoutContainer(component) ? component.id : rawLayoutParentId(component) ?? component.id); } : undefined}
      onDragLeave={!libraryPreview ? () => setDragOverId('') : undefined}
      onDrop={!libraryPreview ? (event) => handleDrop(event, index, component.region ?? 'main', isLayoutContainer(component) ? component.id : rawLayoutParentId(component)) : undefined}
      draggable={!previewMode && !libraryPreview && !isCanvasLocked(component)}
      data-component-id={libraryPreview ? undefined : component.id}
      onDragStart={!libraryPreview ? (event) => { if (component.properties.canvasLocked === true || canvasMoveStart.current?.id === component.id) { event.preventDefault(); return; } event.stopPropagation(); event.dataTransfer.setData('text/plain', `component:${component.type}`); event.dataTransfer.setData('application/x-metadrive-component-id', component.id); } : undefined}
      role={libraryPreview ? undefined : page.layoutMode === 'free-canvas' ? 'group' : 'button'} tabIndex={previewMode || libraryPreview ? -1 : 0} aria-label={libraryPreview ? undefined : `${component.label} component`}
      aria-hidden={libraryPreview && !interactivePreview || undefined}
    >
      {!previewMode && !libraryPreview && <div className="record-component-head"
        data-canvas-move-handle={page.layoutMode === 'free-canvas' && !nested ? component.id : undefined}
        onPointerDown={page.layoutMode === 'free-canvas' && !nested ? event => startCanvasMove(event, component) : undefined}
        onPointerMove={page.layoutMode === 'free-canvas' && !nested ? moveCanvasPointer : undefined}
        onPointerUp={page.layoutMode === 'free-canvas' && !nested ? event => endCanvasMove(event) : undefined}
        onPointerCancel={page.layoutMode === 'free-canvas' && !nested ? event => endCanvasMove(event, true) : undefined}>
        <GripVertical size={15} /><strong>{component.label}</strong><span>{component.type}</span>
        {component.properties.canvasLocked === true ? <Lock size={13} /> : <MoreHorizontal size={16} />}
      </div>}
      {isLayoutType(component.type)
        ? <div className="page-nested-layout" style={componentVisualStyle(component.properties.visualStyle, component.type, device)}>
          {directChildren(page.components, component.id).map((child) => renderPageComponent(child, page.components.indexOf(child), libraryPreview, interactivePreview))}
          {!libraryPreview && !previewMode && <div className="canvas-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const draggedId = event.dataTransfer.getData('application/x-metadrive-component-id'); if (draggedId && canNestComponent(page.components, draggedId, component.id)) { applyPage({ ...page, components: page.components.map((item) => item.id === draggedId ? { ...item, parentId: component.id } : item) }); } else if (!draggedId) { const type = event.dataTransfer.getData('text/plain').replace(/^component:/, ''); if (type) addComponent(type, page.components.length, component.region ?? 'main', undefined, component.id); } }}>Drop components inside {component.label}</div>}
        </div>
        : component.type === 'Record Detail'
        ? <div className="record-detail-grid">{(Array.isArray(component.properties.fields) ? component.properties.fields : fields.slice(0, 6).map((field) => field.apiName)).map((apiName) => { const field = fields.find((item) => item.apiName === apiName); return field ? <div className="record-detail-field" key={apiName}><small>{field.label}</small><span>{field.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</span></div> : null; })}</div>
        : component.type === 'Field Section'
          ? <div className={`record-detail-grid columns-${component.properties.columns === 1 ? 1 : 2}`}>{stringList(component.properties.fieldApiNames, []).map((apiName) => fields.find((field) => field.apiName === apiName)).filter((field): field is FieldMetadata => Boolean(field)).map((field) => <div className="record-detail-field" key={field.apiName}><small>{field.label}</small><span>{field.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</span></div>)}</div>
          : component.type === 'Record Field'
            ? (() => {
              const field = fields.find((item) => item.apiName === component.properties.fieldApiName);
              return <div className="record-detail-field"><small>{field?.label ?? component.label}</small><span>{field?.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</span></div>;
            })()
          : component.type === 'Related List'
          ? <div className="fake-related">{stringList(component.properties.relatedLists, defaultRelatedLists).map((list) => <span key={list}>{relatedListOptions.find((option) => option.apiName === list)?.label ?? list} <small>View all</small></span>)}</div>
          : component.type === 'Tabs'
            ? <div className="fake-tabs">{stringList(component.properties.tabs, ['Related', 'Details', 'News']).map((tab, tabIndex) => <span className={tabIndex === 0 ? 'selected-tab' : ''} key={`${tab}-${tabIndex}`}>{tab}</span>)}</div>
            : component.type === 'Highlights Panel'
              ? libraryPreview
                ? <div className="component-demo-highlights"><strong>Northwind Traders</strong><div><span>Account owner <b>Alex Morgan</b></span><span>Industry <b>Technology</b></span><span>Annual revenue <b>$2.4M</b></span></div></div>
                : <div className="component-content-hint">Record actions and key fields appear in the highlights panel.</div>
              : component.type === 'Dashboard'
                ? <div className="report-chart-preview" role="img" aria-label="Dashboard preview">
                    <strong>{dashboards.find((item) => item.apiName === component.properties.dashboardApiName)?.label ?? 'Choose a published dashboard'}</strong>
                    <div className="report-chart-bars"><span/><span/><span/><span/></div>
                  </div>
                : component.type === 'Report Chart'
                ? <div className="report-chart-preview">
                  <strong>{reports.find((report) => report.apiName === component.properties.reportApiName)?.label ?? 'Opportunities by stage'}</strong>
                  <div className="report-chart-bars"><span /><span /><span /><span /><span /></div>
                </div>
                : component.type === 'Accordion'
                  ? libraryPreview
                      ? <div className="component-demo-accordion"><strong>Account overview <ChevronDown size={12} /></strong><p>{accordionContent}</p><span>Billing and service details</span></div>
                      : <div className="component-demo-accordion"><strong>{component.label} <ChevronDown size={12} /></strong><p>{accordionContent}</p></div>
                  : component.type === 'Activities' && libraryPreview
                    ? <div className="component-demo-activity"><strong>Recent activity</strong><span>Call with Jordan Lee <small>Today · 10:30 AM</small></span><span>Follow-up email sent <small>Yesterday</small></span></div>
                    : component.type === 'Chatter' && libraryPreview
                      ? <div className="component-demo-activity"><strong>Latest update</strong><span>Alex Morgan shared a project update.</span><small>2 comments · 4 likes</small></div>
                  : customDefinition && !isLayoutContainer(component) && (!libraryPreview || interactivePreview) && typeof component.properties.objectApiName === 'string'
                    && component.properties.objectApiName
                    ? <MetadataBoundPageComponent definition={customDefinition} component={component}
                        objects={objects} apps={apps} pages={pages} currentAppId={builderAppApiName || apps[0]?.apiName || 'Records'}
                        pageSessionKey={(builderAppApiName || apps[0]?.apiName || 'Records') + ':' + page.apiName}
                        reports={reports} formFactor={device === 'Phone' ? 'Phone' : 'Desktop'}
                        availableFlows={flows.filter((flow) => ['Screen Flow', 'Autolaunched Flow'].includes(flow.flowType))}
                        onNavigate={() => {}} onLaunchFlow={(flowApiName: string, inputs: Record<string, unknown>) => { onLaunchFlow(flowApiName, inputs); externalPreviewWindowRef.current?.opener?.focus?.(); }} disableActions={!interactivePreview} />
                  : customDefinition
                    ? <RegisteredComponent definition={customDefinition} props={libraryPreview ? customPreviewProps : {
                      ...component.properties,
                      ...componentLayoutProps(component.properties, device),
                      label: component.label,
                      properties: component.properties,
                      object: page.pageType === 'Record Page' ? targetObject : undefined,
                      device,
                      children: nestedChildren
                    }} />
                    : libraryPreview
                      ? <div className="component-demo-fallback"><strong>{component.label}</strong><span>{selectedComponentDescription || 'Preview of a reusable page component.'}</span><div><i /><i /><i /></div></div>
                      : <div className="component-demo-fallback"><strong>{component.label}</strong><span>This component is no longer registered. Re-register it to restore its live preview.</span><div><i /><i /><i /></div></div>}
      {!libraryPreview && customDefinition && customDefinition.trustedBundled !== true && isLayoutContainer(component)
        && <div className="metadata-nested-host">{nestedChildren}</div>}
      {!libraryPreview && !previewMode && isLayoutContainer(component) && !nestedChildren?.length
        && <div className="page-nested-empty">Drop components into this {component.label} or choose a child from the palette</div>}
      {!libraryPreview && page.layoutMode === 'free-canvas' && !nested && selectedId === component.id && !previewMode && component.properties.canvasLocked !== true
        && (['n','ne','e','se','s','sw','w','nw'] as const).map(edge =>
          <button key={edge} type="button" className={`free-canvas-resize-handle resize-${edge}`}
            aria-label={`Resize ${component.label} ${edge}`} title="Drag edge or corner to resize"
            onPointerDown={event => startCanvasResize(event, component, edge)}
            onPointerMove={moveCanvasResize} onPointerUp={endCanvasResize} onPointerCancel={endCanvasResize}
            onClick={event => event.stopPropagation()}/>)}
    </div>;
  };
  const renderRegion = (region: 'header' | 'main' | 'sidebar') => {
    const regionComponents = page.components
      .map((component, index) => ({ component, index }))
      .filter(({ component }) => childrenOf(page.components, null).some((root) => root.id === component.id) && (component.region ?? 'main') === region);
    return <section
      className={`page-region page-region-${region}`}
      aria-label={`${region[0].toUpperCase()}${region.slice(1)} region`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => handleDrop(event, page.components.length, region)}
    >
      <div className="page-region-label">{region}</div>
      {regionComponents.map(({ component, index }) => renderPageComponent(component, index))}
      {!regionComponents.length && <div className="canvas-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, page.components.length, region)}><Plus size={15} /><span>{previewMode ? 'Empty region' : 'Drag components here or choose one from the left'}</span></div>}
      {regionComponents.length > 0 && !previewMode && <div className="canvas-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, page.components.length, region)}><Plus size={15} /><span>Drop here to add to {region}</span></div>}
    </section>;
  };
  const selectedRelatedLists = selected
    ? stringList(selected.properties.relatedLists, defaultRelatedLists)
    : defaultRelatedLists;
  const componentRelatedListOptions = [
    ...relatedListOptions,
    ...selectedRelatedLists
      .filter((name) => !relatedListOptions.some((option) => option.apiName === name))
      .map((apiName) => ({ apiName, label: apiName }))
  ];
  const addPaletteComponent = (type: string) => {
    const selectedIndex = page.components.findIndex((component) => component.id === selectedId);
    const selectedRegion = page.components[selectedIndex]?.region ?? 'main';
    const parentId = selected && isLayoutContainer(selected) ? selected.id : selected ? rawLayoutParentId(selected) : null;
    addComponent(type, selectedIndex >= 0 ? selectedIndex + 1 : page.components.length, selectedRegion, undefined, parentId);
  };
  const renderPaletteComponentPreview = (component: typeof paletteComponents[number]) => renderPageComponent({
    id: `palette-preview-${component.id}`,
    type: component.type,
    label: component.label,
    properties: {},
    visible: true,
    region: 'main'
  }, -1, true);
  return (
    <div className={`builder-page ${editorMode ? "builder-editor-mode" : "builder-list-mode"}`}>
      {externalPreviewTarget && createPortal(
        <div className="external-page-preview">
          <div className={`external-preview-viewport ${device.toLowerCase()}`}>
            <div className={`record-preview ${page.layoutMode === 'free-canvas' ? 'free-canvas-preview' : 'record-page-preview'} ${device === 'Phone' ? 'phone-preview' : device === 'Tablet' ? 'tablet-preview' : ''}`}>
              {page.layoutMode === 'free-canvas'
                ? <div className="free-canvas-stage" style={{ width: page.canvasWidth, height: page.canvasHeight, position: 'relative' }}>
                    {childrenOf(page.components, null).map((component) => renderPageComponent(component, page.components.findIndex((item) => item.id === component.id), true, true))}
                  </div>
                : <BuilderTemplatePreviewLayout page={page} phone={device==='Phone'}
                    header={page.components.filter(item=>(item.region??'main')==='header').map((item,index)=>renderPageComponent(item,index,true,true))}
                    main={page.components.filter(item=>(item.region??'main')==='main').map((item,index)=>renderPageComponent(item,index,true,true))}
                    sidebar={page.components.filter(item=>item.region==='sidebar').map((item,index)=>renderPageComponent(item,index,true,true))}/>}
            </div>
          </div>
        </div>,
        externalPreviewTarget
      )}

      {!editorMode && <section className="page-manager-view" aria-label="Page management">
        <header className="page-manager-header"><div><h1>Page Builder</h1><p>Manage pages and their device layouts by related record or object.</p></div>
          <div className="page-manager-header-actions">
            <button className="icon-button subtle" type="button" aria-label="Open page dependencies" title="Dependencies" onClick={()=>setDependenciesOpen(true)}><Puzzle size={16}/></button>
            <button className="icon-button subtle" type="button" aria-label="Open page routes" title="Route aliases" onClick={()=>setRouteDirectoryOpen(true)}><ExternalLink size={16}/></button>
            <button className="btn btn-brand" type="button" onClick={openCreatePage}><Plus size={16}/> New Page</button>
          </div></header>
        <div className="page-manager-filters">
          <label className="form-label">Related Record / Object<select className="form-control" value={pageListObject} aria-label="Related Record or Object" onChange={event=>setPageListObject(event.target.value)}><option value="">All objects</option>{objects.map(item=><option key={item.apiName} value={item.apiName}>{item.label}</option>)}</select></label>
          <label className="form-label">Search pages<input className="form-control" type="search" value={pageListSearch} onChange={event=>setPageListSearch(event.target.value)} placeholder="Search page name…"/></label>
        </div>
        <div className="page-manager-table-scroll"><table className="records-table page-manager-table"><thead><tr><th>Page name</th><th>Type</th><th>Device</th><th>Dimensions</th><th>Orientation</th><th>Last modified</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{visiblePages.map(item=><tr key={item.apiName}>
          <td><button type="button" className="page-manager-page-link" onClick={()=>selectSavedPage(item.apiName)}>{item.label}</button><small>{item.apiName}</small></td>
          <td>{item.pageType}</td><td>{pageDeviceLabel(item)}</td><td>{item.canvasWidth} × {item.canvasHeight} px</td><td>{canvasOrientation(item.canvasWidth,item.canvasHeight)}</td>
          <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}</td>
          <td><span className={item.status === 'Active' ? 'page-status-badge active' : 'page-status-badge'}>{item.status}</span></td>
          <td className="page-manager-actions"><button className="btn btn-small" type="button" aria-label={'Edit '+item.label} onClick={()=>selectSavedPage(item.apiName)}><Pencil size={14}/> Edit</button>
          <button className="btn btn-small" type="button" disabled={saving} aria-label={(item.status==='Active'?'Deactivate ':'Activate ')+item.label} onClick={()=>void savePage(item.status==='Active'?'Draft':'Active',item,true)}>{item.status==='Active'?'Deactivate':'Activate'}</button></td>
        </tr>)}</tbody></table>{!visiblePages.length && <div className="records-empty">No pages found for this object. Create a new page to begin.</div>}</div>
      </section>}
      {editorMode && <>
      <div className="builder-titlebar builder-compact-toolbar">
        <div className="builder-current-page">
          <button type="button" className="icon-button subtle" aria-label="Back to page list" title="Back to pages" onClick={onBackToPages}><ArrowLeft size={18}/></button>
          <strong>{page.label}</strong>
          <span className="builder-layout-chip">{pageDeviceLabel(page)} · {page.canvasWidth} × {page.canvasHeight}px · {canvasOrientation(page.canvasWidth,page.canvasHeight)}</span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="icon-button subtle" aria-label={componentPanelVisible ? "Hide components panel" : "Show components panel"} aria-pressed={componentPanelVisible} title={componentPanelVisible ? "Hide components" : "Show components"} onClick={() => setComponentPanelVisible(value => !value)}><PanelLeft size={17}/></button>
          <button type="button" className="icon-button subtle" aria-label={propertiesPanelVisible ? "Hide properties panel" : "Show properties panel"} aria-pressed={propertiesPanelVisible} title={propertiesPanelVisible ? "Hide properties" : "Show properties"} onClick={() => setPropertiesPanelVisible(value => !value)}><PanelRight size={17}/></button>
          <button type="button" className="icon-button subtle" aria-label="Page properties" title="Page properties" onClick={()=>{setPageSettingsOpen(true);setPropertiesPanelVisible(true)}}><Settings2 size={17}/></button>
          <button type="button" className="icon-button subtle" aria-label="Fit canvas to view" title="Fit canvas" onClick={()=>setFitCanvas(v=>!v)}><Maximize2 size={17}/></button>
          <button type="button" className="icon-button subtle" aria-label="Preview page" title="Preview in new window" onClick={openExternalPreview}><Eye size={17}/></button>
          <button type="button" className="icon-button subtle" aria-label="Save page" title="Save" disabled={saving} onClick={()=>void savePage()}><Save size={17}/></button>
          <button type="button" className="btn btn-small" title="Cancel editing" onClick={onBackToPages}><X size={14}/> Cancel</button>
        </div>
      </div>
      <div className={`page-builder-layout ${page.layoutMode === 'free-canvas' ? 'modern-canvas-builder' : ''} ${!componentPanelVisible ? 'canvas-left-hidden' : ''} ${!propertiesPanelVisible ? 'canvas-right-hidden' : ''}`} style={{ '--component-panel-width': `${componentPanelWidth}px`, '--properties-panel-width': `${propertiesPanelWidth}px` } as React.CSSProperties}>
        <aside className="component-panel" style={!componentPanelVisible ? { display: "none" } : undefined}>
          <div className="builder-tabs">
            <button className={paletteTab === 'Components' ? 'active' : ''} onClick={() => setPaletteTab('Components')}>Components</button>
            <button className={paletteTab === 'Layers' ? 'active' : ''} onClick={() => setPaletteTab('Layers')}>Layers</button>
            {page.pageType === 'Record Page' && <button className={paletteTab === 'Fields' ? 'active' : ''} onClick={() => setPaletteTab('Fields')}>Fields</button>}
          </div>
          <div className="component-search"><Search size={14} /><input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder={`Search ${paletteTab.toLowerCase()}…`} aria-label={`Search ${paletteTab.toLowerCase()}`} /></div>
          {paletteTab === 'Layers' ? <nav className="page-layer-tree" aria-label="Page component layers">
            {page.components.filter(component => !paletteSearch || (component.label + ' ' + component.type).toLowerCase().includes(paletteSearch.toLowerCase())).map(component => {
              const parent = component.parentId ?? (typeof component.properties.layoutParentId === 'string' ? component.properties.layoutParentId : '');
              return <div key={component.id} className="page-layer-row" style={{paddingLeft:parent ? 20 : 6}}>
                <button type="button" className={selectedId === component.id ? 'active btn btn-small' : 'btn btn-small'}
                  onClick={() => { setSelectedId(component.id); setPageSettingsOpen(false); }}
                  aria-label={'Select layer ' + component.label}>{component.label}</button>
                <button type="button" className="icon-button subtle" aria-label={'Move layer ' + component.label + ' up'} title="Bring forward" disabled={previewMode || isCanvasLocked(component) || page.components[0]?.id === component.id} onClick={() => moveLayer(component.id, -1)}><ArrowUp size={13}/></button>
                <button type="button" className="icon-button subtle" aria-label={'Move layer ' + component.label + ' down'} title="Send backward" disabled={previewMode || isCanvasLocked(component) || page.components[page.components.length-1]?.id === component.id} onClick={() => moveLayer(component.id, 1)}><ArrowDown size={13}/></button>
                <button type="button" className="icon-button subtle" aria-label={'Toggle layer ' + component.label}
                  disabled={previewMode || isCanvasLocked(component)}
                  onClick={() => updateComponent(component.id, {visible: !component.visible})}>{component.visible ? <Eye size={14}/> : '○'}</button>
                <button type="button" className="icon-button subtle" aria-label={(isCanvasLocked(component) ? 'Unlock ' : 'Lock ') + component.label}
                  title={isCanvasLocked(component) ? 'Unlock layer' : 'Lock layer'}
                  disabled={previewMode} onClick={() => toggleCanvasLock(component)}>{isCanvasLocked(component) ? <Lock size={14}/> : <Unlock size={14}/>}</button>
              </div>;
            })}
            {!page.components.length && <p className="properties-help">Add a component to see its layer.</p>}
          </nav> : paletteTab === 'Components' ? <>
            {page.layoutMode === 'free-canvas' && <div className="palette-note">Free Canvas uses registered components from the shared library.</div>}
            <nav className="component-category-list" aria-label="Component categories">
              {pageBuilderPaletteCategories.map((category) => {
                const count = category === 'All Components' ? paletteComponents.length
                  : category === 'Favourites' ? paletteComponents.filter((component) => favouriteComponents.includes(component.id)).length
                    : paletteComponents.filter((component) => component.categories.includes(category)).length;
                return <button type="button" key={category}
                  className={paletteCategory === category ? 'component-category active' : 'component-category'}
                  aria-pressed={paletteCategory === category} onClick={() => setPaletteCategory(category)}
                  title={`Show ${category.toLowerCase()} components`}>
                  <span>{category}</span><small>{count}</small>
                </button>;
              })}
            </nav>
            <div className="component-grid" aria-live="polite">
              {filteredPaletteComponents.map((component) => {
                const isFavourite = favouriteComponents.includes(component.id);
                return <article className="component-library-card" key={component.id}
                  draggable={!previewMode}
                  title={`${component.label}: ${component.description}`}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', `component:${component.type}`)}>
                  <div className="component-card-preview" aria-hidden="true"
                    ref={(element) => { if (element) element.inert = true; }}>
                    {renderPaletteComponentPreview(component)}
                  </div>
                  <div className="component-card-copy">
                    <strong>{component.label}</strong>
                    <span>{component.description}</span>
                  </div>
                  <button type="button" className="component-card-action"
                    draggable={!previewMode}
                    aria-label={`Add ${component.label} to canvas`}
                    onClick={() => addPaletteComponent(component.type)}
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', `component:${component.type}`)}>
                  </button>
                  <button type="button" className={isFavourite ? 'component-favourite active' : 'component-favourite'}
                    aria-label={`${isFavourite ? 'Remove' : 'Add'} ${component.label} ${isFavourite ? 'from' : 'to'} favourites`}
                    title={`${isFavourite ? 'Remove from' : 'Add to'} favourites`}
                    onClick={(event) => { event.stopPropagation(); toggleFavourite(component.id); }}>
                    <Star size={14} fill={isFavourite ? 'currentColor' : 'none'} />
                  </button>
                </article>;
              })}
              {filteredPaletteComponents.length === 0 && <div className="palette-empty component-grid-empty">
                <strong>No matching components</strong>
                <span>Try another category or search by component name, description, or category.</span>
              </div>}
            </div>
            {availableComponents.length !== pageTypeComponents.length && <div className="palette-note">Some components require object features to be enabled.</div>}
          </> : <>
            <div className="component-group-label">{targetObject?.label ?? 'Object'} Fields</div>
            {fields.filter((field) => `${field.label} ${field.apiName} ${field.dataType}`.toLowerCase().includes(paletteSearch.trim().toLowerCase())).map((field) => <button className="component-option field-option" draggable={!previewMode} key={field.apiName} title={`${field.label} · ${field.dataType}`} onClick={() => addField(field.apiName)} onDragStart={(event) => event.dataTransfer.setData('text/plain', `field:${field.apiName}`)}><span className="component-option-icon"><Database size={13} /></span><span><strong>{field.label}</strong><small>{field.dataType}</small></span><Plus size={14} /></button>)}
            {fields.filter((field) => `${field.label} ${field.apiName} ${field.dataType}`.toLowerCase().includes(paletteSearch.trim().toLowerCase())).length === 0 && <div className="palette-empty">No matching fields</div>}
          </>}
          <button type="button" className="component-panel-resize" aria-label="Resize component library panel"
            title="Drag to resize this panel"
            onPointerDown={startComponentPanelResize} onPointerMove={moveComponentPanelResize}
            onPointerUp={endComponentPanelResize} onPointerCancel={endComponentPanelResize} />
        </aside>
        <div className="page-preview-area" ref={pagePreviewAreaRef}>
          <div className="page-stage" key={canvasRefreshKey} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event)}>
            <div
              className={`record-preview ${page.layoutMode === 'free-canvas' ? 'free-canvas-preview' : page.pageType === 'Record Page' ? 'record-page-preview' : page.pageType === 'App Page' ? 'app-page-preview' : 'home-page-preview'} ${device === 'Phone' ? 'phone-preview' : device === 'Tablet' ? 'tablet-preview' : ''}`}
              style={page.layoutMode === 'free-canvas' && fitCanvas ? {
                width: page.canvasWidth * fitScale,
                height: page.canvasHeight * fitScale,
                minHeight: 0,
                overflow: 'hidden'
              } : undefined}
            >
              {page.layoutMode === 'free-canvas' ? <div
                className={`free-canvas-stage ${canvasSnap && !previewMode ? 'canvas-grid-on' : ''}`}
                style={{
                  width: page.canvasWidth,
                  height: page.canvasHeight,
                  transform: fitCanvas ? `scale(${fitScale})` : undefined,
                  transformOrigin: 'top left'
                }}
              >
                {childrenOf(page.components, null).map((component) => renderPageComponent(component, page.components.findIndex((item) => item.id === component.id)))}
                {!page.components.length && <div className="free-canvas-empty">Add custom components from the left panel.</div>}
                {!previewMode && <><div className="canvas-magnet-guide canvas-magnet-guide-x"  aria-hidden="true" />
                  <div className="canvas-magnet-guide canvas-magnet-guide-y"  aria-hidden="true" /></>}
              </div> : <>
              {page.pageType === 'Record Page' ? <>
                <div className="record-preview-nav">
                  <div className="record-object-icon">{(targetObject?.label ?? page.targetObject).charAt(0)}</div>
                  <div><strong>{targetObject?.label ?? page.targetObject} preview</strong><small>{page.targetObject} · Recently Viewed</small></div>
                  <button className="btn">Follow</button><button className="btn">Edit</button><button className="icon-button subtle" aria-label="More record actions"><ChevronDown size={14} /></button>
                </div>
                {page.components.some((component) => component.type === 'Highlights Panel' && component.visible) && <div className="record-highlight">{fields.slice(0, 5).map((field) => <div key={field.apiName}><small>{field.label}</small><strong>{field.apiName === 'Name' ? `${targetObject?.label ?? 'Sample'} record` : 'Sample value'}</strong></div>)}</div>}
                {page.components.some((component) => component.type === 'Tabs' && component.visible) && <div className="record-tabs">{stringList(page.components.find((component) => component.type === 'Tabs')?.properties.tabs, ['Related', 'Details', 'News']).map((tab, index) => <button className={index === 0 ? 'active' : ''} key={`${tab}-${index}`}>{tab}</button>)}</div>}
              </> : page.pageType === 'App Page' ? (!page.components.some(item=>item.properties?.standalonePresentation===true) && <div className="app-page-shell-header"><div className="record-object-icon"><Grid2X2 size={17} /></div><div><small>Lightning App</small><strong>{page.label}</strong></div></div>) : <div className="home-page-shell-header"><small>HOME</small><strong>{page.label}</strong><span>Your workspace overview</span></div>}
              {page.components.some(item=>item.properties?.standalonePresentation===true)
                ? <BuilderTemplatePreviewLayout page={page} phone={device==='Phone'}
                    header={renderRegion('header')} main={renderRegion('main')} sidebar={renderRegion('sidebar')}/>
                : <div className={`page-template-regions template-${template.id}`}>
                    {template.regions.includes('header') && renderRegion('header')}
                    <div className="page-template-content">
                      {renderRegion('main')}
                      {template.regions.includes('sidebar') && renderRegion('sidebar')}
                    </div>
                  </div>}
              </>}
            </div>
          </div>
        </div>
        <aside id="lightning-page-properties" style={!propertiesPanelVisible ? { display: "none" } : undefined} className={`properties-panel ${pageSettingsOpen || selected ? 'responsive-open' : ''}`}><button className="properties-panel-resize" type="button" aria-label="Resize properties panel" title="Drag to resize" onPointerDown={startPropertiesResize} onPointerMove={movePropertiesResize} onPointerUp={endPropertiesResize} onPointerCancel={endPropertiesResize}/>
          <div className="properties-header"><h2>{pageSettingsOpen || !selected ? 'Page properties' : 'Properties'}</h2>{pageSettingsOpen && selected && <button type="button" className="btn btn-small" onClick={() => setPageSettingsOpen(false)}>Component properties</button>}{selected && !pageSettingsOpen && <button className="icon-button subtle" onClick={removeSelected} aria-label="Remove component"><Trash2 size={15} /></button>}</div>
          {selected && !pageSettingsOpen ? <>
            <div className="modern-inspector-tabs" role="tablist" aria-label="Component inspector">
              {(['Overview', 'Design', 'Data & Actions'] as const).map(tab => <button key={tab} type="button" role="tab"
                aria-selected={inspectorTab === tab} className={inspectorTab === tab ? 'active' : ''}
                onClick={() => setInspectorTab(tab)}>{tab}</button>)}
            </div>
            <div className="properties-section-title">Component</div>
            <label className="form-label" htmlFor="page-component-type">Component type</label><div className="form-display" id="page-component-type">{selected.type}</div>
            <div className="selected-component-preview">
              <div className="selected-component-preview-frame">{renderPageComponent(selected, -1, true)}</div>
              <strong>{selected.label}</strong>
              {selectedComponentDescription && <p>{selectedComponentDescription}</p>}
            </div>
            <label className="form-label" htmlFor="page-component-label">Label</label><input id="page-component-label" className="form-control" value={selected.label} onChange={(event) => updateComponent(selected.id, { label: event.target.value })} />
            {inspectorTab !== 'Data & Actions' && <PageComponentVisualEditor value={selected.properties.visualStyle} onChange={(visualStyle) => updateComponent(selected.id, { properties: { ...selected.properties, visualStyle } })} />}
            {selected.parentId && <button type="button" className="btn btn-small" onClick={() => updateComponent(selected.id, { parentId: undefined })}>Move out of container</button>}
            {inspectorTab !== 'Data & Actions' && <PageComponentStyleEditor properties={selected.properties}
              onChange={(properties: Record<string, unknown>) => updateComponent(selected.id, { properties })} />}
            {inspectorTab !== 'Design' && selectedCustomDefinition && <>
              <div className="properties-section-title">Component properties</div>
              <div className="properties-section-title">Container hierarchy</div>
              {true
                && <label className="checkbox-row">
                  <input type="checkbox" checked={isLayoutContainer(selected)}
                    onChange={(event) => {
                      if (!event.target.checked && childrenOf(page.components, selected.id).length) {
                        onNotify('Move all child components out before disabling nesting.');
                        return;
                      }
                      updateComponent(selected.id, { properties: { ...selected.properties, layoutContainer: event.target.checked } });
                    }} />
                  Accept nested components (requires a component that renders children)
                </label>}
              <label className="form-label">Parent container
                <select className="form-control" aria-label="Parent container" value={rawLayoutParentId(selected) ?? ''}
                  onChange={(event) => {
                    const parentId = event.target.value || null;
                    if (!canNest(page.components, selected.id, parentId)) {
                      onNotify('A component cannot be nested inside itself or a descendant.');
                      return;
                    }
                    applyPage({ ...page, components: reparentComponent(page.components, selected.id, parentId) });
                  }}>
                  <option value="">Canvas / page root</option>
                  {page.components.filter((item) => canNest(page.components, selected.id, item.id))
                    .map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
                </select>
              </label>
              {isLayoutContainer(selected) && <>
                <p className="properties-help">Drag components onto this container or select them below to edit. Drop a child onto the canvas to move it back to the root.</p>
                <div className="properties-section-title">Child components</div>
                {childrenOf(page.components, selected.id).map((child) => <button className="btn btn-small" type="button" key={child.id}
                  onClick={() => setSelectedId(child.id)}>{child.label}</button>)}
                {!childrenOf(page.components, selected.id).length && <p className="properties-help">No children yet — drop components into this layout.</p>}
              </>}
              <MetadataComponentProperties definitions={libraryComponents.find(component => selected.type === `Custom:${component.apiName}` && component.status !== 'Draft')?.propertyDefinitions} properties={selected.properties}
                objects={objects}
                apps={apps}
                pages={pages}
                currentAppId={builderAppApiName || apps[0]?.apiName || 'Records'}
                flows={flows}
                onChange={(properties: Record<string, unknown>) => updateComponent(selected.id, { properties })}
              />
            </>}
            {inspectorTab !== 'Design' && selected.type === 'Related List' && <>
              <div className="properties-section-title">Related Lists</div>
              {componentRelatedListOptions.map((option) => <label className="checkbox-row property-check" key={option.apiName}><input type="checkbox" checked={selectedRelatedLists.includes(option.apiName)} onChange={(event) => {
                updateComponent(selected.id, { properties: { ...selected.properties, relatedLists: event.target.checked ? [...selectedRelatedLists, option.apiName] : selectedRelatedLists.filter((item) => item !== option.apiName) } });
              }} />{option.label}</label>)}
              {!componentRelatedListOptions.length && <div className="palette-note">No related objects have a relationship to this record object.</div>}
            </>}
            {inspectorTab !== 'Design' && selected.type === 'Tabs' && <>
              <div className="properties-section-title">Tabs</div><label className="form-label" htmlFor="page-component-tabs">Tab labels</label>
              <textarea id="page-component-tabs" className="form-control" rows={3} value={stringList(selected.properties.tabs, ['Related', 'Details', 'News']).join('\n')} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, tabs: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } })} />
            </>}
            {inspectorTab !== 'Design' && selected.type === 'Accordion' && <>
              <div className="properties-section-title">Accordion Content</div>
              <label className="form-label" htmlFor="page-component-accordion-content">Content</label>
              <textarea id="page-component-accordion-content" className="form-control" rows={4}
                value={typeof selected.properties.content === 'string' ? selected.properties.content : ''}
                onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, content: event.target.value } })} />
            </>}
            {inspectorTab !== 'Design' && selected.type === 'Dashboard' && <>
              <div className="properties-section-title">Dashboard</div>
              <label className="form-label" htmlFor="page-component-dashboard">Published dashboard</label>
              <select id="page-component-dashboard" className="form-control"
                value={typeof selected.properties.dashboardApiName === 'string' ? selected.properties.dashboardApiName : ''}
                onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, dashboardApiName: event.target.value } })}>
                <option value="">Select a published dashboard…</option>
                {dashboards.filter(dashboard => dashboard.status === 'Deployed').map(dashboard =>
                  <option key={dashboard.apiName} value={dashboard.apiName}>{dashboard.label}</option>)}
              </select>
              <p className="properties-help">The live dashboard checks tenant, folder, viewer and record permissions at runtime.</p>
            </>}
            {inspectorTab !== 'Design' && selected.type === 'Report Chart' && <>
              <div className="properties-section-title">Report</div>
              <label className="form-label" htmlFor="page-component-report">Source report</label>
              <select id="page-component-report" className="form-control" value={typeof selected.properties.reportApiName === 'string' ? selected.properties.reportApiName : ''}
                onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, reportApiName: event.target.value } })}>
                <option value="">Select a report…</option>{reports.filter((report) =>
                  page.pageType !== 'Record Page' || report.objectApiName === page.targetObject)
                  .map((report) => <option key={report.apiName} value={report.apiName}>{report.label}</option>)}
              </select>
            </>}
            {selected.type === 'Record Detail' && <>
              <div className="properties-section-title">Displayed Fields</div>
              {fields.map((field) => {
                const displayedFields = (Array.isArray(selected.properties.fields) ? selected.properties.fields : fields.slice(0, 6).map((item) => item.apiName)) as string[];
                return <label className="checkbox-row property-check" key={field.apiName}><input type="checkbox" checked={displayedFields.includes(field.apiName)} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, fields: event.target.checked ? [...displayedFields, field.apiName] : displayedFields.filter((item) => item !== field.apiName) } })} />{field.label}</label>;
              })}
              {!dynamicFormsEnabled && <div className="dynamic-forms-upgrade">
                <button className="btn" type="button" onClick={() => setDynamicFormsUpgradeOpen((current) => !current)}>Upgrade Now</button>
                {dynamicFormsUpgradeOpen && <>
                  <p className="properties-help">Choose the page layout whose sections and fields should become Dynamic Forms components.</p>
                  <label className="form-label" htmlFor="dynamic-forms-layout">Page Layout
                    <select id="dynamic-forms-layout" className="form-control" value={migrationLayoutId || assignedMigrationLayout?.id || ''} onChange={(event) => setMigrationLayoutId(event.target.value)}>
                      {pageLayouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
                    </select>
                  </label>
                  {!pageLayouts.length && <div className="palette-note">No page layouts are available for this object.</div>}
                  <button className="btn btn-brand" type="button" disabled={!selectedMigrationLayout} onClick={() => upgradeRecordDetail(selected)}>Upgrade</button>
                </>}
              </div>}
            </>}
            {selected.type === 'Field Section' && <>
              <div className="properties-section-title">Section Fields</div>
              <label className="form-label" htmlFor="field-section-columns">Columns
                <select id="field-section-columns" className="form-control" value={selected.properties.columns === 1 ? 1 : 2} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, columns: Number(event.target.value) } })}>
                  <option value={1}>1</option><option value={2}>2</option>
                </select>
              </label>
              {fields.map((field) => {
                const fieldApiNames = stringList(selected.properties.fieldApiNames, []);
                const fieldIndex = fieldApiNames.indexOf(field.apiName);
                return <div className="dynamic-field-property-row" key={field.apiName}>
                  <label className="checkbox-row property-check">
                    <input type="checkbox" checked={fieldIndex >= 0} onChange={(event) => updateComponent(selected.id, { properties: { ...selected.properties, fieldApiNames: event.target.checked ? [...fieldApiNames, field.apiName] : fieldApiNames.filter((item) => item !== field.apiName) } })} />
                    {field.label}
                  </label>
                  {fieldIndex >= 0 && <div className="property-position-actions">
                    <button className="icon-button subtle" type="button" aria-label={`Move ${field.label} up`} title="Move up" disabled={fieldIndex === 0} onClick={() => moveSectionField(selected.id, fieldIndex, -1)}><ArrowUp size={13} /></button>
                    <button className="icon-button subtle" type="button" aria-label={`Move ${field.label} down`} title="Move down" disabled={fieldIndex === fieldApiNames.length - 1} onClick={() => moveSectionField(selected.id, fieldIndex, 1)}><ArrowDown size={13} /></button>
                  </div>}
                </div>;
              })}
            </>}
            {selected.type === 'Record Field' && <>
              <div className="properties-section-title">Field</div>
              <label className="form-label" htmlFor="record-field-selection">Record Field
                <select id="record-field-selection" className="form-control" value={typeof selected.properties.fieldApiName === 'string' ? selected.properties.fieldApiName : ''} onChange={(event) => {
                  const field = fields.find((item) => item.apiName === event.target.value);
                  updateComponent(selected.id, { label: field?.label ?? selected.label, properties: { ...selected.properties, fieldApiName: event.target.value } });
                }}>
                  {fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
                </select>
              </label>
            </>}
            {inspectorTab !== 'Data & Actions' && page.layoutMode === 'free-canvas' && selected.position && !rawLayoutParentId(selected) && <div className="free-canvas-component-properties">
              <label className="checkbox-row"><input type="checkbox" checked={selected.properties.canvasLocked === true}
                onChange={event => updateComponent(selected.id, { properties: { ...selected.properties, canvasLocked: event.target.checked } })} />
                Lock component position and size</label>
              <div className="properties-section-title">Size (pixels)</div>
              {([
                ['width', 'Width'], ['height', 'Height']
              ] as const).map(([key, label]) => {
                const max = key === 'width' ? page.canvasWidth - selected.position!.x
                  : page.canvasHeight - selected.position!.y;
                const min = key === 'width' ? selectedCustomDefinition?.resize?.minWidth ?? 1
                  : key === 'height' ? selectedCustomDefinition?.resize?.minHeight ?? 1
                    : 0;
                return <label className="form-label" key={key}>{label}
                  <input className="form-control" type="number" min={min} disabled={selected.properties.canvasLocked === true}
                    max={max}
                    value={selected.position![key]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isInteger(value)) return;
                      updateComponent(selected.id, { position: { ...selected.position!, [key]: Math.min(max, Math.max(min, value)) } });
                    }} />
                </label>;
              })}
            </div>}
            <div className="properties-section-title">Layer order</div>
            <div className="property-position-actions"><button className="btn" disabled={page.components[0]?.id === selected.id} onClick={() => moveSelected(-1)}><ArrowDown className="move-up-icon" size={13} />Move up</button><button className="btn" disabled={page.components[page.components.length - 1]?.id === selected.id} onClick={() => moveSelected(1)}><ArrowDown size={13} />Move down</button></div>
            {page.layoutMode === 'free-canvas' && selected.position && !rawLayoutParentId(selected) && <button className="btn btn-small" type="button" onClick={wrapSelectedInContainer}>Group selected component</button>}
            {page.layoutMode === 'free-canvas' && selected.type === 'Container' && <button className="btn btn-small" type="button" onClick={ungroupSelected}>Ungroup children</button>}
            <button type="button" className="btn btn-small" aria-expanded={showCanvasConditions} onClick={() => setShowCanvasConditions(value => !value)}>Conditions</button>
            {showCanvasConditions && <>
            <div className="properties-section-title">Visibility</div>
            <label className="checkbox-row"><input type="checkbox" checked={selected.visible}
              onChange={(event) => updateComponent(selected.id, { visible: event.target.checked })} />
              Show component
            </label>
            <ComponentVisibilityEditor rules={selected.properties.visibilityRules} fields={fields}
              allowRecordFields={page.pageType === 'Record Page'}
              onChange={visibilityRules => {
                const properties = { ...selected.properties };
                if (visibilityRules) properties.visibilityRules = visibilityRules;
                else delete properties.visibilityRules;
                updateComponent(selected.id, { properties });
              }} />
            </>}
            <button className="btn btn-full" onClick={() => { setSelectedId(''); setPageSettingsOpen(true); }}>Done</button>
          </> : <>
            <p className="properties-help">Edit page details and activation assignments. The related object and device layout are fixed at creation.</p>
            <label className="form-label" htmlFor="lightning-page-label">Label</label><input id="lightning-page-label" className="form-control" value={page.label} onChange={(event) => applyPage({ ...page, label: event.target.value })} />
            <label className="form-label" htmlFor="lightning-page-api">API Name</label><input id="lightning-page-api" className="form-control" value={page.apiName} onChange={(event) => applyPage({ ...page, apiName: event.target.value })} />
            {page.pageType === 'Record Page' && <><label className="form-label">Related object</label><div className="form-display">{targetObject?.label ?? page.targetObject}</div></>}
            {page.pageType === 'Record Page' && <div className="home-page-assignments">
              <div className="properties-section-title">Activation Assignments</div>
              <p className="properties-help">Set the apps, profiles, record types, and form factors that use this Record Page. More specific assignments take precedence over broader defaults.</p>
              {(page.activationAssignments ?? []).map((assignment) => <div className="home-page-assignment" key={assignment.id}>
                <span><strong>{assignment.scope === 'Org Default' ? 'Organization default' : apps.find((app) => app.apiName === assignment.appId)?.label ?? assignment.appId}</strong>
                  <small>{assignment.scope}
                    {assignment.profileId ? ` · ${profiles.find((profile) => profile.id === assignment.profileId)?.label ?? assignment.profileId}` : ''}
                    {assignment.recordTypeId ? ` · ${(targetObject?.recordTypes ?? []).find((recordType) => recordType.id === assignment.recordTypeId)?.label ?? assignment.recordTypeId}` : ''}
                    {` · ${assignment.formFactors.join(', ')}`}
                  </small></span>
                <button className="icon-button subtle" aria-label={`Remove ${assignment.scope} activation assignment`} onClick={() => removePageAssignment(assignment.id)}><Trash2 size={14} /></button>
              </div>)}
              <label className="form-label">Assign as<select className="form-control" value={recordScope} onChange={(event) => setRecordScope(event.target.value as PageActivationAssignmentMetadata['scope'])}>
                <option>Org Default</option><option>App Default</option><option>App and Profile</option>
                {(targetObject?.recordTypes ?? []).some((recordType) => recordType.active) && <option>App, Record Type, and Profile</option>}
              </select></label>
              {recordScope !== 'Org Default' && <label className="form-label">App<select className="form-control" value={recordAppId} onChange={(event) => setRecordAppId(event.target.value)}>
                <option value="">Select an app…</option>{apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
              </select></label>}
              {(recordScope === 'App and Profile' || recordScope === 'App, Record Type, and Profile') && <label className="form-label">Profile<select className="form-control" value={recordProfileId} onChange={(event) => setRecordProfileId(event.target.value)}>
                <option value="">Select a profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
              </select></label>}
              {recordScope === 'App, Record Type, and Profile' && <label className="form-label">Record Type<select className="form-control" value={recordTypeId} onChange={(event) => setRecordTypeId(event.target.value)}>
                <option value="">Select a record type…</option>{(targetObject?.recordTypes ?? []).filter((recordType) => recordType.active).map((recordType) => <option key={recordType.id} value={recordType.id}>{recordType.label}</option>)}
              </select></label>}
              <div className="form-label">Form Factors</div>
              <div className="form-options">{(['Desktop', 'Phone'] as const).map((factor) => <label className="checkbox-row" key={factor}>
                <input type="checkbox" disabled={!page.devices.includes(factor)} checked={recordFormFactors.includes(factor) && page.devices.includes(factor)}
                  onChange={() => setRecordFormFactors((current) => current.includes(factor) ? current.filter((item) => item !== factor) : [...current, factor])} />
                {factor}
              </label>)}</div>
              <button className="btn btn-full" type="button" onClick={addRecordAssignment}>Add Record Page Assignment</button>
            </div>}
            {page.pageType === 'Home Page' && <div className="home-page-assignments">
              <div className="properties-section-title">Activation Assignments</div>
              <p className="properties-help">Assign this Home Page to an app, or to an app and profile.</p>
              {(page.activationAssignments ?? []).map((assignment) => <div className="home-page-assignment" key={assignment.id}>
                <span><strong>{apps.find((app) => app.apiName === assignment.appId)?.label ?? assignment.appId}</strong>
                  <small>{assignment.scope}{assignment.profileId ? ` · ${profiles.find((profile) => profile.id === assignment.profileId)?.label ?? assignment.profileId}` : ''} · {assignment.formFactors.join(', ')}</small></span>
                <button className="icon-button subtle" aria-label="Remove Home Page assignment" onClick={() => removePageAssignment(assignment.id)}><Trash2 size={14} /></button>
              </div>)}
              <label className="form-label">App<select className="form-control" value={homeAppId} onChange={(event) => setHomeAppId(event.target.value)}>
                <option value="">Select an app…</option>{apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
              </select></label>
              <label className="form-label">Assign as<select className="form-control" value={homeScope} onChange={(event) => setHomeScope(event.target.value as typeof homeScope)}>
                <option>App Default</option><option>App and Profile</option>
              </select></label>
              {homeScope === 'App and Profile' && <label className="form-label">Profile<select className="form-control" value={homeProfileId} onChange={(event) => setHomeProfileId(event.target.value)}>
                <option value="">Select a profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
              </select></label>}
              <div className="form-label">Form Factors</div>
              <div className="form-options">{(['Desktop', 'Phone'] as const).map((factor) => <label className="checkbox-row" key={factor}>
                <input type="checkbox" disabled={!page.devices.includes(factor)} checked={homeFormFactors.includes(factor) && page.devices.includes(factor)}
                  onChange={() => setHomeFormFactors((current) => current.includes(factor) ? current.filter((item) => item !== factor) : [...current, factor])} />
                {factor}
              </label>)}</div>
              <button className="btn btn-full" type="button" onClick={addHomeAssignment}>Add Home Page Assignment</button>
            </div>}
            <p className="properties-help">Device, dimensions and orientation are selected when creating a page. Create another page for a different layout size.</p>
            <div className="page-property-summary"><strong>{page.components.length}</strong> components</div>

          </>}
        </aside>
      </div>
      </>}
      {dependenciesOpen && <div className="modal-backdrop" role="presentation"
        onMouseDown={event => { if (event.target === event.currentTarget) setDependenciesOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="page-dependencies-title"
          style={{maxHeight:'85vh',overflowY:'auto'}}>
          <div className="modal-header"><h2 id="page-dependencies-title">Page dependencies</h2>
            <button className="btn btn-small" type="button" onClick={() => setDependenciesOpen(false)}>Close</button></div>
          <p className="modal-copy">References use saved objects, apps, reports, dashboards, components and Flows.</p>
          <table className="records-table" aria-label="Page dependencies"><thead><tr><th>Type</th><th>Reference</th><th>Status</th><th>Source</th></tr></thead><tbody>
            {inspectPageDependencies(page, {apps,pages,objects,reports,dashboards,flows,libraryComponents}).map((entry,idx) =>
              <tr key={entry.kind + ':' + entry.name + ':' + idx}><td>{entry.kind}</td><td>{entry.name}</td>
                <td>{entry.status}</td><td>{entry.componentId
                  ? <button className="btn btn-small" type="button" onClick={() => {setSelectedId(entry.componentId!);setDependenciesOpen(false);}}>{entry.description}</button>
                  : entry.description}</td></tr>)}
          </tbody></table>
        </section>
      </div>}
      {routeDirectoryOpen && <PageRouteDirectory apps={apps} pages={pages} objects={objects}
        initialAppId={builderAppApiName} basePath={import.meta.env.BASE_URL}
        request={request} canManage={canManageRoutes}
        onNotify={onNotify} onClose={() => setRouteDirectoryOpen(false)} />}
      {createPageOpen && <div className="modal-backdrop" role="presentation"
        onMouseDown={event => { if (event.target === event.currentTarget) setCreatePageOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-lightning-page-title">
          <div className="modal-header">
            <h2 id="create-lightning-page-title">Create a Lightning page</h2>
            <button className="icon-button dark" onClick={() => setCreatePageOpen(false)} aria-label="Close"><X size={18} /></button>
          </div>
          <p className="modal-copy">Choose where the page belongs, its data object and device layout. No code or API names required.</p>
          <label className="form-label" htmlFor="new-lightning-page-label">Page name
            <input id="new-lightning-page-label" className="form-control" autoFocus
              value={newPageLabel} onChange={event => setNewPageLabel(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void createPage(); }}
              placeholder="For example, Inventory Management" />
          </label>
          <label className="form-label" htmlFor="new-lightning-page-layout-mode">Canvas mode
            <select id="new-lightning-page-layout-mode" className="form-control" value={newPageLayoutMode}
              onChange={event => {
                const mode = event.target.value as LightningPageMetadata['layoutMode'];
                setNewPageLayoutMode(mode);
                if (mode === 'free-canvas') setNewPageType('Home Page');
              }}>
              <option value="template">Responsive template</option><option value="free-canvas">Free Canvas</option>
            </select>
          </label>
          <label className="form-label" htmlFor="new-lightning-page-type">Page type
            <select id="new-lightning-page-type" className="form-control" value={newPageType}
              disabled={newPageLayoutMode === 'free-canvas'}
              onChange={event => {
                const type = event.target.value as LightningPageMetadata['pageType'];
                setNewPageType(type);
                setNewPageTemplate(type === 'Record Page' ? 'header-main-sidebar' : 'main-sidebar');
              }}>
              {['Record Page', 'App Page', 'Home Page'].map(type => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="form-label" htmlFor="new-lightning-page-object">Data object
            <select id="new-lightning-page-object" className="form-control" value={newPageTargetObject}
              onChange={event => setNewPageTargetObject(event.target.value)}>
              <option value="">Choose an object…</option>
              {objects.map(object => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}
            </select>
          </label>
          <label className="form-label" htmlFor="new-lightning-page-app">Application (optional)
            <select id="new-lightning-page-app" className="form-control" value={newPageAppId}
              onChange={event => setNewPageAppId(event.target.value)}>
              <option value="">Assign later</option>
              {apps.map(app => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
            </select>
          </label>
          <p className="properties-help">
            {newPageType === 'App Page'
              ? "When you Activate this page, it will automatically be added to the chosen application's navigation."
              : 'For Home and Record pages, choosing an application prepares an App Default assignment. You can change it before activation.'}
          </p>
          {newPageLayoutMode === 'template' && <label className="form-label" htmlFor="new-lightning-page-template">
            Layout template
            <select id="new-lightning-page-template" className="form-control" value={newPageTemplate}
              onChange={event => setNewPageTemplate(event.target.value as LightningPageTemplate)}>
              {pageTemplates.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>}
          <label className="form-label">Target device
            <select className="form-control" aria-label="Target device" value={newPageDeviceChoice} onChange={event => {
              const target = event.target.value as 'Desktop' | 'Tablet' | 'Phone';
              setNewPageDeviceChoice(target);
              setNewPageDevices([target === 'Phone' ? 'Phone' : 'Desktop']);
              const size = target === 'Phone' ? [390,844] : target === 'Tablet' ? [1024,768] : [1440,900];
              setNewPageCanvasWidth(size[0]); setNewPageCanvasHeight(size[1]);
            }}>
              <option value="Desktop">Desktop</option><option value="Tablet">Tablet</option><option value="Phone">Phone</option>
            </select>
          </label>
          <div className="permission-form-grid">
            <label className="form-label">Canvas width (px)<input className="form-control" type="number" min={320} max={7680} value={newPageCanvasWidth}
              onChange={event => setNewPageCanvasWidth(Math.min(7680, Math.max(320, Number(event.target.value) || 320)))}/></label>
            <label className="form-label">Canvas height (px)<input className="form-control" type="number" min={320} max={7680} value={newPageCanvasHeight}
              onChange={event => setNewPageCanvasHeight(Math.min(7680, Math.max(320, Number(event.target.value) || 320)))}/></label>
          </div>
          <div className="device-picker orientation-picker" role="group" aria-label="Page orientation">
            {(['Portrait','Landscape'] as const).map(value => <button type="button" key={value}
              className={canvasOrientation(newPageCanvasWidth,newPageCanvasHeight) === value ? 'device-choice active' : 'device-choice'}
              aria-pressed={canvasOrientation(newPageCanvasWidth,newPageCanvasHeight) === value}
              onClick={() => { const size = canvasDimensionsForOrientation(newPageCanvasWidth,newPageCanvasHeight,value); setNewPageCanvasWidth(size.width);setNewPageCanvasHeight(size.height); }}>{value}</button>)}
          </div>
          {newPageDeviceChoice === 'Tablet' && <p className="properties-help">Tablet uses the existing Desktop runtime form factor and a tablet-sized canvas.</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setCreatePageOpen(false)}>Cancel</button>
            <button className="btn btn-brand"
              disabled={saving || !newPageLabel.trim() || !newPageTargetObject}
              onClick={() => void createPage()}><Plus size={14} />{saving ? 'Creating…' : 'Create draft'}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}


return PageBuilder;
}
