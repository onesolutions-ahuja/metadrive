import {resolveMetadataProperties} from '../../metadata/Definitions/metadataReferences';
import * as React from 'react';
import {useState,useEffect,useRef} from 'react';
// Load the browser API client only during the mounted effect, not on SSR import.
import {presentPageRecords,type ChannelGrant} from '../../records/RecordWorkspace/recordPresentationAdapters';
import {filterPageComponentRecords,filterPageRecordsBySelection} from '../PageRuntime/pageComponentBindings';
import {resolveMentionProperties} from '../../../one/OneSmartFieldInput/smartFieldMentions';
import { explicitMentionRecordId, useRelationshipMentionContext } from '../../records/RecordFormDialog/useRelationshipMentionContext';
import {resolvePageActionRoute} from '../PageRuntime/pageActionRouting';
import {componentLayoutProps} from '../TemplatePageRuntime/pageComponentLayout';
import RegisteredComponent from '../../components/RegisteredComponent/RegisteredComponent';
import type {LibraryComponentMetadata,PageComponentMetadata,ObjectMetadata,LightningAppMetadata,LightningPageMetadata,ReportMetadata,FlowDefinitionMetadata} from '../../metadata/Definitions/metadata';
import type {AppRoute} from '../../workspace/Navigation/appRouting';

