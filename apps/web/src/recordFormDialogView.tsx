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



/** Respect administrator-provided labels; humanise only unconfigured API-name fallbacks. */
function displayFieldLabel(field: FieldMetadata): string {
  const label = field.label?.trim();
  if (label && label !== field.apiName) return label;
  const source = (label || field.apiName).replace(/__c$/i, '');
  return source.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/_/g, ' ').trim();
}

export function RecordFormDialog({
  object,
  objects,
  activeRecordTypes,
  selectedRecordTypeId,
  profileId,
  selectedLayout,
  fieldAccess,
  userRoles,
  formValues,
  lookupRecords,
  formError,
  saving,
  editing,
  actionAllowed,
  onChange,
  onClose,
  onSubmit
}: {
  object: ObjectMetadata;
  objects: ObjectMetadata[];
  activeRecordTypes: RecordTypeMetadata[];
  selectedRecordTypeId: string;
  profileId: string;
  selectedLayout: PageLayoutMetadata | undefined;
  fieldAccess: Record<string, { read: boolean; edit: boolean }>;
  userRoles: Array<{id:string;name:string}>;
  formValues: Record<string, unknown>;
  lookupRecords: Record<string, RecordData[]>;
  formError: string;
  saving: boolean;
  editing: boolean;
  actionAllowed: boolean;
  onChange: (apiName: string, value: unknown) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [isPhoneViewport, setIsPhoneViewport] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const [lookupDialogField, setLookupDialogField] = useState<FieldMetadata | null>(null);
  const [lookupQuery, setLookupQuery] = useState('');
  const [includeNonmatchingOptionalLookupResults, setIncludeNonmatchingOptionalLookupResults] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const updateViewport = () => setIsPhoneViewport(media.matches);
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);
  const layoutFieldNames = selectedLayout?.sections.flatMap((section) => section.fieldApiNames) ?? [];
  const visibleFields = object.fields.filter((field) => !field.formula
    && !field.dataType.toLocaleLowerCase().startsWith('auto number')
    && fieldAccess[`${object.apiName}.${field.apiName}`]?.read
    && (!selectedLayout || layoutFieldNames.includes(field.apiName) || field.required));
  const unplacedRequiredFields = visibleFields.filter((field) => field.required && !layoutFieldNames.includes(field.apiName));
  const allowedPicklistValues = (field: FieldMetadata, recordTypeId = selectedRecordTypeId, values = formValues) => {
    const recordTypeValues = object.recordTypes?.find((recordType) => recordType.id === recordTypeId)?.picklistValues?.[field.apiName];
    const valueSet = recordTypeValues ?? field.picklistValues ?? [];
    if (!field.controllerFieldApiName) return valueSet;
    const controller = object.fields.find((item) => item.apiName === field.controllerFieldApiName);
    const controllerValue = values[field.controllerFieldApiName]
      ?? (editing ? '' : controller?.defaultValue ?? (controller?.dataType === 'Checkbox' ? false : ''));
    if (controllerValue === undefined || controllerValue === null || controllerValue === '') return [];
    return (field.valueSettings?.[String(controllerValue)] ?? []).filter((value) => valueSet.includes(value));
  };
  const changeFieldValue = (apiName: string, value: unknown) => {
    onChange(apiName, value);
    const nextValues = { ...formValues, [apiName]: value };
    object.fields.filter((field) => field.controllerFieldApiName === apiName).forEach((field) => {
      const currentValue = formValues[field.apiName];
      if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        const allowedValues = allowedPicklistValues(field, selectedRecordTypeId, nextValues);
        if (field.dataType === 'Multi-Select Picklist') {
          const currentValues = String(currentValue).split(';').filter(Boolean);
          const retainedValues = currentValues.filter((item) => allowedValues.includes(item));
          if (retainedValues.length !== currentValues.length) onChange(field.apiName, retainedValues.join(';'));
        } else if (!allowedValues.includes(String(currentValue))) {
          onChange(field.apiName, '');
        }
      }
    });
  };
  const lookupDisplayFields = (field: FieldMetadata) => {
    const targetObject = objects.find((item) => item.apiName === field.relationship?.targetObject);
    if (!targetObject) return [];
    const configuredFields = isPhoneViewport
      ? targetObject.searchLayouts?.lookupPhoneDialog ?? targetObject.searchLayouts?.lookupDialog
      : targetObject.searchLayouts?.lookupDialog;
    const fieldNames = configuredFields ?? [];
    const selectedFields = fieldNames.map((name) => targetObject.fields.find((item) => item.apiName === name))
      .filter((item): item is FieldMetadata => Boolean(item && fieldAccess[`${targetObject.apiName}.${item.apiName}`]?.read));
    return configuredFields !== undefined ? selectedFields : targetObject.fields
      .filter((item) => (item.apiName === 'Name' || item.apiName === 'Email')
        && fieldAccess[`${targetObject.apiName}.${item.apiName}`]?.read)
      .slice(0, 2);
  };
  const lookupCompactFields = (field: FieldMetadata) => {
    const targetObject = objects.find((item) => item.apiName === field.relationship?.targetObject);
    const selectedRecord = (lookupRecords[targetObject?.apiName ?? ''] ?? []).find((record) =>
      record.Id === formValues[field.apiName]);
    const relatedRecordTypeId = String(selectedRecord?.RecordTypeId
      ?? targetObject?.recordTypes?.find((item) => item.active && item.isDefault)?.id
      ?? targetObject?.recordTypes?.find((item) => item.active)?.id
      ?? 'master');
    const compactLayout = targetObject ? compactLayoutForRecord(targetObject, relatedRecordTypeId, profileId) : undefined;
    return (compactLayout?.fieldApiNames ?? [])
      .map((name) => targetObject?.fields.find((item) => item.apiName === name))
      .filter((item): item is FieldMetadata => Boolean(item && fieldAccess[`${targetObject?.apiName}.${item.apiName}`]?.read));
  };
  const lookupRecordLabel = (field: FieldMetadata, item: RecordData) => {
    const displayFields = lookupDisplayFields(field);
    return displayFields.map((displayField) => item[displayField.apiName])
      .filter((itemValue) => itemValue !== undefined && itemValue !== null && itemValue !== '')
      .map(String).join(' · ') || String(item.Name ?? item.Email ?? item.Id);
  };
  const openLookupDialog = (field: FieldMetadata) => {
    setLookupDialogField(field);
    setLookupQuery('');
    setIncludeNonmatchingOptionalLookupResults(false);
  };
  const renderField = (field: FieldMetadata) => {
    const rawValue = formValues[field.apiName] ?? (editing ? '' : field.defaultValue);
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    const dataType = field.dataType.toLocaleLowerCase();
    const helpTextId = `record-field-help-${field.apiName}`;
    const common = { id: `record-field-${field.apiName}`, name: field.apiName, required: field.required, disabled: saving || !fieldAccess[`${object.apiName}.${field.apiName}`]?.edit, 'aria-describedby': field.helpText ? helpTextId : undefined };
    const helpText = field.helpText ? <small className="field-help-text" id={helpTextId}>{field.helpText}</small> : null;
    if (dataType === 'checkbox') return <div key={field.apiName}>
      <label className="record-checkbox">
        <input {...common} type="checkbox" checked={Boolean(rawValue ?? false)} onChange={(event) => changeFieldValue(field.apiName, event.target.checked)} />
        <span>{displayFieldLabel(field)}{field.required && <b aria-hidden="true"> *</b>}</span>
      </label>
      {helpText}
    </div>;
    if (field.dataType === 'Geolocation') {
      const coordinates = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? Object.fromEntries(Object.entries(rawValue))
        : {};
      const updateCoordinate = (coordinate: 'latitude' | 'longitude', input: string) => {
        const next = {
          ...coordinates,
          [coordinate]: input === '' ? null : Number(input)
        };
        onChange(field.apiName, next.latitude == null && next.longitude == null ? null : next);
      };
      return <fieldset className="form-label" key={field.apiName}>
        <legend>{displayFieldLabel(field)}{field.required && <b aria-hidden="true"> *</b>}</legend>
        <div className="form-options">
          <label className="form-label">Latitude
            <input className="form-control" type="number" min="-90" max="90" step="any"
              aria-label={`${displayFieldLabel(field)} latitude`} required={field.required}
              disabled={saving || !fieldAccess[`${object.apiName}.${field.apiName}`]?.edit}
              value={coordinates.latitude == null ? '' : String(coordinates.latitude)}
              onChange={(event) => updateCoordinate('latitude', event.target.value)} />
          </label>
          <label className="form-label">Longitude
            <input className="form-control" type="number" min="-180" max="180" step="any"
              aria-label={`${displayFieldLabel(field)} longitude`} required={field.required}
              disabled={saving || !fieldAccess[`${object.apiName}.${field.apiName}`]?.edit}
              value={coordinates.longitude == null ? '' : String(coordinates.longitude)}
              onChange={(event) => updateCoordinate('longitude', event.target.value)} />
          </label>
        </div>
        {helpText}
      </fieldset>;
    }
    if (field.relationship) {
      const options = lookupRecords[field.relationship.targetObject] ?? [];
      const targetObject = objects.find((item) => item.apiName === field.relationship?.targetObject);
      const requiredFilters = object.relatedLookupFilters?.filter((filter) => filter.fieldApiName === field.apiName && filter.required) ?? [];
      const lookupFilterLogic = object.relatedLookupFilterLogic?.[field.apiName] ?? 'All';
      const filteredOptions = options.filter((item) => matchesLookupFilterGroup(item, requiredFilters, formValues, lookupFilterLogic));
      const selectedRecord = options.find((item) => item.Id === value);
      const selectedMatchesFilters = filteredOptions.some((item) => item.Id === value);
      const selectedCompactFields = lookupCompactFields(field);
      return <div className="form-label" key={field.apiName}><span>{displayFieldLabel(field)}{field.required && <b aria-hidden="true"> *</b>}</span>
        <div className="lookup-picker-control">
          <input className="form-control" id={common.id} name={common.name} aria-label={displayFieldLabel(field)}
            value={selectedRecord ? lookupRecordLabel(field, selectedRecord) : ''}
            placeholder={targetObject ? `Search ${targetObject.label}…` : 'Related object unavailable'}
            readOnly aria-readonly="true" required={field.required && !value} disabled={common.disabled}
            onClick={() => { if (!common.disabled && targetObject) openLookupDialog(field); }} />
          <button type="button" className="btn lookup-picker-button" disabled={common.disabled || !targetObject}
            aria-label={`Search ${targetObject?.label ?? 'related records'} for ${displayFieldLabel(field)}`}
            onClick={() => { if (targetObject) openLookupDialog(field); }}>
            <Search size={14} />Search
          </button>
          {value && !common.disabled && <button type="button" className="btn lookup-picker-clear" aria-label={`Clear ${displayFieldLabel(field)}`}
            disabled={field.required} onClick={() => onChange(field.apiName, null)}><X size={14} /></button>}
        </div>
        {selectedRecord && selectedCompactFields.length > 0 && <div className="lookup-selected-card" aria-label={`${targetObject?.label ?? 'Related record'} compact details`}>
          {selectedCompactFields.map((compactField) => <div key={compactField.apiName}><small>{compactField.label}</small><strong>{formatRecordValue(selectedRecord[compactField.apiName])}</strong></div>)}
        </div>}
        {selectedRecord && !selectedMatchesFilters && <small className="lookup-filter-warning">The selected record does not match the required lookup filter. Choose a matching record to continue.</small>}
        {helpText}
      </div>;
    }
    if (object.apiName === 'User' && field.apiName === 'UserRoleId') return <label className="form-label" key={field.apiName}>User Role
      <select className="form-control" value={value} required disabled={common.disabled} onChange={(event) => onChange('UserRoleId',event.target.value)}>
        <option value="">Select role…</option>{userRoles.map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
      </select></label>;
    if (dataType === 'picklist') return <label className="form-label" htmlFor={common.id} key={field.apiName}>{displayFieldLabel(field)}{field.required && <b aria-hidden="true"> *</b>}
      <select className="form-control" {...common} value={value} onChange={(event) => changeFieldValue(field.apiName, event.target.value)}>
        <option value="" disabled={field.required}>{field.required ? 'Select a value…' : '— None —'}</option>
        {(() => {
          const picklistValues = allowedPicklistValues(field);
          return <>
            {value && !picklistValues.includes(value) && <option value={value}>{value}</option>}
            {picklistValues.map((item) => <option key={item} value={item}>{item}</option>)}
          </>;
        })()}
      </select>
      {helpText}
    </label>;
    if (dataType === 'multi-select picklist') return <label className="form-label" htmlFor={common.id} key={field.apiName}>{displayFieldLabel(field)}{field.required && <b aria-hidden="true"> *</b>}
      <select className="form-control" {...common} multiple value={value.split(';').filter(Boolean)} onChange={(event) => changeFieldValue(field.apiName, Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(';'))}>
        {allowedPicklistValues(field).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <small>Select multiple values with Ctrl or Command.</small>
      {helpText}
    </label>;
    // Render legacy connector configuration as editable key/value fields, never raw JSON.
    // Field names come from the saved configuration metadata, not provider-specific code.
    if (object.apiName === 'UneConnector__c' && field.apiName === 'Configuration__c') {
      let configuration: Record<string, unknown> = {};
      try {
        const decoded: unknown = value.trim() ? JSON.parse(value) : {};
        if (!decoded || Array.isArray(decoded) || typeof decoded !== 'object') throw new Error('Invalid connector configuration');
        configuration = decoded as Record<string, unknown>;
      } catch {
        return <div className="form-label record-form-wide" key={field.apiName} role="alert">
          Configuration cannot be edited because its saved format is invalid. No values have been changed.
        </div>;
      }
      const entries = Object.entries(configuration);
      const updateConfiguration = (key: string, nextValue: string) => {
        onChange(field.apiName, JSON.stringify({ ...configuration, [key]: nextValue }));
      };
      return <fieldset className="connector-config-fields record-form-wide" key={field.apiName} disabled={common.disabled}>
        <legend>{displayFieldLabel(field)}</legend>
        {entries.length ? entries.map(([key, fieldValue]) => {
          const label = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
          return <label className="connector-config-row" key={key}>
            <span>{label}</span>
            <input className="form-control" type="text" value={fieldValue == null ? '' : String(fieldValue)}
              onChange={(event) => updateConfiguration(key, event.target.value)} />
          </label>;
        }) : <p className="connector-config-empty">No configuration fields have been defined for this connector.</p>}
        {helpText}
      </fieldset>;
    }
    if (dataType.includes('text area') || dataType.includes('long text')) return <label className="form-label record-form-wide" htmlFor={common.id} key={field.apiName}>{displayFieldLabel(field)}{field.required && <b aria-hidden="true"> *</b>}
      <textarea className="form-control" {...common} maxLength={dataType === 'long text area' ? 131072 : undefined} value={value} onChange={(event) => onChange(field.apiName, event.target.value)} />
      {helpText}
    </label>;
    const type = dataType === 'date' ? 'date'
      : dataType.includes('datetime') ? 'datetime-local'
        : dataType === 'email' ? 'email'
          : dataType === 'url' ? 'url'
            : dataType === 'phone' ? 'tel'
              : dataType.startsWith('number') || dataType.startsWith('currency') || dataType.startsWith('percent') ? 'number'
                : 'text';
    const numericFormat = field.dataType.match(/^(?:Number|Currency|Percent)\((\d+),\s*(\d+)\)$/);
    const numericMaximum = numericFormat
      ? 10 ** (Number(numericFormat[1]) - Number(numericFormat[2])) - 10 ** -Number(numericFormat[2])
      : undefined;
    const textMaximum = field.dataType.match(/^Text\((\d+)\)$/)?.[1];
    return <label className="form-label" htmlFor={common.id} key={field.apiName}>{displayFieldLabel(field)}{field.required && <b aria-hidden="true"> *</b>}
      <input className="form-control" {...common} type={type}
        min={numericMaximum === undefined ? undefined : -numericMaximum}
        max={numericMaximum}
        step={numericFormat ? (Number(numericFormat[2]) ? 10 ** -Number(numericFormat[2]) : 1) : type === 'number' ? 'any' : undefined}
        maxLength={textMaximum ? Number(textMaximum) : field.dataType === 'Text' ? 255 : undefined}
        value={value}
        onChange={(event) => onChange(field.apiName, type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} />
      {helpText}
    </label>;
  };
  return <div className="record-form-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="record-form-dialog surface" role="dialog" aria-modal="true" aria-labelledby="record-form-title" onKeyDown={(event) => { if (event.key === 'Escape' && !saving && !lookupDialogField) onClose(); }}>
      <header><div><div className="eyebrow">{object.label}</div><h2 id="record-form-title">{editing ? 'Edit Record' : `New ${object.label}`}</h2></div>
        <button className="icon-button" aria-label="Close" onClick={onClose} disabled={saving}><X size={16} /></button></header>
      <form onSubmit={onSubmit}>
        {activeRecordTypes.length > 1 && <label className="form-label">Record Type
          <select className="form-control" value={selectedRecordTypeId} disabled={saving} onChange={(event) => {
            const nextRecordTypeId = event.target.value;
            onChange('RecordTypeId', nextRecordTypeId);
            const nextRecordValues = { ...formValues };
            object.fields.filter((field) => field.dataType === 'Picklist' || field.dataType === 'Multi-Select Picklist').forEach((field) => {
              const allowed = allowedPicklistValues(field, nextRecordTypeId, nextRecordValues);
              const current = nextRecordValues[field.apiName];
              if (current !== undefined && current !== null && current !== '') {
                if (field.dataType === 'Multi-Select Picklist') {
                  const selectedValues = String(current).split(';').filter(Boolean);
                  const retainedValues = selectedValues.filter((value) => allowed.includes(value));
                  if (retainedValues.length !== selectedValues.length) {
                    nextRecordValues[field.apiName] = retainedValues.join(';');
                    onChange(field.apiName, retainedValues.join(';'));
                  }
                } else if (!allowed.includes(String(current))) {
                  nextRecordValues[field.apiName] = '';
                  onChange(field.apiName, null);
                }
              }
            });
          }}>
            {activeRecordTypes.map((recordType) => <option key={recordType.id} value={recordType.id}>{recordType.label}</option>)}
          </select>
        </label>}
        {selectedLayout?.sections.length ? <>
          {selectedLayout.sections.map((section) => {
          const sectionFields = section.fieldApiNames.map((name) => visibleFields.find((field) => field.apiName === name)).filter((field): field is FieldMetadata => Boolean(field));
          return <section className="record-form-section" key={section.id}><h3>{section.label}</h3><div className={`record-form-grid columns-${section.columns}`}>{sectionFields.map(renderField)}</div></section>;
          })}
          {unplacedRequiredFields.length > 0 && <section className="record-form-section"><h3>Required Fields</h3><div className="record-form-grid">{unplacedRequiredFields.map(renderField)}</div></section>}
        </> : <div className="record-form-grid">{visibleFields.map(renderField)}</div>}
        {object.apiName === 'User' && !editing && <label className="form-label">Initial Password (12+ characters)
          <input className="form-control" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={saving}
            value={String(formValues.Password ?? '')} onChange={(event) => onChange('Password',event.target.value)} />
          <small>Stored as a password hash. Never shown in records.</small>
        </label>}
        {formError && <div className="records-message" role="alert">{formError}</div>}
        {!actionAllowed && <div className="records-message" role="alert">This action is not enabled for the selected page layout.</div>}
        <footer><button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn btn-brand" disabled={saving || !actionAllowed}>{saving ? 'Saving…' : 'Save'}</button></footer>
      </form>
    </section>
    {lookupDialogField && (() => {
      const targetObject = objects.find((item) => item.apiName === lookupDialogField.relationship?.targetObject);
      const options = lookupRecords[lookupDialogField.relationship?.targetObject ?? ''] ?? [];
      const requiredFilters = object.relatedLookupFilters?.filter((filter) =>
        filter.fieldApiName === lookupDialogField.apiName && filter.required) ?? [];
      const optionalFilters = object.relatedLookupFilters?.filter((filter) =>
        filter.fieldApiName === lookupDialogField.apiName && !filter.required) ?? [];
      const lookupFilterLogic = object.relatedLookupFilterLogic?.[lookupDialogField.apiName] ?? 'All';
      const filteredOptions = options.filter((item) =>
        matchesLookupFilterGroup(item, requiredFilters, formValues, lookupFilterLogic)
        && (includeNonmatchingOptionalLookupResults
          || matchesLookupFilterGroup(item, optionalFilters, formValues, lookupFilterLogic)));
      const displayFields = lookupDisplayFields(lookupDialogField);
      const configuredFields = isPhoneViewport
        ? targetObject?.searchLayouts?.lookupPhoneDialog ?? targetObject?.searchLayouts?.lookupDialog
        : targetObject?.searchLayouts?.lookupDialog;
      const searchableFields = configuredFields !== undefined ? displayFields : targetObject?.fields.filter((field) =>
        (field.apiName === 'Name' || field.apiName === 'Email')
        && fieldAccess[`${targetObject.apiName}.${field.apiName}`]?.read) ?? [];
      const query = lookupQuery.trim().toLocaleLowerCase();
      const matchingOptions = filteredOptions.filter((item) => !query || searchableFields.some((field) =>
        String(item[field.apiName] ?? '').toLocaleLowerCase().includes(query)));
      return <div className="lookup-dialog-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setLookupDialogField(null);
      }}>
        <section className="lookup-dialog surface" role="dialog" aria-modal="true" aria-labelledby="lookup-dialog-title"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') setLookupDialogField(null);
          }}>
          <header><div><div className="eyebrow">{targetObject?.label ?? 'Related Records'}</div>
            <h2 id="lookup-dialog-title">Select {targetObject?.label ?? 'a record'}</h2></div>
            <button type="button" className="icon-button" aria-label="Close lookup dialog" onClick={() => setLookupDialogField(null)}><X size={16} /></button>
          </header>
          <label className="lookup-dialog-search"><Search size={15} /><input autoFocus aria-label={`Search ${targetObject?.label ?? 'records'}`}
            value={lookupQuery} onChange={(event) => setLookupQuery(event.target.value)} placeholder={`Search this ${targetObject?.label.toLocaleLowerCase() ?? 'list'}…`} /></label>
          {optionalFilters.length > 0 && <label className="checkbox-row">
            <input type="checkbox" checked={includeNonmatchingOptionalLookupResults}
              onChange={(event) => setIncludeNonmatchingOptionalLookupResults(event.target.checked)} />
            <span>Include records outside optional lookup filters</span>
          </label>}
          {matchingOptions.length ? <div className="lookup-dialog-results" role="listbox" aria-label={`${targetObject?.label ?? 'Record'} results`}>
            {matchingOptions.map((item) => <button type="button" role="option" aria-selected={String(formValues[lookupDialogField.apiName] ?? '') === item.Id}
              key={item.Id} className="lookup-dialog-result" onClick={() => {
                onChange(lookupDialogField.apiName, item.Id);
                setLookupDialogField(null);
              }}>
              {searchableFields.map((field) => <span key={field.apiName}><small>{displayFieldLabel(field)}</small>{formatRecordValue(item[field.apiName])}</span>)}
              {!searchableFields.length && <span>{String(item.Name ?? item.Email ?? item.Id)}</span>}
            </button>)}
          </div> : <div className="records-empty">{options.length ? 'No matching records satisfy the search and required lookup filters.' : 'No records are available for this lookup.'}</div>}
          <footer><button type="button" className="btn" onClick={() => setLookupDialogField(null)}>Cancel</button></footer>
        </section>
      </div>;
    })()}
  </div>;
}


