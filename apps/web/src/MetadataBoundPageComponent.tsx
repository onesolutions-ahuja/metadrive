import * as React from 'react';
import {useState,useEffect,useRef} from 'react';
// Load the browser API client only during the mounted effect, not on SSR import.
import {presentPageRecords,type ChannelGrant} from './recordPresentationAdapters';
import {filterPageComponentRecords} from './pageComponentBindings';
import {resolvePageActionRoute} from './pageActionRouting';
import {componentLayoutProps} from './pageComponentLayout';
import RegisteredComponent from './RegisteredComponent';
import type {LibraryComponentMetadata,PageComponentMetadata,ObjectMetadata,LightningAppMetadata,LightningPageMetadata,ReportMetadata,FlowDefinitionMetadata} from './metadata';
import type {AppRoute} from './appRouting';

export default function MetadataBoundPageComponent({
  apiRequest, definition, component, objects, apps, pages, currentAppId, pageSessionKey, reports, availableFlows, formFactor, onNavigate, onLaunchFlow, disableActions = false
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
  availableFlows: Array<Pick<FlowDefinitionMetadata, 'apiName' | 'label' | 'flowType' | 'status'>>;
  formFactor: 'Desktop' | 'Phone';
  onNavigate: (route: AppRoute) => void;
  onLaunchFlow: (flowApiName: string, inputs?: Record<string, unknown>) => void;
  disableActions?: boolean;
}) {
  const properties = component.properties;
  const objectApiName = String(properties.objectApiName ?? '');
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
    void import('./authClient').then(({loadFlowScreenRecords})=>loadFlowScreenRecords(objectApiName))
      .then((rows) => { if (active) setRecords(rows); })
      .catch((reason: unknown) => {
        if (active) setDataError(reason instanceof Error ? reason.message : 'Unable to load records');
      })
      .finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [objectApiName, revision]);
  useEffect(() => {
    if (properties.recordPresenterApiName !== 'CommunicationThread') return;
    let active = true;
    setChannelAccess({userId:'',viewAll:false,grants:[],eligibleAssignees:[]});
    void apiRequest<{userId:string;viewAll:boolean;grants:ChannelGrant[];eligibleAssignees:{id:string;name:string;channelAccountId:string}[]}>('/chatter/access')
      .then(value => {if(active) setChannelAccess(value);})
      .catch(() => {if(active) setChannelAccess({userId:'',viewAll:false,grants:[],eligibleAssignees:[]});});
    return () => {active = false;};
  }, [properties.recordPresenterApiName, revision]);
  const fields = objects.find((item) => item.apiName === objectApiName)?.fields ?? [];
  const visibleRecords = filterPageComponentRecords(records, properties.filters, fields);
  const categoryFilterKey = typeof properties.filterKey === 'string' ? properties.filterKey : 'category';
  const categorySource = selectedFilterRecords[categoryFilterKey];
  const configuredCategoryField = String(properties.categoryFieldApiName??'').trim();
  const inferredCategoryField = !configuredCategoryField && categorySource?.sourceObjectApiName
    ? fields.find(field=>field.relationship?.targetObject===categorySource.sourceObjectApiName
      || field.dataType==='Lookup('+categorySource.sourceObjectApiName+')')?.apiName
    : undefined;
  const presented = presentPageRecords(properties.recordPresenterApiName, visibleRecords, channelAccess);
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
      return /^[A-Za-z][A-Za-z0-9_]*$/.test(fieldName) ? visibleRecords[0]?.[fieldName] : undefined;
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
      const value = typeof action.value === 'object' && action.value !== null
        ? String(('value' in action.value ? (action.value as {value:unknown}).value : 'label' in action.value
          ? (action.value as {label:unknown}).label : '') ?? '')
        : String(action.value ?? '');
      const source = action.value && typeof action.value === 'object' ? action.value as Record<string,unknown> : {};
      window.dispatchEvent(new CustomEvent('metadrive:page-filter-selected', {detail:{
        pageSessionKey,filterKey,value,label:String(source.label??value),
        recordId:String(source.recordId??''),sourceObjectApiName:String(source.sourceObjectApiName??'')
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
    const selected = availableFlows.find((flow) => flow.apiName === flowApiName);
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
      onLaunchFlow(flowApiName, inputs);
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
    {dataError && <div className="records-message" role="alert">{dataError}</div>}
    <RegisteredComponent definition={definition} props={{
      ...properties, ...componentLayoutProps(properties, formFactor),
      ...(categoryFilterKey ? {
        selectedCategory:selectedCategories[categoryFilterKey] ?? String(properties.selectedCategory ?? ''),
        selectedCategoryLabel:categorySource?.label ?? '',selectedCategoryRecordId:categorySource?.recordId ?? '',
        categoryFieldApiName:configuredCategoryField||inferredCategoryField||''
      } : {}),
      ...(typeof properties.searchKey === 'string' && properties.searchKey ? {searchQuery:selectedCategories[properties.searchKey] ?? ''} : {}),
      label: component.label, properties, objects, reports, flows: availableFlows,
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