export default function MetadataBoundPageComponent({
  apiRequest, definition, component, objects, apps, pages, currentAppId, pageSessionKey, reports, availableFlows, formFactor, onNavigate, onLaunchFlow, disableActions = false, defaultObjectApiName = '', recordId = ''
}: {
  apiRequest:<T>(path:string,init?:RequestInit)=>Promise<T>;
  definition: LibraryComponentMetadata;
  component: PageComponentMetadata;
  objects: ObjectMetadata[];
  apps: LightningAppMetadata[];
  pages: LightningPageMetadata[];
  currentAppId: string;
  pageSessionKey: string;
  reports: ReportMetadata[];
  availableFlows: Array<Pick<FlowDefinitionMetadata, 'id' | 'apiName' | 'label' | 'flowType' | 'status'>>;
  formFactor: 'Desktop' | 'Phone';
  onNavigate: (route: AppRoute) => void;
  onLaunchFlow: (flowApiName: string, inputs?: Record<string, unknown>, context?:{requestId?:string}) => void;
  disableActions?: boolean;
  defaultObjectApiName?: string;
  recordId?: string;
}) {
  const properties = resolveMetadataProperties({...component.properties,objectApiName:component.properties.objectApiName||defaultObjectApiName},objects,availableFlows);
  const objectApiName = String(properties.objectApiName || defaultObjectApiName || '');
  const mentionRootObjectApiName = defaultObjectApiName || objectApiName;
  // An application-independent session can be referenced by configured Flows.
  const [sessionId, setSessionId] = useState(() => {
    const key = 'metadrive-page-session:' + pageSessionKey;
    try {
      let value = window.sessionStorage.getItem(key);
      if (!value) {
        value = crypto.randomUUID();
        window.sessionStorage.setItem(key, value);
      }
      return value;
    } catch {
      return crypto.randomUUID();
    }
  });
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [dataError, setDataError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Record<string,string>>({});
  const [selectedFilterRecords, setSelectedFilterRecords] = useState<Record<string,{
    recordId:string;label:string;sourceObjectApiName:string
  }>>({});
  useEffect(() => {
    const listener = (event: Event) => {
      const data = (event as CustomEvent<{pageSessionKey:string;filterKey:string;value:string;
        recordId?:string;label?:string;sourceObjectApiName?:string}>).detail;
      if (data?.pageSessionKey !== pageSessionKey || !data.filterKey) return;
      setSelectedCategories(previous => ({...previous,[data.filterKey]:String(data.value??'')}));
      setSelectedFilterRecords(previous => ({...previous,[data.filterKey]:{
        recordId:String(data.recordId??''),label:String(data.label??data.value??''),
        sourceObjectApiName:String(data.sourceObjectApiName??'')
      }}));
    };
    window.addEventListener('metadrive:page-filter-selected',listener);
    return () => window.removeEventListener('metadrive:page-filter-selected',listener);
  },[pageSessionKey]);
  const [dataLoading, setDataLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [channelAccess, setChannelAccess] = useState<{userId: string;viewAll: boolean;grants: ChannelGrant[];eligibleAssignees: {id: string;name: string;channelAccountId: string}[]}>({
    userId: '', viewAll: false, grants: [], eligibleAssignees: []
  });
  const initializedSessions = useRef<Set<string>>(new Set());
  // Any Flow mutation invalidates all components sharing this page session.
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{pageSessionKey:string;sessionId:string}>).detail;
      if (detail?.pageSessionKey !== pageSessionKey) return;
      if (detail.sessionId && detail.sessionId !== sessionId) setSessionId(detail.sessionId);
      setRevision(value => value + 1);
    };
    window.addEventListener('metadrive:page-flow-mutated', sync);
    return () => window.removeEventListener('metadrive:page-flow-mutated', sync);
  }, [pageSessionKey, sessionId]);
  useEffect(() => {
    let active = true;
    setRecords([]);
    setDataError('');
    if (!objectApiName) {
      setDataLoading(false);
      return () => { active = false; };
    }
    setDataLoading(true);
    // Existing shared Object API enforces tenant, field and record permissions.
    void import('../../authentication/Client/authClient').then(({loadFlowScreenRecords})=>loadFlowScreenRecords(objectApiName))
      .then((rows) => { if (active) setRecords(rows); })
      .catch((reason: unknown) => {
        if (active) setDataError(reason instanceof Error ? reason.message : 'Unable to load records');
      })
      .finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [objectApiName, revision]);
  useEffect(() => {
    setChannelAccess({userId:'',viewAll:false,grants:[],eligibleAssignees:[]});
    const accessPath=String(properties.channelAccessPath??'');
    if(!/^\/[A-Za-z0-9/_-]+$/.test(accessPath))return;
    let active = true;
    setChannelAccess({userId:'',viewAll:false,grants:[],eligibleAssignees:[]});
    void apiRequest<{userId:string;viewAll:boolean;grants:ChannelGrant[];eligibleAssignees:{id:string;name:string;channelAccountId:string}[]}>(accessPath)
      .then(value => {if(active) setChannelAccess(value);})
      .catch(() => {if(active) setChannelAccess({userId:'',viewAll:false,grants:[],eligibleAssignees:[]});});
    return () => {active = false;};
  }, [properties.channelAccessPath, properties.recordPresenterApiName, revision]);
  const fields = objects.find((item) => item.apiName === objectApiName)?.fields ?? [];
  const baseRecords = filterPageComponentRecords(records, properties.filters, fields);
  const sharedFilterKey = String(properties.sharedFilterKey ?? '').trim();
  const sharedFilterField = String(properties.sharedFilterFieldApiName ?? '').trim();
  const sharedFilter = selectedFilterRecords[sharedFilterKey];
  const sharedFilterValue = properties.sharedFilterValueSource === 'recordId'
    ? sharedFilter?.recordId : selectedCategories[sharedFilterKey];
  const visibleRecords = sharedFilterKey || sharedFilterField
    ? filterPageRecordsBySelection(baseRecords,fields,sharedFilterField,
        sharedFilterKey ? sharedFilterValue : undefined,properties.sharedFilterRequired===true)
    : baseRecords;
  const mentionContext = useRelationshipMentionContext(objects, mentionRootObjectApiName,
    recordId || explicitMentionRecordId(properties), properties, apiRequest, revision);
  const resolvedProperties = resolveMentionProperties(properties, mentionContext.records, mentionContext.fields, objects, mentionRootObjectApiName);
  const categoryFilterKey = typeof properties.filterKey === 'string' ? properties.filterKey : 'category';
  const categorySource = selectedFilterRecords[categoryFilterKey];
  const configuredCategoryField = String(properties.categoryFieldApiName??'').trim();
  const inferredCategoryField = !configuredCategoryField && categorySource?.sourceObjectApiName
    ? fields.find(field=>field.relationship?.targetObject===categorySource.sourceObjectApiName
      || field.dataType==='Lookup('+categorySource.sourceObjectApiName+')')?.apiName
    : undefined;
  const presented = presentPageRecords(properties.recordPresenterApiName, visibleRecords, channelAccess, properties);
  const rawActions = properties.actionFlows;
  const actionFlows = rawActions && typeof rawActions === 'object' && !Array.isArray(rawActions)
    ? rawActions as Record<string, unknown> : {};
  const resolveInput = (source: unknown, eventPayload: Record<string, unknown>): unknown => {
    if (source === '$session') return sessionId;
    if (source === '$event') return eventPayload;
    if (typeof source === 'string' && source.startsWith('$event.')) {
      return source.slice(7).split('.').reduce<unknown>((current, key) =>
        current && typeof current === 'object' && !['__proto__','prototype','constructor'].includes(key)
          ? (current as Record<string, unknown>)[key] : undefined, eventPayload);
    }
    if (typeof source === 'string' && source.startsWith('$record.')) {
      const fieldName = source.slice(8);
      return /^[A-Za-z][A-Za-z0-9_]*$/.test(fieldName) ? mentionContext.records[mentionRootObjectApiName]?.[fieldName] : undefined;
    }
    return source;
  };
  const onAction = async (action: { event: string; value?: unknown }) => {
    const config = actionFlows[action.event];
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('No metadata event action is configured for "' + action.event + '".');
    }
    const binding = config as Record<string, unknown>;
    if (binding.actionType === 'SetFilter') {
      const filterKey = String(binding.filterKey || 'category');
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(filterKey)) throw new Error('Invalid filter key');
      const source = action.value && typeof action.value === 'object' && !Array.isArray(action.value)
        ? action.value as Record<string,unknown> : {};
      const sourceField = (key:unknown,fallback:unknown) =>
        typeof key==='string'&&/^[A-Za-z][A-Za-z0-9_]*$/.test(key)
          ? source[key]??fallback : fallback;
      const value = String(sourceField(binding.filterValueFieldApiName,
        source.value??source.Id??source.id??source.label??action.value??'')??'');
      const label = String(sourceField(binding.filterLabelFieldApiName,
        source.label??source.Name??source.name??value)??value);
      const recordId = String(source.recordId??source.Id??source.id??'');
      window.dispatchEvent(new CustomEvent('metadrive:page-filter-selected', {detail:{
        pageSessionKey,filterKey,value,label,recordId,
        sourceObjectApiName:String(source.sourceObjectApiName??objectApiName)
      }}));
      return {selected:value};
    }
    if (disableActions) throw new Error('Builder preview permits local filters only. Publish the page to run Flows or navigation.');
    if (binding.actionType === 'Navigate') {
      const target = resolvePageActionRoute(binding, {
        objects, apps, pages, currentAppId, defaultObjectApiName: objectApiName
      });
      // Server endpoints enforce the final object and page authorization checks.
      onNavigate(target);
      return { navigated: true };
    }
    const flowApiName = String(binding.flowApiName ?? '');
    const selected = availableFlows.find((flow) => flow.apiName === flowApiName && flow.status === 'Active');
    if (!selected || selected.status !== 'Active') {
      throw new Error('Choose an active Flow for the "' + action.event + '" action in Page Builder.');
    }
    const payload = action.value && typeof action.value === 'object' && !Array.isArray(action.value)
      ? action.value as Record<string, unknown> : { value: action.value };
    const inputs = Object.fromEntries(Object.entries(
      binding.inputs && typeof binding.inputs === 'object' && !Array.isArray(binding.inputs)
        ? binding.inputs as Record<string, unknown> : {}
    ).map(([key, source]) => [key, resolveInput(source, payload)]));
    setActionError('');
    if (selected.flowType === 'Screen Flow') {
      onLaunchFlow(flowApiName, inputs,{requestId:typeof payload.requestId==='string'?payload.requestId:undefined});
      return { interviewStarted: true };
    }
    if (selected.flowType !== 'Autolaunched Flow') {
      throw new Error('Component event Flow must be Screen or Autolaunched.');
    }
    try {
      const response = await apiRequest<{ outputs?: Record<string, unknown>; interviewId?: string }>(
        '/flows/' + encodeURIComponent(flowApiName) + '/execute', {
          method: 'POST', body: JSON.stringify(inputs)
        });
      if (response.interviewId) throw new Error('This action was paused by a Flow Wait element.');
      let completedSessionId = sessionId;
      if (binding.resetSessionOnSuccess === true) {
        const key = 'metadrive-page-session:' + pageSessionKey;
        const newSession = crypto.randomUUID();
        try { window.sessionStorage.setItem(key, newSession); } catch { /* private session */ }
        completedSessionId = newSession;
        setSessionId(newSession);
      }
      setRevision((value) => value + 1);
      window.dispatchEvent(new CustomEvent('metadrive:page-flow-mutated', {
        detail: {pageSessionKey,sessionId: completedSessionId}
      }));
      return {
        ...response,
        completed: typeof binding.successOutput === 'string'
          && response.outputs?.[binding.successOutput] === binding.successValue
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flow action failed';
      setActionError(message);
      throw error;
    }
  };
  useEffect(() => {
    if (disableActions || !actionFlows.start || initializedSessions.current.has(sessionId)) return;
    initializedSessions.current.add(sessionId);
    void onAction({ event: 'start', value: {} }).catch(() => {
      initializedSessions.current.delete(sessionId);
    });
  }, [sessionId, disableActions]);
  return <div>
    {!objectApiName && <div className="records-message" role="alert">Select a bound object to load records for this component.</div>}
    {dataError && <div className="records-message" role="alert">{dataError}</div>}
    <RegisteredComponent definition={definition} props={{
      ...resolvedProperties, ...componentLayoutProps(properties, formFactor),
      ...(categoryFilterKey ? {
        selectedCategory:selectedCategories[categoryFilterKey] ?? String(properties.selectedCategory ?? ''),
        selectedCategoryLabel:categorySource?.label ?? '',selectedCategoryRecordId:categorySource?.recordId ?? '',
        categoryFieldApiName:configuredCategoryField||inferredCategoryField||''
      } : {}),
      ...(typeof properties.searchKey === 'string' && properties.searchKey ? {searchQuery:selectedCategories[properties.searchKey] ?? ''} : {}),
      label: component.label, properties: resolvedProperties, objects, reports, flows: availableFlows,
       pageSessionKey, componentId: component.id,
      device: formFactor, onNavigate, onLaunchFlow, onAction, actionError,
      loadCompanySettings: () => apiRequest('/metadata/currencies'),
      onChange: (value: unknown) => {
        if (actionFlows.change) void onAction({ event: 'change', value }).catch(() => {});
      },
      loading: dataLoading, sessionId, previewOnly: disableActions,
      ...(objectApiName ? { records: visibleRecords } : {}),
      ...presented
    }} />
  </div>;
}
