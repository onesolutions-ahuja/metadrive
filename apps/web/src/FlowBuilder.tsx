import HttpCalloutFieldEditor from './HttpCalloutFieldEditor';
import { useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  MoreHorizontal,
  MoveRight,
  Plus,
  Redo2,
  Save,
  Search,
  Undo2,
  X
} from 'lucide-react';
import {
  flowElementMetadata,
  type FlowDefinitionMetadata,
  type FlowResourceMetadata,
  type FlowVersionMetadata,
  type FlowValidationMetadata,
  type NamedCredentialMetadata,
  type EmailAlertMetadata,
  type ConnectorProviderMetadata,
  type IntegrationConnectionMetadata,
  type ObjectMetadata,
  type PlatformEventMetadata,
  type UserMetadata,
  type ApprovalProcessMetadata,
  type LibraryComponentMetadata
} from './metadata';

type FlowBuilderProps = {
  landing?: boolean;
  flow: FlowDefinitionMetadata;
  flows: FlowDefinitionMetadata[];
  libraryComponents: LibraryComponentMetadata[];
  platformEvents: PlatformEventMetadata[];
  objects: ObjectMetadata[];
  users: UserMetadata[];
  approvalProcesses: ApprovalProcessMetadata[];
  namedCredentials: NamedCredentialMetadata[];
  emailAlerts: EmailAlertMetadata[];
  connectorProviders: ConnectorProviderMetadata[];
  integrationConnections: IntegrationConnectionMetadata[];
  validation: FlowValidationMetadata | null;
  isDirty: boolean;
  canRunFlows: boolean;
  selectedId: number;
  toolTab: 'Elements' | 'Manager';
  canUndo: boolean;
  canRedo: boolean;
  onExit: () => void;
  onFlowChange: (flow: FlowDefinitionMetadata) => void;
  onSelectFlow: (apiName: string) => void;
  onRestoreFlowVersion: (version: FlowVersionMetadata) => void;
  onExportFlow: () => void;
  onImportFlow: (file: File) => void;
  onCloneFlow: (flow: FlowDefinitionMetadata) => void;
  onDeactivateFlow: (apiName: string) => void;
  onDeleteFlow: (apiName: string) => void;
  onCreateFlow: (label: string, flowType: FlowDefinitionMetadata['flowType']) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelect: (id: number) => void;
  onToolTab: (tab: 'Elements' | 'Manager') => void;
  onAdd: (type: string, afterId?: number) => void;
  onUpdateLabel: (id: number, label: string) => void;
  onUpdateConfig: (id: number, key: string, value: unknown) => void;
  onRemove: (id: number) => void;
  onValidate: () => void;
  onSave: () => void;
  onActivate: () => void;
  onRun: () => void;
  onDebug: () => void;
  onNotify: (message: string) => void;
  onSaveNamedCredential: (credential: {
    id?: string; name: string; label: string; protocol: NamedCredentialMetadata['protocol']; baseUrl: string;
    authType: NamedCredentialMetadata['authType']; headerName?: string; username?: string; secret?: string;
  }) => Promise<void>;
  onDeleteNamedCredential: (id: string) => Promise<void>;
  onRotateNamedCredential: (id: string) => Promise<void>;
  onSaveEmailAlert: (alert: {
    id?: string; name: string; label: string; objectApiName: string; namedCredentialId: string;
    fromEmail: string; recipients: string; subject: string; body: string;
  }) => Promise<void>;
  onDeleteEmailAlert: (id: string) => Promise<void>;
  onSavePlatformEvent: (event: PlatformEventMetadata) => Promise<void>;
  onDeletePlatformEvent: (apiName: string) => Promise<void>;
};

type ConfigRow = Record<string, unknown>;
type DecisionOutcome = { name: string; label: string; conditionLogic: string; conditions: ConfigRow[] };

function rowsFrom(value: unknown): ConfigRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is ConfigRow => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}
function outcomesFrom(value: unknown): DecisionOutcome[] {
  return rowsFrom(value).map((item, index) => ({
    name: typeof item.name === 'string' ? item.name : `Outcome_${index + 1}`,
    label: typeof item.label === 'string' ? item.label : `Outcome ${index + 1}`,
    conditionLogic: typeof item.conditionLogic === 'string' ? item.conditionLogic : displayValue(rowsFrom(item.conditions)[0]?.logic) || 'All',
    conditions: rowsFrom(item.conditions)
  }));
}

function screenOutcomesFrom(value: unknown): Array<{ name: string; label: string }> {
  const outcomes = rowsFrom(value).map((item, index) => ({
    name: typeof item.name === 'string' ? item.name : `Outcome_${index + 1}`,
    label: typeof item.label === 'string' ? item.label : `Outcome ${index + 1}`
  }));
  return outcomes.length ? outcomes : [{ name: 'Default', label: 'Next' }];
}

function displayValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export default function FlowBuilder({
  landing = false, flow, flows, libraryComponents, platformEvents, objects, users, approvalProcesses, namedCredentials, emailAlerts, connectorProviders, integrationConnections, validation, isDirty, canRunFlows, selectedId, toolTab, canUndo, canRedo, onExit,
  onFlowChange, onSelectFlow, onRestoreFlowVersion, onExportFlow, onImportFlow, onCloneFlow, onDeactivateFlow, onDeleteFlow, onCreateFlow, onUndo, onRedo, onSelect, onToolTab,
  onAdd, onUpdateLabel, onUpdateConfig, onRemove, onValidate, onSave, onActivate, onRun, onDebug, onNotify,
  onSaveNamedCredential, onDeleteNamedCredential, onRotateNamedCredential, onSaveEmailAlert, onDeleteEmailAlert, onSavePlatformEvent, onDeletePlatformEvent
}: FlowBuilderProps) {
  const flowComponents = libraryComponents.filter((component) => component.surfaces.includes('flow'));
  const [elementSearch, setElementSearch] = useState('');
  const [newFlowLabel, setNewFlowLabel] = useState('');
  const [newFlowType, setNewFlowType] = useState<FlowDefinitionMetadata['flowType']>('Screen Flow');
  const flowTypeOptions: Array<{ type: FlowDefinitionMetadata['flowType']; description: string }> = [
    { type: 'Screen Flow', description: 'Guide a user through screens and actions.' },
    { type: 'Record-Triggered Flow', description: 'Run when a record is created or updated.' },
    { type: 'Autolaunched Flow', description: 'Run in the background or from another flow.' },
    { type: 'Schedule-Triggered Flow', description: 'Run records on a scheduled basis.' },
    { type: 'Platform Event-Triggered Flow', description: 'Run when a platform event is published.' }
  ];
  const formulaFunctions = [
    'TRUE', 'FALSE', 'IF', 'CASE', 'AND', 'OR', 'NOT', 'XOR', 'ISNEW', 'ISCLONE', 'ISCHANGED', 'PRIORVALUE', 'ISBLANK', 'ISNULL', 'BLANKVALUE', 'NULLVALUE', 'EXACT',
    'ISNUMBER', 'LEN', 'ASCII', 'LOWER', 'UPPER', 'TRIM', 'PROPER', 'LEFT', 'RIGHT', 'MID', 'FIND',
    'SUBSTITUTE', 'CONCATENATE', 'CONTAINS', 'BEGINS', 'ISPICKVAL', 'INCLUDES', 'VALUE', 'TEXT', 'DATE',
    'DATEVALUE', 'DATETIMEVALUE', 'TIME', 'TIMEVALUE', 'TODAY', 'NOW', 'TIMENOW', 'YEAR', 'MONTH', 'DAY',
    'WEEKDAY', 'WEEKNUM', 'HOUR', 'MINUTE', 'SECOND', 'MILLISECOND', 'ADDDAYS', 'DAYS', 'ADDMONTHS',
    'TZOFFSET', 'ABS', 'SQRT', 'POWER', 'EXP', 'LN', 'LOG', 'PI', 'DEGREES', 'RADIANS', 'SIN', 'COS',
    'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2', 'SINH', 'COSH', 'TANH', 'COT', 'SIGN', 'CEILING', 'MCEILING',
    'FLOOR', 'MFLOOR', 'MIN', 'MAX', 'MOD', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'TRUNC', 'REGEX', 'GEOLOCATION',
    'DISTANCE', 'CURRENCYRATE', 'CONVERTCURRENCY', 'CASESAFEID', 'HYPERLINK', 'IMAGE', 'URLENCODE',
    'ENCODEURL', 'URLDECODE', 'HTMLENCODE', 'JSENCODE', 'REPT', 'REVERSE', 'LPAD', 'RPAD', 'BR'
  ];
  const formulaOperators = ['+', '-', '*', '/', '^', '&', '=', '<>', '!=', '<', '<=', '>', '>=', 'AND', 'OR'];
  const isElementAvailable = (type: string) =>
    (type !== 'Screen' || flow.flowType === 'Screen Flow')
    && (type !== 'Roll Back Records' || ['Screen Flow', 'Autolaunched Flow'].includes(flow.flowType));
  const [resourceLabel, setResourceLabel] = useState('');
  const [resourceType, setResourceType] = useState<FlowResourceMetadata['type']>('Variable');
  const [resourceDataType, setResourceDataType] = useState('Text');
  const [resourceValue, setResourceValue] = useState('');
  const [formulaFunction, setFormulaFunction] = useState('IF');
  const [formulaInsertField, setFormulaInsertField] = useState('');
  const [formulaOperator, setFormulaOperator] = useState('+');
  const [credentialId, setCredentialId] = useState('');
  const [credentialName, setCredentialName] = useState('');
  const [credentialLabel, setCredentialLabel] = useState('');
  const [credentialProtocol, setCredentialProtocol] = useState<NamedCredentialMetadata['protocol']>('HTTPS');
  const [credentialBaseUrl, setCredentialBaseUrl] = useState('');
  const [credentialAuthType, setCredentialAuthType] = useState<NamedCredentialMetadata['authType']>('Bearer');
  const [credentialHeaderName, setCredentialHeaderName] = useState('x-api-key');
  const [credentialUsername, setCredentialUsername] = useState('');
  const [credentialSecret, setCredentialSecret] = useState('');
  const [emailAlertId, setEmailAlertId] = useState('');
  const [emailAlertName, setEmailAlertName] = useState('');
  const [emailAlertLabel, setEmailAlertLabel] = useState('');
  const [emailAlertObject, setEmailAlertObject] = useState('');
  const [emailAlertCredentialId, setEmailAlertCredentialId] = useState('');
  const [emailAlertFrom, setEmailAlertFrom] = useState('');
  const [emailAlertRecipients, setEmailAlertRecipients] = useState('');
  const [emailAlertSubject, setEmailAlertSubject] = useState('');
  const [emailAlertBody, setEmailAlertBody] = useState('');
  const [platformEventApiName, setPlatformEventApiName] = useState('');
  const [platformEventLabel, setPlatformEventLabel] = useState('');
  const [platformEventDescription, setPlatformEventDescription] = useState('');
  const [platformEventFields, setPlatformEventFields] = useState<PlatformEventMetadata['fields']>([]);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const formulaEditorRef = useRef<HTMLTextAreaElement>(null);
  const selected = flow.elements.find((element) => element.id === selectedId) ?? flow.elements[0];
  const selectedObject = objects.find((object) => object.apiName === flow.triggerObject);
  const selectedPlatformEvent = platformEvents.find((event) => event.apiName === flow.triggerObject);
  const toolboxGroups = [...new Set(flowElementMetadata.map((item) => item.group))];
  const graphNodeWidth = 320;
  const graphColumnGap = 115;
  const graphRowGap = 155;
  const graphPadding = 56;
  const graphLayers = new Map<number, number>();
  const start = flow.elements.find((element) => element.type === 'Start');
  const pending = start ? [start.id] : [];
  if (start) graphLayers.set(start.id, 0);
  while (pending.length) {
    const from = pending.shift();
    if (from === undefined) continue;
    for (const connector of flow.connectors.filter((item) => item.from === from)) {
      if (!graphLayers.has(connector.to)) {
        graphLayers.set(connector.to, (graphLayers.get(from) ?? 0) + 1);
        pending.push(connector.to);
      }
    }
  }
  const lastGraphLayer = Math.max(-1, ...graphLayers.values()) + 1;
  flow.elements.filter((element) => !graphLayers.has(element.id)).forEach((element, index) => {
    graphLayers.set(element.id, lastGraphLayer + index);
  });
  const elementsByLayer = new Map<number, FlowDefinitionMetadata['elements']>();
  flow.elements.forEach((element) => {
    const layer = graphLayers.get(element.id) ?? 0;
    elementsByLayer.set(layer, [...(elementsByLayer.get(layer) ?? []), element]);
  });
  const graphColumns = Math.max(1, ...Array.from(elementsByLayer.values(), (elements) => elements.length));
  const graphRows = Math.max(1, elementsByLayer.size);
  const graphWidth = graphPadding * 2 + graphColumns * graphNodeWidth + (graphColumns - 1) * graphColumnGap;
  const graphHeight = graphPadding * 2 + graphRows * graphRowGap;
  const graphPositions = new Map<number, { x: number; y: number }>();
  elementsByLayer.forEach((elements, layer) => {
    const layerWidth = elements.length * graphNodeWidth + (elements.length - 1) * graphColumnGap;
    const offset = (graphWidth - layerWidth) / 2;
    elements.forEach((element, index) => graphPositions.set(element.id, {
      x: offset + index * (graphNodeWidth + graphColumnGap),
      y: graphPadding + layer * graphRowGap
    }));
  });
  const fitGraphToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const horizontalFit = (canvas.clientWidth - 48) / graphWidth;
    const verticalFit = (canvas.clientHeight - 48) / graphHeight;
    setZoom(Math.max(0.35, Math.min(1.5, horizontalFit, verticalFit)));
  };

  const setConfig = (key: string, value: unknown) => {
    if (selected) onUpdateConfig(selected.id, key, value);
  };
  const setStartConfig = (key: string, value: unknown) => {
    if (!selected) return;
    onUpdateConfig(selected.id, key, value);
  };
  const updateFlowType = (flowType: FlowDefinitionMetadata['flowType']) => {
    const triggerObject = flowType === 'Platform Event-Triggered Flow'
      ? flow.triggerObject && platformEvents.some((event) => event.apiName === flow.triggerObject)
        ? flow.triggerObject
        : platformEvents[0]?.apiName ?? null
      : flowType === 'Record-Triggered Flow' || flowType === 'Schedule-Triggered Flow'
      ? flow.triggerObject ?? objects.find((object) => object.apiName !== 'User')?.apiName ?? null
      : null;
    const startConfig = flowType === 'Schedule-Triggered Flow'
      ? { entryConditions: [], startDate: '', startTime: '', frequency: '', timeZone: displayValue(flow.startConfig.timeZone) || 'UTC' }
      : flowType === 'Platform Event-Triggered Flow'
        ? { entryConditions: rowsFrom(flow.startConfig.entryConditions), ...(flow.startConfig.conditionLogic ? { conditionLogic: flow.startConfig.conditionLogic } : {}) }
        : flowType === 'Record-Triggered Flow'
          ? { entryConditions: rowsFrom(flow.startConfig.entryConditions), trigger: 'created-or-updated', runWhen: 'after-save', ...(flow.startConfig.conditionLogic ? { conditionLogic: flow.startConfig.conditionLogic } : {}) }
          : {};
    const elements = flow.elements
      .filter((element) => element.type !== 'Screen' || flowType === 'Screen Flow')
      .map((element) => element.type === 'Start'
        ? { ...element, config: { ...element.config, ...startConfig, ...(triggerObject ? { object: triggerObject } : {}) } }
        : element);
    onFlowChange({ ...flow, flowType, triggerObject, startConfig, elements });
  };
  const addPlatformEventField = () => setPlatformEventFields((current) => [...current, {
    apiName: '',
    label: '',
    dataType: 'Text(255)',
    required: false,
    unique: false
  }]);
  const savePlatformEvent = async () => {
    const label = platformEventLabel.trim();
    const name = platformEventApiName.trim() || `${label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}__e`;
    await onSavePlatformEvent({
      apiName: name,
      label,
      description: platformEventDescription,
      fields: platformEventFields.map((field) => ({
        ...field,
        apiName: field.apiName.trim(),
        label: field.label.trim()
      }))
    });
    setPlatformEventApiName(name);
  };
  const updateConnector = (id: string, update: Partial<FlowDefinitionMetadata['connectors'][number]>) => {
    onFlowChange({ ...flow, connectors: flow.connectors.map((connector) => connector.id === id ? { ...connector, ...update } : connector) });
  };
  const setConnectorKind = (id: string, kind: FlowDefinitionMetadata['connectors'][number]['kind']) => {
    const connector = flow.connectors.find((item) => item.id === id);
    updateConnector(id, {
      kind,
      scheduledPath: kind === 'scheduled'
        ? connector?.scheduledPath ?? { timeSourceFieldApiName: '', offsetAmount: 0, offsetUnit: 'Hours' }
        : undefined
    });
  };
  const editCredential = (credential?: NamedCredentialMetadata) => {
    setCredentialId(credential?.id ?? '');
    setCredentialName(credential?.name ?? '');
    setCredentialLabel(credential?.label ?? '');
    setCredentialProtocol(credential?.protocol ?? 'HTTPS');
    setCredentialBaseUrl(credential?.baseUrl ?? '');
    setCredentialAuthType(credential?.authType ?? 'Bearer');
    setCredentialHeaderName(credential?.headerName ?? 'x-api-key');
    setCredentialUsername('');
    setCredentialSecret('');
  };
  const editEmailAlert = (alert?: EmailAlertMetadata) => {
    setEmailAlertId(alert?.id ?? '');
    setEmailAlertName(alert?.name ?? '');
    setEmailAlertLabel(alert?.label ?? '');
    setEmailAlertObject(alert?.objectApiName ?? objects.find((object) => object.apiName !== 'User')?.apiName ?? '');
    setEmailAlertCredentialId(alert?.namedCredentialId ?? namedCredentials.find((credential) => credential.protocol === 'SMTP')?.id ?? '');
    setEmailAlertFrom(alert?.fromEmail ?? '');
    setEmailAlertRecipients(alert?.recipients ?? '');
    setEmailAlertSubject(alert?.subject ?? '');
    setEmailAlertBody(alert?.body ?? '');
  };
  const submitEmailAlert = async () => {
    try {
      await onSaveEmailAlert({
        ...(emailAlertId ? { id: emailAlertId } : {}),
        name: emailAlertName.trim(),
        label: emailAlertLabel.trim(),
        objectApiName: emailAlertObject,
        namedCredentialId: emailAlertCredentialId,
        fromEmail: emailAlertFrom.trim(),
        recipients: emailAlertRecipients.trim(),
        subject: emailAlertSubject.trim(),
        body: emailAlertBody
      });
      editEmailAlert();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to save Email Alert');
    }
  };
  const submitCredential = async () => {
    try {
      await onSaveNamedCredential({
        ...(credentialId ? { id: credentialId } : {}),
        name: credentialName.trim(),
        label: credentialLabel.trim(),
        protocol: credentialProtocol,
        baseUrl: credentialBaseUrl.trim(),
        authType: credentialAuthType,
        ...(credentialHeaderName.trim() ? { headerName: credentialHeaderName.trim() } : {}),
        ...(credentialUsername ? { username: credentialUsername } : {}),
        ...(credentialSecret ? { secret: credentialSecret } : {})
      });
      editCredential();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Unable to save Named Credential');
    }
  };
  const addConnector = () => {
    if (!selected) return;
    const target = flow.elements.find((element) => element.id !== selected.id && element.type !== 'Start');
    if (!target) {
      onNotify('Add another element before creating a branch');
      return;
    }
    const outgoing = flow.connectors.filter((connector) => connector.from === selected.id && connector.kind !== 'fault');
    let label = '';
    if (selected.type === 'Decision') {
      const outcomes = outcomesFrom(selected.config.outcomes);
      const outcome = outcomes.find((item) => !outgoing.some((connector) => connector.label === item.label || connector.label === item.name));
      if (!outcome) {
        onNotify('Every Decision outcome already has a connector');
        return;
      }
      label = outcome.label;
    } else if (selected.type === 'Screen') {
      const outcomes = screenOutcomesFrom(selected.config.outcomes);
      const outcome = outcomes.find((item) => !outgoing.some((connector) => connector.label === item.label || connector.label === item.name));
      if (!outcome) {
        onNotify('Every Screen outcome already has a connector');
        return;
      }
      label = outcome.label;
    } else if (selected.type === 'Loop') {
      label = outgoing.some((connector) => connector.label.toLowerCase().includes('for each'))
        ? 'After Last'
        : 'For Each';
    }
    onFlowChange({
      ...flow,
      connectors: [...flow.connectors, {
        id: `connector-${crypto.randomUUID()}`,
        from: selected.id,
        to: target.id,
        label,
        kind: 'normal'
      }]
    });
  };
  const addResource = () => {
    const label = resourceLabel.trim();
    const name = label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!name) return;
    if (flow.resources.some((resource) => resource.name.toLowerCase() === name.toLowerCase())) {
      onNotify('A flow resource with this API name already exists');
      return;
    }
    const resource: FlowResourceMetadata = {
      name,
      label,
      type: resourceType,
      dataType: resourceDataType,
      isCollection: resourceType === 'Record Collection',
      availableForInput: false,
      availableForOutput: false,
      ...(resourceValue ? { value: resourceValue } : {})
    };
    onFlowChange({ ...flow, resources: [...flow.resources, resource] });
    setResourceLabel('');
    setResourceValue('');
  };
  const updateResource = (name: string, update: Partial<FlowResourceMetadata>) => {
    onFlowChange({
      ...flow,
      resources: flow.resources.map((resource) => resource.name === name ? { ...resource, ...update } : resource)
    });
  };
  const insertFormulaToken = (text: string, caretOffset = text.length) => {
    const editor = formulaEditorRef.current;
    const start = editor?.selectionStart ?? resourceValue.length;
    const end = editor?.selectionEnd ?? start;
    setResourceValue(`${resourceValue.slice(0, start)}${text}${resourceValue.slice(end)}`);
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + caretOffset, start + caretOffset);
    });
  };
  const addCondition = (key: string) => {
    setConfig(key, [...rowsFrom(selected?.config[key]), { field: '', operator: 'Equals', value: '' }]);
  };
  const updateCondition = (key: string, index: number, update: Partial<ConfigRow>) => {
    setConfig(key, rowsFrom(selected?.config[key]).map((row, rowIndex) => rowIndex === index ? { ...row, ...update } : row));
  };
  const renderConditions = (key: string, objectFields: ObjectMetadata['fields']) => (
    <div className="flow-config-list">
      {rowsFrom(selected?.config[key]).map((condition, index) => (
        <div className="flow-config-row" key={`${key}-${index}`}>
          <select className="form-control" aria-label="Condition field" value={displayValue(condition.field)} onChange={(event) => updateCondition(key, index, { field: event.target.value })}>
            <option value="">Select field or resource</option>
            <optgroup label="Record Fields">{objectFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</optgroup>
            <optgroup label="Flow Resources">{flow.resources.map((resource) => <option key={resource.name} value={`{${resource.name}}`}>{resource.label}</option>)}</optgroup>
          </select>
          <select className="form-control" aria-label="Condition operator" value={displayValue(condition.operator) || 'Equals'} onChange={(event) => updateCondition(key, index, { operator: event.target.value })}>
            {['Equals', 'Not Equals', 'Is Null', 'Is Not Null', 'Greater Than', 'Less Than', 'Contains', 'Starts With'].map((operator) => <option key={operator}>{operator}</option>)}
          </select>
          {condition.operator !== 'Is Null' && condition.operator !== 'Is Not Null' && <input className="form-control" aria-label="Condition value" value={displayValue(condition.value)} onChange={(event) => updateCondition(key, index, { value: event.target.value })} />}
          <button className="row-menu" aria-label="Remove condition" onClick={() => setConfig(key, rowsFrom(selected?.config[key]).filter((_, rowIndex) => rowIndex !== index))}><X size={14} /></button>
        </div>
      ))}
      <button className="text-action" onClick={() => addCondition(key)}><Plus size={13} />Add Condition</button>
    </div>
  );
  const renderConditionLogic = (label: string, value: unknown, count: number, onChange: (logic: string) => void) => {
    const logic = displayValue(value);
    const mode = value === undefined || value === null || logic === 'All' ? 'All' : logic === 'Any' ? 'Any' : 'Custom';
    return <>
      <label className="form-label">{label}<select className="form-control" value={mode} onChange={(event) => onChange(event.target.value === 'Custom' ? '' : event.target.value)}>
        <option value="All">All Conditions Are Met (AND)</option>
        <option value="Any">Any Condition Is Met (OR)</option>
        <option value="Custom">Custom Condition Logic</option>
      </select></label>
      {mode === 'Custom' && <>
        <label className="form-label">Custom Logic<input className="form-control" aria-label={`${label} expression`} placeholder="1 AND (2 OR 3)" value={logic} onChange={(event) => onChange(event.target.value)} /></label>
        <p className="settings-panel-copy">Use condition row numbers (1–{count}) with AND, OR, and parentheses.</p>
      </>}
    </>;
  };
  const renderFieldValues = () => {
    const object = objects.find((item) => item.apiName === displayValue(selected?.config.object));
    const savedValues = rowsFrom(selected?.config.fieldValues);
    const values = savedValues.length
      ? savedValues
      : typeof selected?.config.field === 'string'
        ? [{ field: selected.config.field, value: selected.config.value }]
        : [];
    return <div className="flow-config-list">
      {values.map((fieldValue, index) => (
        <div className="flow-config-row" key={`field-value-${index}`}>
          <select className="form-control" aria-label="Field to assign" value={displayValue(fieldValue.field)} onChange={(event) => setConfig('fieldValues', values.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item))}>
            <option value="">Select field</option>{object?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
          </select>
          <input className="form-control" aria-label="Assigned value" placeholder="Value or resource" value={displayValue(fieldValue.value)} onChange={(event) => setConfig('fieldValues', values.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
          <button className="row-menu" aria-label="Remove field value" onClick={() => setConfig('fieldValues', values.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
        </div>
      ))}
      <button className="text-action" onClick={() => setConfig('fieldValues', [...values, { field: '', value: '' }])}><Plus size={13} />Add Field</button>
    </div>;
  };
  const renderStartSettings = () => (
    <>
      {flow.flowType === 'Platform Event-Triggered Flow' && <>
        <label className="form-label">Platform Event<select className="form-control" value={flow.triggerObject ?? ''} onChange={(event) => setStartConfig('object', event.target.value)}><option value="">Select platform event</option>{platformEvents.map((platformEvent) => <option key={platformEvent.apiName} value={platformEvent.apiName}>{platformEvent.label} ({platformEvent.apiName})</option>)}</select></label>
        <label className="form-label">Entry Conditions</label>
        {renderConditions('entryConditions', selectedPlatformEvent?.fields ?? [])}
        {renderConditionLogic('Condition Requirements', flow.startConfig.conditionLogic, rowsFrom(flow.startConfig.entryConditions).length, (logic) => setStartConfig('conditionLogic', logic))}
      </>}
      {(flow.flowType === 'Record-Triggered Flow' || flow.flowType === 'Schedule-Triggered Flow') && <>
        <label className="form-label">Object<select className="form-control" value={flow.triggerObject ?? ''} onChange={(event) => setStartConfig('object', event.target.value)}><option value="">Select object</option>{objects.filter((object) => object.apiName !== 'User').map((object) => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}</select></label>
        {flow.flowType === 'Record-Triggered Flow' && <>
          <label className="form-label">Trigger<select className="form-control" value={displayValue(flow.startConfig.trigger) || 'created-or-updated'} onChange={(event) => setStartConfig('trigger', event.target.value)}><option value="created">A record is created</option><option value="updated">A record is updated</option><option value="created-or-updated">A record is created or updated</option><option value="deleted">A record is deleted</option></select></label>
          <label className="form-label">Optimize the Flow For<select className="form-control" value={displayValue(flow.startConfig.runWhen) || 'after-save'} onChange={(event) => setStartConfig('runWhen', event.target.value)}><option value="before-save">Fast Field Updates (before-save)</option><option value="after-save">Actions and Related Records (after-save)</option></select></label>
          <label className="form-label">Trigger Order<input className="form-control" type="number" min={1} max={2000} step={1} value={displayValue(flow.startConfig.triggerOrder)} onChange={(event) => setStartConfig('triggerOrder', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
          <p className="settings-panel-copy">Optional order from 1 to 2000. Lower numbers run first among active flows on the same object and save phase.</p>
          <label className="form-label">Entry Conditions</label>
          {renderConditions('entryConditions', selectedObject?.fields ?? [])}
          {renderConditionLogic('Condition Requirements', flow.startConfig.conditionLogic, rowsFrom(flow.startConfig.entryConditions).length, (logic) => setStartConfig('conditionLogic', logic))}
          <label className="form-label">When to Run for Updated Records<select className="form-control" value={displayValue(flow.startConfig.updatedRecordBehavior) || 'every-time'} onChange={(event) => setStartConfig('updatedRecordBehavior', event.target.value)}><option value="every-time">Every time a record is updated and meets conditions</option><option value="transition">Only when a record is updated to meet conditions</option></select></label>
        </>}
        {flow.flowType === 'Schedule-Triggered Flow' && <>
          <label className="form-label">Start Date<input className="form-control" type="date" value={displayValue(flow.startConfig.startDate)} onChange={(event) => setStartConfig('startDate', event.target.value)} /></label>
          <label className="form-label">Start Time<input className="form-control" type="time" value={displayValue(flow.startConfig.startTime)} onChange={(event) => setStartConfig('startTime', event.target.value)} /></label>
          <label className="form-label">Time Zone<input className="form-control" value={displayValue(flow.startConfig.timeZone) || 'UTC'} placeholder="America/Los_Angeles" onChange={(event) => setStartConfig('timeZone', event.target.value)} /></label>
          <p className="settings-panel-copy">Enter an IANA time zone, such as America/Los_Angeles. Recurring runs follow local wall time across daylight-saving changes.</p>
          <label className="form-label">Frequency<select className="form-control" value={displayValue(flow.startConfig.frequency)} onChange={(event) => setStartConfig('frequency', event.target.value)}><option value="">Select frequency</option><option value="Once">Once</option><option value="Daily">Daily</option><option value="Weekly">Weekly</option></select></label>
          <label className="form-label">Entry Conditions</label>{renderConditions('entryConditions', selectedObject?.fields ?? [])}
          {renderConditionLogic('Condition Requirements', flow.startConfig.conditionLogic, rowsFrom(flow.startConfig.entryConditions).length, (logic) => setStartConfig('conditionLogic', logic))}
        </>}
      </>}
      {(flow.flowType === 'Screen Flow' || flow.flowType === 'Autolaunched Flow') && <p className="info-callout">{flow.flowType === 'Screen Flow' ? 'This flow starts when launched by a user or supported Lightning entry point.' : 'This flow runs without screens when invoked by another automation or API.'}</p>}
    </>
  );
  const renderElementSettings = () => {
    if (!selected || selected.type === 'Start') return renderStartSettings();
    if (selected.type === 'Roll Back Records') {
      return <div className="info-callout">
        Restores record changes made earlier in this Flow transaction. Execution continues, so later record changes can still be saved.
      </div>;
    }
    if (selected.type === 'Publish Platform Event') {
      const platformEvent = platformEvents.find((event) => event.apiName === displayValue(selected.config.eventApiName));
      const fieldValues = rowsFrom(selected.config.fieldValues);
      return <>
        <label className="form-label">Platform Event<select className="form-control" value={displayValue(selected.config.eventApiName)} onChange={(event) => onFlowChange({
          ...flow,
          elements: flow.elements.map((element) => element.id === selected.id
            ? { ...element, config: { ...element.config, eventApiName: event.target.value, fieldValues: [] } }
            : element)
        })}><option value="">Select platform event</option>{platformEvents.map((event) => <option key={event.apiName} value={event.apiName}>{event.label} ({event.apiName})</option>)}</select></label>
        <p className="settings-panel-copy">Map event fields to literal values or Flow resource references such as {'{!$Record.Id}'}.</p>
        <div className="flow-config-list">{fieldValues.map((fieldValue, index) => <div className="flow-config-row" key={`platform-event-field-${index}`}>
          <select className="form-control" aria-label="Platform event field" value={displayValue(fieldValue.field)} onChange={(event) => setConfig('fieldValues', fieldValues.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item))}>
            <option value="">Select event field</option>{platformEvent?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
          </select>
          <input className="form-control" aria-label="Platform event value" placeholder="Value or resource" value={displayValue(fieldValue.value)} onChange={(event) => setConfig('fieldValues', fieldValues.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
          <button className="row-menu" aria-label="Remove event field mapping" onClick={() => setConfig('fieldValues', fieldValues.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
        </div>)}
          {platformEvent && <button className="text-action" onClick={() => setConfig('fieldValues', [...fieldValues, { field: '', value: '' }])}><Plus size={13} />Add Field</button>}
        </div>
      </>;
    }
    if (selected.type === 'Decision') {
      const outcomes = outcomesFrom(selected.config.outcomes);
      const decisionObject = objects.find((object) => object.apiName === displayValue(selected.config.object)) ?? selectedObject;
      const setOutcomes = (next: DecisionOutcome[]) => setConfig('outcomes', next);
      return <div className="flow-config-list"><h3>Outcomes</h3>
        <label className="form-label">Object<select className="form-control" value={decisionObject?.apiName ?? ''} onChange={(event) => setConfig('object', event.target.value)}><option value="">Select object</option>{objects.map((object) => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}</select></label>
        {outcomes.map((outcome, index) => <div className="metadata-card" key={outcome.name}>
          <label className="form-label">Outcome Label<input className="form-control" value={outcome.label} disabled={outcome.name === 'Default'} onChange={(event) => setOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value, name: item.name === 'Default' ? 'Default' : event.target.value.replace(/[^A-Za-z0-9]+/g, '_') } : item))} /></label>
          {outcome.name !== 'Default' && <>
            {renderConditionLogic('Condition Requirements', outcome.conditionLogic ?? 'All', outcome.conditions.length, (logic) => setOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, conditionLogic: logic } : item)))}
            {outcome.conditions.map((condition, conditionIndex) => <div className="flow-config-row" key={`outcome-${index}-condition-${conditionIndex}`}>
              <select className="form-control" aria-label="Outcome condition field" value={displayValue(condition.field)} onChange={(event) => setOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, conditions: item.conditions.map((entry, entryIndex) => entryIndex === conditionIndex ? { ...entry, field: event.target.value } : entry) } : item))}><option value="">Select field or resource</option>{decisionObject && <optgroup label="Record Fields">{decisionObject.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</optgroup>}<optgroup label="Flow Resources">{flow.resources.map((resource) => <option key={resource.name} value={`{${resource.name}}`}>{resource.label}</option>)}</optgroup></select>
              <select className="form-control" aria-label="Outcome condition operator" value={displayValue(condition.operator) || 'Equals'} onChange={(event) => setOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, conditions: item.conditions.map((entry, entryIndex) => entryIndex === conditionIndex ? { ...entry, operator: event.target.value } : entry) } : item))}>{['Equals', 'Not Equals', 'Is Null', 'Is Not Null', 'Greater Than', 'Less Than', 'Contains', 'Starts With'].map((operator) => <option key={operator}>{operator}</option>)}</select>
              {condition.operator !== 'Is Null' && condition.operator !== 'Is Not Null' && <input className="form-control" aria-label="Outcome condition value" value={displayValue(condition.value)} onChange={(event) => setOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, conditions: item.conditions.map((entry, entryIndex) => entryIndex === conditionIndex ? { ...entry, value: event.target.value } : entry) } : item))} />}
              <button className="row-menu" aria-label="Remove outcome condition" onClick={() => setOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, conditions: item.conditions.filter((_, entryIndex) => entryIndex !== conditionIndex) } : item))}><X size={14} /></button>
            </div>)}
            <button className="text-action" onClick={() => setOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, conditions: [...item.conditions, { field: '', operator: 'Equals', value: '' }] } : item))}><Plus size={13} />Add Condition</button>
          </>}
          {outcome.name !== 'Default' && <button className="row-menu" aria-label={`Remove ${outcome.label} outcome`} onClick={() => setOutcomes(outcomes.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>}
        </div>)}
        <button className="text-action" onClick={() => setOutcomes([...outcomes.filter((item) => item.name !== 'Default'), { name: `Outcome_${outcomes.length + 1}`, label: `Outcome ${outcomes.length + 1}`, conditionLogic: 'All', conditions: [] }, ...outcomes.filter((item) => item.name === 'Default')])}><Plus size={13} />Add Outcome</button>
        <p className="settings-panel-copy">Create a matching connector below for each outcome path.</p>
      </div>;
    }
    if (selected.type === 'Assignment') {
      const triggerObject = objects.find((object) => object.apiName === flow.triggerObject);
      const beforeSave = flow.flowType === 'Record-Triggered Flow' && flow.startConfig.runWhen === 'before-save';
      return <>
      <label className="form-label">Variable<select className="form-control" value={displayValue(selected.config.variable)} onChange={(event) => setConfig('variable', event.target.value)}><option value="">Select variable</option>{flow.resources.length > 0 && <optgroup label="Flow Resources">{flow.resources.map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</optgroup>}{beforeSave && triggerObject && <optgroup label="$Record Fields">{triggerObject.fields.filter((field) => !field.formula && !['AutoNumber', 'Auto Number'].includes(field.dataType)).map((field) => <option key={field.apiName} value={`$Record.${field.apiName}`}>{field.label}</option>)}</optgroup>}</select></label>
      <label className="form-label">Operator<select className="form-control" value={displayValue(selected.config.operator) || 'Assign'} onChange={(event) => setConfig('operator', event.target.value)}>{['Assign', 'Add', 'Subtract', 'Multiply', 'Divide', 'Add At Beginning', 'Add At End', 'Remove All'].map((operator) => <option key={operator}>{operator}</option>)}</select></label>
      <label className="form-label">Value<input className="form-control" value={displayValue(selected.config.value)} onChange={(event) => setConfig('value', event.target.value)} /></label>
    </>;
    }
    if (selected.type === 'Loop') return <>
      <label className="form-label">Collection Variable<select className="form-control" value={displayValue(selected.config.collection)} onChange={(event) => setConfig('collection', event.target.value)}><option value="">Select collection</option>{flow.resources.filter((resource) => resource.isCollection).map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</select></label>
      <label className="form-label">Direction<select className="form-control" value={displayValue(selected.config.direction) || 'First to last'} onChange={(event) => setConfig('direction', event.target.value)}><option>First to last</option><option>Last to first</option></select></label>
      <label className="form-label">Loop Variable<input className="form-control" value={displayValue(selected.config.loopVariable)} onChange={(event) => setConfig('loopVariable', event.target.value)} /></label>
    </>;
    if (selected.type === 'Collection Filter') {
      const collections = flow.resources.filter((resource) => resource.type === 'Record Collection');
      const collection = collections.find((resource) => resource.name === selected.config.collection);
      const object = objects.find((item) => item.apiName === collection?.dataType);
      return <>
        <label className="form-label">Collection Variable<select className="form-control" value={displayValue(selected.config.collection)} onChange={(event) => setConfig('collection', event.target.value)}><option value="">Select a record collection</option>{collections.map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</select></label>
        {renderConditionLogic('Condition Requirements', selected.config.conditionLogic ?? 'All', rowsFrom(selected.config.conditions).length, (logic) => setConfig('conditionLogic', logic))}
        <label className="form-label">Filter Conditions</label>{renderConditions('conditions', object?.fields ?? [])}
        <label className="form-label">Filtered Collection<select className="form-control" value={displayValue(selected.config.outputCollection)} onChange={(event) => setConfig('outputCollection', event.target.value)}><option value="">Select an output collection</option>{collections.filter((resource) => resource.name !== collection?.name && resource.dataType === collection?.dataType).map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</select></label>
      </>;
    }
    if (selected.type === 'Collection Sort') {
      const collections = flow.resources.filter((resource) => resource.type === 'Record Collection');
      const collection = collections.find((resource) => resource.name === selected.config.collection);
      const object = objects.find((item) => item.apiName === collection?.dataType);
      return <>
        <label className="form-label">Collection Variable<select className="form-control" value={displayValue(selected.config.collection)} onChange={(event) => setConfig('collection', event.target.value)}><option value="">Select a record collection</option>{collections.map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</select></label>
        <label className="form-label">Sort By<select className="form-control" value={displayValue(selected.config.sortField)} onChange={(event) => setConfig('sortField', event.target.value)}><option value="">Select a field</option>{object?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</select></label>
        <label className="form-label">Sort Order<select className="form-control" value={displayValue(selected.config.sortOrder) || 'Ascending'} onChange={(event) => setConfig('sortOrder', event.target.value)}><option>Ascending</option><option>Descending</option></select></label>
        <label className="form-label">Sorted Collection<select className="form-control" value={displayValue(selected.config.outputCollection)} onChange={(event) => setConfig('outputCollection', event.target.value)}><option value="">Select an output collection</option>{collections.filter((resource) => resource.name !== collection?.name && resource.dataType === collection?.dataType).map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</select></label>
      </>;
    }
    if (selected.type === 'Transform') {
      const collections = flow.resources.filter((resource) => resource.type === 'Record Collection');
      const source = collections.find((resource) => resource.name === selected.config.collection);
      const output = collections.find((resource) => resource.name === selected.config.outputCollection);
      const sourceObject = objects.find((item) => item.apiName === source?.dataType);
      const targetObject = objects.find((item) => item.apiName === output?.dataType);
      const mappings = rowsFrom(selected.config.mappings);
      const updateMappings = (next: ConfigRow[]) => setConfig('mappings', next);
      return <>
        <label className="form-label">Source Collection<select className="form-control" value={displayValue(selected.config.collection)} onChange={(event) => setConfig('collection', event.target.value)}><option value="">Select a record collection</option>{collections.map((resource) => <option key={resource.name} value={resource.name}>{resource.label} · {resource.dataType}</option>)}</select></label>
        <label className="form-label">Output Collection<select className="form-control" value={displayValue(selected.config.outputCollection)} onChange={(event) => setConfig('outputCollection', event.target.value)}><option value="">Select an output collection</option>{collections.filter((resource) => resource.name !== source?.name).map((resource) => <option key={resource.name} value={resource.name}>{resource.label} · {resource.dataType}</option>)}</select></label>
        <h3>Field Mappings</h3>
        {mappings.map((mapping, index) => <div className="flow-config-row" key={`transform-mapping-${index}`}>
          <select className="form-control" aria-label={`Transform source field ${index + 1}`} value={displayValue(mapping.sourceField)} onChange={(event) => updateMappings(mappings.map((item, itemIndex) => itemIndex === index ? { ...item, sourceField: event.target.value } : item))}><option value="">Source field</option>{sourceObject?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</select>
          <select className="form-control" aria-label={`Transform target field ${index + 1}`} value={displayValue(mapping.targetField)} onChange={(event) => updateMappings(mappings.map((item, itemIndex) => itemIndex === index ? { ...item, targetField: event.target.value } : item))}><option value="">Target field</option>{targetObject?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</select>
          <button className="row-menu" aria-label="Remove transform mapping" onClick={() => updateMappings(mappings.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
        </div>)}
        <button className="text-action" onClick={() => updateMappings([...mappings, { sourceField: '', targetField: '' }])}><Plus size={13} />Add Field Mapping</button>
        <p className="settings-panel-copy">Transform creates mapped in-memory records in the output collection; it does not create or update database records.</p>
      </>;
    }
    if (selected.type === 'Wait') return <>
      <label className="form-label">Wait Type<select className="form-control" value={displayValue(selected.config.waitType) || 'Duration'} onChange={(event) => setConfig('waitType', event.target.value)}><option>Duration</option><option>Specific Time</option></select></label>
      {displayValue(selected.config.waitType) === 'Specific Time'
        ? <><label className="form-label">Resume At<input className="form-control" type="datetime-local" value={displayValue(selected.config.dateTime)} onChange={(event) => setConfig('dateTime', event.target.value)} /></label>
          <label className="form-label">Time Zone<input className="form-control" value={displayValue(selected.config.timeZone) || 'UTC'} placeholder="America/Los_Angeles" onChange={(event) => setConfig('timeZone', event.target.value)} /></label>
          <p className="settings-panel-copy">Enter an IANA time zone. The Wait resumes at this local time; nonexistent daylight-saving times are rejected.</p></>
        : <><label className="form-label">Wait Amount<input className="form-control" type="number" min="1" value={displayValue(selected.config.amount) || '1'} onChange={(event) => setConfig('amount', Number(event.target.value))} /></label>
          <label className="form-label">Unit<select className="form-control" value={displayValue(selected.config.unit) || 'Hours'} onChange={(event) => setConfig('unit', event.target.value)}>{['Minutes', 'Hours', 'Days'].map((unit) => <option key={unit}>{unit}</option>)}</select></label></>}
    </>;
    if (['Get Records', 'Create Records', 'Update Records', 'Delete Records'].includes(selected.type)) {
      const object = objects.find((item) => item.apiName === displayValue(selected.config.object));
      const fieldsToStore = Array.isArray(selected.config.fields)
        ? selected.config.fields.filter((item): item is string => typeof item === 'string')
        : null;
      const recordLimit = displayValue(selected.config.recordLimit) || '1';
      const outputResources = flow.resources.filter((resource) => resource.type === (recordLimit === 'all' ? 'Record Collection' : 'Record'));
      return <>
        <label className="form-label">Object<select className="form-control" value={displayValue(selected.config.object)} onChange={(event) => setConfig('object', event.target.value)}><option value="">Select object</option>{objects.map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}</select></label>
        {selected.type === 'Get Records' && <>
          <label className="form-label">How Many Records to Store<select className="form-control" value={recordLimit} onChange={(event) => setConfig('recordLimit', event.target.value)}><option value="1">Only the first record</option><option value="all">All records</option></select></label>
          <label className="form-label">Sort By<select className="form-control" value={displayValue(selected.config.sortField)} onChange={(event) => setConfig('sortField', event.target.value)}><option value="">No sorting</option>{object?.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</select></label>
          <label className="form-label">Sort Order<select className="form-control" value={displayValue(selected.config.sortOrder) || 'Ascending'} onChange={(event) => setConfig('sortOrder', event.target.value)}><option>Ascending</option><option>Descending</option></select></label>
          <label className="form-label">Output Variable<select className="form-control" value={displayValue(selected.config.outputVariable)} onChange={(event) => setConfig('outputVariable', event.target.value)}><option value="">Use default output</option>{outputResources.map((resource) => <option key={resource.name} value={resource.name}>{resource.label} · {resource.name}</option>)}</select></label>
          <label className="form-label">Fields to Store<select className="form-control" value={fieldsToStore ? 'selected' : 'all'} onChange={(event) => setConfig('fields', event.target.value === 'all' ? 'all' : [])}><option value="all">Automatically store all fields</option><option value="selected">Choose fields</option></select></label>
          {fieldsToStore && <div className="field-selector-list">{object?.fields.map((field) => <label className="checkbox-row" key={field.apiName}><input type="checkbox" checked={fieldsToStore.includes(field.apiName)} onChange={() => setConfig('fields', fieldsToStore.includes(field.apiName) ? fieldsToStore.filter((name) => name !== field.apiName) : [...fieldsToStore, field.apiName])} />{field.label}<small className="api-name">{field.apiName}</small></label>)}</div>}
        </>}
        {selected.type !== 'Create Records' && <>{renderConditionLogic('Filter Logic', selected.config.conditionLogic ?? 'All', rowsFrom(selected.config.conditions).length, (logic) => setConfig('conditionLogic', logic))}<label className="form-label">Filter Conditions</label>{renderConditions('conditions', object?.fields ?? [])}</>}
        {selected.type !== 'Delete Records' && selected.type !== 'Get Records' && <><label className="form-label">Set Field Values</label>{renderFieldValues()}</>}
      </>;
    }
    if (selected.type === 'Screen') {
      const screenFields = rowsFrom(selected.config.fields);
      const outcomes = screenOutcomesFrom(selected.config.outcomes);
      const updateOutcomes = (next: Array<{ name: string; label: string }>, renamed?: { from: string[]; to: string }) => onFlowChange({
        ...flow,
        elements: flow.elements.map((element) => element.id === selected.id
          ? { ...element, config: { ...element.config, outcomes: next } }
          : element),
        connectors: flow.connectors
          .filter((connector) => connector.from !== selected.id || connector.kind === 'fault'
            || !connector.label || renamed?.from.includes(connector.label) || next.some((outcome) => outcome.label === connector.label || outcome.name === connector.label))
          .map((connector) => renamed && connector.from === selected.id && renamed.from.includes(connector.label)
            ? { ...connector, label: renamed.to }
            : connector)
      });
      return <div className="flow-config-list"><h3>Screen Fields</h3>
        <label className="form-label">Screen Layout<select className="form-control" value={displayValue(selected.config.layout) || 'One Column'} onChange={(event) => setConfig('layout', event.target.value)}><option>One Column</option><option>Two Columns</option></select></label>
        {screenFields.map((field, index) => <div className="metadata-card" key={`screen-field-${index}`}>
          <label className="form-label">Label<input className="form-control" value={displayValue(field.label)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /></label>
          {field.type === 'Custom Component'
            ? <>
              <label className="form-label">API Name<input className="form-control" value={displayValue(field.apiName)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, apiName: event.target.value.replace(/[^A-Za-z0-9_]/g, '') } : item))} /></label>
              <label className="form-label">Component<select className="form-control" value={displayValue(field.componentApiName)} onChange={(event) => {
                const component = flowComponents.find((item) => item.apiName === event.target.value);
                setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? {
                  ...item,
                  componentApiName: event.target.value,
                  width: component?.resize?.defaultWidth ?? 320,
                  height: component?.resize?.defaultHeight ?? 180
                } : item));
              }}>
                <option value="">Select a registered component</option>
                {flowComponents.map((component) => <option key={component.apiName} value={component.apiName}>{component.label}</option>)}
              </select></label>
              <label className="form-label">Width (px)<input className="form-control" type="number"
                min={Math.min(libraryComponents.find((item) => item.apiName === field.componentApiName)?.resize?.minWidth ?? 120, 2000)} max={2000}
                value={displayValue(field.width) || libraryComponents.find((item) => item.apiName === field.componentApiName)?.resize?.defaultWidth || 320}
                onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, width: Number(event.target.value) } : item))} /></label>
              <label className="form-label">Height (px)<input className="form-control" type="number"
                min={Math.min(libraryComponents.find((item) => item.apiName === field.componentApiName)?.resize?.minHeight ?? 60, 2000)} max={2000}
                value={displayValue(field.height) || libraryComponents.find((item) => item.apiName === field.componentApiName)?.resize?.defaultHeight || 180}
                onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, height: Number(event.target.value) } : item))} /></label>
              <label className="form-label">Column Span<select className="form-control" value={displayValue(field.columnSpan) || '1'} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, columnSpan: Number(event.target.value) } : item))}><option value="1">One column</option><option value="2">Full width</option></select></label>
              <label className="form-label">Component Props (JSON)<textarea className="form-control" rows={4} value={displayValue(field.componentPropsJson) || '{}'} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, componentPropsJson: event.target.value } : item))} /></label>
              <label className="checkbox-row"><input type="checkbox" checked={field.required === true} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} />Required</label>
            </>
            : field.type === 'Display Text'
            ? <label className="form-label">Text Content<textarea className="form-control" rows={4} value={displayValue(field.text)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} /></label>
            : field.type === 'Display Image'
              ? <>
                <label className="form-label">Image URL<input className="form-control" type="url" value={displayValue(field.imageUrl)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: event.target.value } : item))} placeholder="https://example.com/image.png" /></label>
                <label className="form-label">Alternative Text<input className="form-control" value={displayValue(field.imageAltText)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, imageAltText: event.target.value } : item))} /></label>
              </>
              : field.type === 'Section'
                ? <>
                  <label className="form-label">Description<textarea className="form-control" rows={2} maxLength={255} value={displayValue(field.description)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} /></label>
                  <label className="form-label">Columns<select className="form-control" value={displayValue(field.columns) || 1} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, columns: Number(event.target.value) } : item))}><option value={1}>One Column</option><option value={2}>Two Columns</option></select></label>
                </>
            : <>
          <label className="form-label">API Name<input className="form-control" value={displayValue(field.apiName)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, apiName: event.target.value.replace(/[^A-Za-z0-9_]/g, '') } : item))} /></label>
          <label className="form-label">Help Text<input className="form-control" value={displayValue(field.helpText)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, helpText: event.target.value } : item))} /></label>
          {!['Address', 'Name', 'Lookup', 'Choice Lookup', 'Data Table', 'File Upload', 'Repeater', 'Custom Component'].includes(String(field.type)) && <label className="form-label">Default Value{['Checkbox', 'Toggle'].includes(String(field.type))
            ? <input className="form-control" type="checkbox" checked={field.defaultValue === true} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: event.target.checked } : item))} />
            : field.type === 'Multi-Select Picklist'
              ? <textarea className="form-control" rows={2} value={Array.isArray(field.defaultValue) ? field.defaultValue.filter((choice): choice is string => typeof choice === 'string').join('\n') : ''} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: event.target.value.split(/\r?\n/).map((choice) => choice.trim()).filter(Boolean) } : item))} />
              : <input className="form-control" type={['Number', 'Currency', 'Slider'].includes(String(field.type)) ? 'number' : field.type === 'Date' ? 'date' : field.type === 'Time' ? 'time' : field.type === 'Date/Time' ? 'datetime-local' : 'text'} value={displayValue(field.defaultValue)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: ['Number', 'Currency', 'Slider'].includes(String(field.type)) ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value } : item))} />}</label>}
          {field.type === 'Multi-Select Picklist' && <small className="settings-panel-copy">Enter one default choice per line.</small>}
          {!['Display Text', 'Display Image', 'Section'].includes(String(field.type)) && <label className="form-label">Data Type<select className="form-control" value={displayValue(field.type) || 'Text'} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => {
            if (itemIndex !== index) return item;
            if (event.target.value === 'Custom Component') {
              const component = flowComponents[0];
              return {
                ...item,
                type: event.target.value,
                componentApiName: component?.apiName ?? '',
                width: component?.resize?.defaultWidth ?? 320,
                height: component?.resize?.defaultHeight ?? 180,
                componentPropsJson: '{}',
                apiName: displayValue(item.apiName) || `Custom_Component_${index + 1}`
              };
            }
            return { ...item, type: event.target.value, defaultValue: undefined };
          }))}>{['Text', 'Password', 'Number', 'Currency', 'Slider', 'Date', 'Time', 'Date/Time', 'Email', 'URL', 'Phone', 'Checkbox', 'Toggle', 'Picklist', 'Multi-Select Picklist', 'Long Text Area', 'Display Text', 'Display Image', 'Section', 'Address', 'Name', 'Lookup', 'Choice Lookup', 'Data Table', 'File Upload', 'Repeater', ...(flowComponents.length ? ['Custom Component'] : [])].map((type) => <option key={type}>{type}</option>)}</select></label>}
          {['Lookup', 'Choice Lookup'].includes(String(field.type)) && <>
            <label className="form-label">Target Object<select className="form-control" value={displayValue(field.objectApiName)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, objectApiName: event.target.value, displayField: 'Name' } : item))}><option value="">Select object</option>{objects.map((object) => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}</select></label>
            {field.type === 'Choice Lookup' && <>
              <label className="form-label">Choice Label Field<select className="form-control" value={displayValue(field.displayField) || 'Name'} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, displayField: event.target.value } : item))}><option value="Name">Name</option>{objects.find((object) => object.apiName === field.objectApiName)?.fields.filter((item) => item.apiName !== 'Name').map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}</select></label>
              <label className="checkbox-row"><input type="checkbox" checked={field.multipleSelections === true} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, multipleSelections: event.target.checked, defaultValue: undefined } : item))} />Allow multiple selections</label>
            </>}
          </>}
          {field.type === 'Data Table' && <>
            <label className="form-label">Record Collection<select className="form-control" value={displayValue(field.collection)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, collection: event.target.value, columns: [] } : item))}><option value="">Select collection</option>{flow.resources.filter((resource) => resource.type === 'Record Collection').map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</select></label>
            <label className="checkbox-row"><input type="checkbox" checked={field.multiselect === true} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, multiselect: event.target.checked } : item))} />Allow multiple row selection</label>
            {(() => {
              const dataType = flow.resources.find((resource) => resource.name === field.collection)?.dataType;
              const tableObject = objects.find((object) => object.apiName === dataType);
              return tableObject ? <fieldset className="field-selector-list"><legend className="form-label">Displayed Columns</legend>{tableObject.fields.map((column) => {
                const selectedColumns = Array.isArray(field.columns) ? field.columns.filter((item): item is string => typeof item === 'string') : [];
                return <label className="checkbox-row" key={column.apiName}><input type="checkbox" checked={selectedColumns.includes(column.apiName)} onChange={() => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, columns: selectedColumns.includes(column.apiName) ? selectedColumns.filter((item) => item !== column.apiName) : [...selectedColumns, column.apiName] } : item))} />{column.label}</label>;
              })}</fieldset> : null;
            })()}
          </>}
          {field.type === 'File Upload' && <>
            <label className="form-label">Maximum Files<input className="form-control" type="number" min={1} max={10} value={displayValue(field.maxFiles) || 1} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, maxFiles: Number(event.target.value) } : item))} /></label>
            <label className="form-label">Maximum File Size (KB)<input className="form-control" type="number" min={1} max={512} value={displayValue(field.maxFileSize) || 512} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, maxFileSize: Number(event.target.value) } : item))} /></label>
            <label className="form-label">Allowed MIME Types (one per line; blank allows any type)<textarea className="form-control" rows={2} value={Array.isArray(field.allowedTypes) ? field.allowedTypes.filter((item): item is string => typeof item === 'string').join('\n') : ''} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, allowedTypes: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) } : item))} /></label>
          </>}
          {field.type === 'Repeater' && <>
            <label className="form-label">Minimum Rows<input className="form-control" type="number" min={0} max={50} value={displayValue(field.minimumRows) || 0} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, minimumRows: Number(event.target.value) } : item))} /></label>
            <label className="form-label">Maximum Rows<input className="form-control" type="number" min={1} max={50} value={displayValue(field.maximumRows) || 10} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, maximumRows: Number(event.target.value) } : item))} /></label>
            {(Array.isArray(field.subfields) ? field.subfields.filter((item): item is ConfigRow => typeof item === 'object' && item !== null && !Array.isArray(item)) : []).map((subfield, subIndex, subfields) => <div className="flow-config-row" key={`repeater-${subIndex}`}>
              <input className="form-control" aria-label={`Repeater field ${subIndex + 1} label`} placeholder="Field label" value={displayValue(subfield.label)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, subfields: subfields.map((child, childIndex) => childIndex === subIndex ? { ...child, label: event.target.value } : child) } : item))} />
              <input className="form-control" aria-label={`Repeater field ${subIndex + 1} API name`} placeholder="API name" value={displayValue(subfield.apiName)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, subfields: subfields.map((child, childIndex) => childIndex === subIndex ? { ...child, apiName: event.target.value.replace(/[^A-Za-z0-9_]/g, '') } : child) } : item))} />
              <select className="form-control" aria-label={`Repeater field ${subIndex + 1} type`} value={displayValue(subfield.type) || 'Text'} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, subfields: subfields.map((child, childIndex) => childIndex === subIndex ? { ...child, type: event.target.value } : child) } : item))}>{['Text', 'Number', 'Date', 'Email', 'Checkbox'].map((type) => <option key={type}>{type}</option>)}</select>
              <label className="checkbox-row"><input type="checkbox" checked={subfield.required === true} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, subfields: subfields.map((child, childIndex) => childIndex === subIndex ? { ...child, required: event.target.checked } : child) } : item))} />Required</label>
              <button className="row-menu" aria-label={`Remove repeater field ${subIndex + 1}`} onClick={() => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, subfields: subfields.filter((_, childIndex) => childIndex !== subIndex) } : item))}><X size={14} /></button>
            </div>)}
            <button className="text-action" onClick={() => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, subfields: [...(Array.isArray(item.subfields) ? item.subfields : []), { label: 'New Field', apiName: `Field_${(Array.isArray(item.subfields) ? item.subfields.length : 0) + 1}`, type: 'Text', required: false }] } : item))}><Plus size={13} />Add Repeater Field</button>
          </>}
          {['Text', 'Password', 'Long Text Area', 'Email', 'URL', 'Phone'].includes(String(field.type ?? 'Text')) && <>
            <label className="form-label">Minimum Length<input className="form-control" type="number" min={0} value={displayValue(field.minLength)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, minLength: event.target.value === '' ? undefined : Number(event.target.value) } : item))} /></label>
            <label className="form-label">Maximum Length<input className="form-control" type="number" min={0} value={displayValue(field.maxLength)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, maxLength: event.target.value === '' ? undefined : Number(event.target.value) } : item))} /></label>
          </>}
          {['Number', 'Currency', 'Slider'].includes(String(field.type)) && <>
            <label className="form-label">Minimum Value<input className="form-control" type="number" value={displayValue(field.min)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, min: event.target.value === '' ? undefined : Number(event.target.value) } : item))} /></label>
            <label className="form-label">Maximum Value<input className="form-control" type="number" value={displayValue(field.max)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, max: event.target.value === '' ? undefined : Number(event.target.value) } : item))} /></label>
            <label className="form-label">Step<input className="form-control" type="number" min={0.001} value={displayValue(field.step)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, step: event.target.value === '' ? undefined : Number(event.target.value) } : item))} /></label>
          </>}
          {['Text', 'Long Text Area'].includes(String(field.type ?? 'Text')) && <>
            <label className="form-label">Validation Pattern<input className="form-control" value={displayValue(field.pattern)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, pattern: event.target.value || undefined } : item))} /></label>
            <label className="form-label">Validation Message<input className="form-control" maxLength={255} value={displayValue(field.validationMessage)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, validationMessage: event.target.value || undefined } : item))} /></label>
          </>}
          {['Picklist', 'Multi-Select Picklist'].includes(String(field.type)) && <label className="form-label">Choices (one per line)<textarea className="form-control" rows={3} value={Array.isArray(field.choices) ? field.choices.filter((choice): choice is string => typeof choice === 'string').join('\n') : ''} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, choices: event.target.value.split(/\r?\n/).map((choice) => choice.trim()).filter(Boolean) } : item))} /></label>}
          {['Picklist', 'Multi-Select Picklist'].includes(String(field.type)) && <label className="form-label">Display As<select className="form-control" value={displayValue(field.displayAs) || (field.type === 'Picklist' ? 'Dropdown' : 'Multi-Select Dropdown')} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, displayAs: event.target.value } : item))}>{(field.type === 'Picklist' ? ['Dropdown', 'Radio Buttons'] : ['Multi-Select Dropdown', 'Checkbox Group']).map((mode) => <option key={mode}>{mode}</option>)}</select></label>}
          {!['Display Text', 'Display Image', 'Section', 'Custom Component'].includes(String(field.type)) && <label className="checkbox-row"><input type="checkbox" checked={field.required === true} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} />Required</label>}
          {screenFields.filter((candidate) => !['Display Text', 'Display Image', 'Section'].includes(String(candidate.type)) && candidate.apiName !== field.apiName).length > 0 && <>
            <label className="form-label">Visibility Logic<select className="form-control" value={displayValue(field.visibilityLogic) || 'All'} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, visibilityLogic: event.target.value } : item))}><option>All</option><option>Any</option></select></label>
            {rowsFrom(field.visibilityConditions).map((condition, conditionIndex) => <div className="flow-config-row" key={`${index}-visibility-${conditionIndex}`}>
              <select className="form-control" aria-label="Visibility controlling field" value={displayValue(condition.field)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, visibilityConditions: rowsFrom(item.visibilityConditions).map((row, rowIndex) => rowIndex === conditionIndex ? { ...row, field: event.target.value } : row) } : item))}>
                <option value="">Choose field</option>{screenFields.filter((candidate) => !['Display Text', 'Display Image', 'Section'].includes(String(candidate.type)) && candidate.apiName !== field.apiName).map((candidate) => <option key={displayValue(candidate.apiName)} value={displayValue(candidate.apiName)}>{displayValue(candidate.label)}</option>)}
              </select>
              <select className="form-control" aria-label="Visibility operator" value={displayValue(condition.operator) || 'Equals'} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, visibilityConditions: rowsFrom(item.visibilityConditions).map((row, rowIndex) => rowIndex === conditionIndex ? { ...row, operator: event.target.value } : row) } : item))}>
                {['Equals', 'Not Equals', 'Is Null', 'Is Not Null', 'Contains', 'Starts With'].map((operator) => <option key={operator}>{operator}</option>)}
              </select>
              {!['Is Null', 'Is Not Null'].includes(String(condition.operator)) && <input className="form-control" aria-label="Visibility comparison value" value={displayValue(condition.value)} onChange={(event) => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, visibilityConditions: rowsFrom(item.visibilityConditions).map((row, rowIndex) => rowIndex === conditionIndex ? { ...row, value: event.target.value } : row) } : item))} />}
              <button className="row-menu" aria-label="Remove visibility condition" onClick={() => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, visibilityConditions: rowsFrom(item.visibilityConditions).filter((_, rowIndex) => rowIndex !== conditionIndex) } : item))}><X size={14} /></button>
            </div>)}
            <button className="text-action" onClick={() => setConfig('fields', screenFields.map((item, itemIndex) => itemIndex === index ? { ...item, visibilityConditions: [...rowsFrom(item.visibilityConditions), { field: '', operator: 'Equals', value: '' }] } : item))}><Plus size={13} />Add Visibility Condition</button>
          </>}
          </>}
          <button className="row-menu" aria-label="Remove screen field" onClick={() => setConfig('fields', screenFields.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
        </div>)}
        <button className="text-action" onClick={() => setConfig('fields', [...screenFields, { label: 'New Screen Field', apiName: 'New_Screen_Field', type: 'Text', required: false }])}><Plus size={13} />Add Screen Field</button>
        {flowComponents.length > 0 && <button className="text-action" onClick={() => {
          const component = flowComponents[0];
          setConfig('fields', [...screenFields, {
            label: component?.label ?? 'Custom Component',
            apiName: `Custom_Component_${screenFields.length + 1}`,
            type: 'Custom Component',
            componentApiName: component?.apiName ?? '',
            width: component?.resize?.defaultWidth ?? 320,
            height: component?.resize?.defaultHeight ?? 180,
            columnSpan: 1,
            componentPropsJson: '{}',
            required: false
          }]);
        }}><Plus size={13} />Add Custom Component</button>}
        <h3>Screen Navigation</h3>
        <p className="settings-panel-copy">Configure the buttons shown when this screen is submitted. Add a connector for each button to route the flow.</p>
        {outcomes.map((outcome, index) => <div className="flow-config-row" key={`${outcome.name}-${index}`}>
          <input className="form-control" aria-label={`Screen outcome ${index + 1} label`} value={outcome.label} disabled={outcome.name === 'Default'} onChange={(event) => {
            const label = event.target.value;
            const name = label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || `Outcome_${index + 1}`;
            updateOutcomes(outcomes.map((item, itemIndex) => itemIndex === index ? { ...item, label, name } : item), { from: [outcome.label, outcome.name], to: label });
          }} />
          {outcome.name === 'Default'
            ? <span className="flow-outcome-default">Default</span>
            : <button className="row-menu" aria-label={`Remove ${outcome.label} outcome`} onClick={() => updateOutcomes(outcomes.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>}
        </div>)}
        <button className="text-action" onClick={() => updateOutcomes([...outcomes.filter((item) => item.name !== 'Default'), { name: `Outcome_${outcomes.length + 1}`, label: `Outcome ${outcomes.length + 1}` }, ...outcomes.filter((item) => item.name === 'Default')])}><Plus size={13} />Add Outcome</button>
      </div>;
    }
    if (selected.type === 'Action') return <>
      <label className="form-label">Action Type<select className="form-control" value={displayValue(selected.config.actionType)} onChange={(event) => setConfig('actionType', event.target.value)}><option value="">Select action</option><option>Send Email</option><option>Email Alert</option><option>Post to Chatter</option><option>Custom Notification</option><option>Outbound Message</option><option>Submit for Approval</option></select></label>
      {displayValue(selected.config.actionType) === 'Post to Chatter' ? <>
        <label className="form-label">Target Object<select className="form-control" value={displayValue(selected.config.objectApiName)} onChange={(event) => setConfig('objectApiName', event.target.value)}><option value="">Select an object</option>{objects.filter((object) => object.apiName !== 'User').map((object) => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}</select></label>
        <label className="form-label">Target Record ID<input className="form-control" value={displayValue(selected.config.recordId)} onChange={(event) => setConfig('recordId', event.target.value)} placeholder="{!$Record.Id}" /></label>
        <label className="form-label">Message<textarea className="form-control" rows={5} value={displayValue(selected.config.message)} onChange={(event) => setConfig('message', event.target.value)} placeholder="Hello {!$User.Name}" /></label>
        <div className="info-callout">Post to Chatter adds a message to a record feed when the running user has edit access and Chatter is enabled for the target object.</div>
      </> : displayValue(selected.config.actionType) === 'Custom Notification' ? <>
        <label className="form-label">Recipient User IDs (comma or newline separated)<textarea className="form-control" rows={3} value={displayValue(selected.config.recipientIds)} onChange={(event) => setConfig('recipientIds', event.target.value)} placeholder="{!$User.Id}" /></label>
        <label className="form-label">Title<input className="form-control" maxLength={120} value={displayValue(selected.config.title)} onChange={(event) => setConfig('title', event.target.value)} placeholder="Flow notification" /></label>
        <label className="form-label">Message<textarea className="form-control" rows={4} maxLength={2000} value={displayValue(selected.config.messageBody)} onChange={(event) => setConfig('messageBody', event.target.value)} placeholder="Hello {!$User.Name}" /></label>
        <div className="info-callout">Delivers a persistent notification to each active user in this tenant. The running user needs the Send Custom Notifications permission; recipients can view and mark their own notifications as read.</div>
      </> : displayValue(selected.config.actionType) === 'Outbound Message' ? <>
        <label className="form-label">HTTPS Named Credential<select className="form-control" value={displayValue(selected.config.namedCredentialId)} onChange={(event) => setConfig('namedCredentialId', event.target.value)}><option value="">Select an HTTPS credential</option>{namedCredentials.filter((credential) => credential.protocol === 'HTTPS').map((credential) => <option key={credential.id} value={credential.id}>{credential.label} · {credential.baseUrl}</option>)}</select></label>
        <label className="form-label">Relative Endpoint Path<input className="form-control" value={displayValue(selected.config.path)} onChange={(event) => setConfig('path', event.target.value)} placeholder="v1/messages" /></label>
        <label className="form-label">JSON Message Body<textarea className="form-control" rows={5} value={displayValue(selected.config.messageBody)} onChange={(event) => setConfig('messageBody', event.target.value)} placeholder={'{"recordId":"{!$Record.Id}","name":"{!$Record.Name}"}'} /></label>
        <div className="info-callout">Sends a POST request through the selected tenant HTTPS Named Credential. The running user needs the Execute HTTP Callouts permission; the endpoint must return a 2xx status.</div>
      </> : displayValue(selected.config.actionType) === 'Submit for Approval' ? <>
        <label className="form-label">Approval Process<select className="form-control" value={displayValue(selected.config.approvalProcessApiName)} onChange={(event) => {
          const process = approvalProcesses.find((item) => item.apiName === event.target.value);
          setConfig('approvalProcessApiName', event.target.value);
          if (process) setConfig('objectApiName', process.objectApiName);
        }}><option value="">Select an approval process</option>{approvalProcesses.filter((process) => process.active).map((process) => <option key={process.apiName} value={process.apiName}>{process.label} · {process.objectApiName}</option>)}</select></label>
        <label className="form-label">Target Object<select className="form-control" value={displayValue(selected.config.objectApiName)} onChange={(event) => setConfig('objectApiName', event.target.value)}><option value="">Select an object</option>{objects.filter((object) => object.apiName !== 'User').map((object) => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}</select></label>
        <label className="form-label">Target Record ID<input className="form-control" value={displayValue(selected.config.recordId)} onChange={(event) => setConfig('recordId', event.target.value)} placeholder="{!$Record.Id}" /></label>
        {!displayValue(selected.config.approvalProcessApiName) && <label className="form-label">Approvers<select className="form-control" multiple size={Math.min(6, Math.max(3, users.length))} value={displayValue(selected.config.approverIds).split(/[;,\r\n]+/).map((id) => id.trim()).filter(Boolean)} onChange={(event) => setConfig('approverIds', Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(', '))}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.username}</option>)}</select></label>}
        <label className="form-label">Submission Comments<textarea className="form-control" rows={3} maxLength={2000} value={displayValue(selected.config.comments)} onChange={(event) => setConfig('comments', event.target.value)} /></label>
        <div className="info-callout">{displayValue(selected.config.approvalProcessApiName) ? 'Submits through the selected reusable approval process.' : 'Select an approval process or use the direct approver list.'} The running user needs edit access to the record; each approver must be able to read it. Approvers act from the notification center.</div>
      </> : displayValue(selected.config.actionType) === 'Email Alert' ? <>
        <label className="form-label">Email Alert<select className="form-control" value={displayValue(selected.config.emailAlertId)} onChange={(event) => setConfig('emailAlertId', event.target.value)}><option value="">Select a saved Email Alert</option>{emailAlerts.filter((alert) => flow.flowType === 'Record-Triggered Flow' && alert.objectApiName === flow.triggerObject).map((alert) => <option key={alert.id} value={alert.id}>{alert.label} · {alert.objectApiName}</option>)}</select></label>
        {emailAlerts.find((alert) => alert.id === displayValue(selected.config.emailAlertId)) && <p className="settings-panel-copy">The selected Email Alert sends its configured recipients and template for the triggering record.</p>}
        {flow.flowType !== 'Record-Triggered Flow' && <div className="info-callout">Email Alerts are available only in record-triggered flows.</div>}
        {flow.flowType === 'Record-Triggered Flow' && !emailAlerts.some((alert) => alert.objectApiName === flow.triggerObject) && <div className="info-callout">Create an Email Alert for {flow.triggerObject || 'the flow object'} in Manager before adding this action.</div>}
      </> : <>
        <label className="form-label">SMTP Named Credential<select className="form-control" value={displayValue(selected.config.namedCredentialId)} onChange={(event) => setConfig('namedCredentialId', event.target.value)}><option value="">Select an SMTP credential</option>{namedCredentials.filter((credential) => credential.protocol === 'SMTP').map((credential) => <option key={credential.id} value={credential.id}>{credential.label}</option>)}</select></label>
        <label className="form-label">From Email<input className="form-control" type="email" value={displayValue(selected.config.fromEmail)} onChange={(event) => setConfig('fromEmail', event.target.value)} /></label>
        <label className="form-label">Recipients (comma separated)<input className="form-control" value={displayValue(selected.config.recipients)} onChange={(event) => setConfig('recipients', event.target.value)} placeholder="person@example.com, {!$Record.Email}" /></label>
        <label className="form-label">Subject<input className="form-control" value={displayValue(selected.config.subject)} onChange={(event) => setConfig('subject', event.target.value)} /></label>
        <label className="form-label">Message Body<textarea className="form-control" rows={5} value={displayValue(selected.config.body)} onChange={(event) => setConfig('body', event.target.value)} placeholder="Hello {!$Record.Name}" /></label>
        <div className="info-callout">Send Email delivers through the selected tenant SMTP credential. Configure an SMTP Named Credential in Manager first.</div>
      </>}
    </>;
    if (selected.type === 'HTTP Callout') {
      const selectedConnection = integrationConnections.find((item) => item.id === displayValue(selected.config.integrationConnectionId));
      const selectedProvider = connectorProviders.find((item) => item.connectorKey === selectedConnection?.connectorKey);
      return <>
        <label className="form-label">Named Credential<select className="form-control" value={displayValue(selected.config.namedCredentialId)} onChange={(event) => {
          setConfig('namedCredentialId', event.target.value);
          if (event.target.value) {
            setConfig('namedCredentialResource', '');
            setConfig('integrationConnectionId', '');
            setConfig('integrationConnectionResource', '');
          }
        }}><option value="">Select a credential</option>{namedCredentials.filter((credential) => credential.protocol === 'HTTPS').map((credential) => <option key={credential.id} value={credential.id}>{credential.label} · {credential.baseUrl}</option>)}</select></label>
        <label className="form-label">Provider / Integration Connection<select className="form-control" value={displayValue(selected.config.integrationConnectionId)} onChange={(event) => {
          setConfig('integrationConnectionId', event.target.value);
          if (event.target.value) {
            setConfig('integrationConnectionResource', '');
            setConfig('namedCredentialId', '');
            setConfig('namedCredentialResource', '');
            setConfig('operation', '');
            setConfig('method', 'GET');
            setConfig('path', '');
          }
        }}><option value="">Use a Named Credential instead</option>{integrationConnections.filter((connection) => connection.status === 'ACTIVE').map((connection) => {
          const provider = connectorProviders.find((item) => item.connectorKey === connection.connectorKey);
          return <option key={connection.id} value={connection.id}>{connection.name} · {provider?.name ?? connection.connectorKey}</option>;
        })}</select></label>
        {selectedProvider && <label className="form-label">Operation<select className="form-control" value={displayValue(selected.config.operation)} onChange={(event) => {
          const operationName = event.target.value;
          setConfig('operation', operationName);
          const operation = selectedProvider.operations[operationName];
          if (operation) {
            setConfig('method', operation.method);
            setConfig('path', operation.path);
          }
        }}><option value="">Choose an operation (or configure a path below)</option>{Object.entries(selectedProvider.operations).map(([name, operation]) => <option key={name} value={name}>{name} · {operation.method} {operation.path}</option>)}</select></label>}
        <label className="form-label">Method<select className="form-control" value={displayValue(selected.config.method) || 'GET'} onChange={(event) => setConfig('method', event.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <option key={method}>{method}</option>)}</select></label>
        <label className="form-label">Relative Path<input className="form-control" value={displayValue(selected.config.path)} onChange={(event) => setConfig('path', event.target.value)} placeholder="v1/resources/{!$Record.Id}" /></label>
        <label className="form-label">Headers<textarea className="form-control" rows={3} value={displayValue(selected.config.headers)} onChange={(event) => setConfig('headers', event.target.value)} placeholder="Header-Name: value" /></label>
        <HttpCalloutFieldEditor label="Query Parameters" mode="query" value={displayValue(selected.config.queryParameters)} onChange={(value) => setConfig('queryParameters', value)} resources={flow.resources} fields={selectedObject?.fields ?? []} />
        <HttpCalloutFieldEditor label="Request Body" mode="body" value={displayValue(selected.config.body)} onChange={(value) => setConfig('body', value)} resources={flow.resources} fields={selectedObject?.fields ?? []} />
        <label className="form-label">Timeout (milliseconds)<input className="form-control" type="number" min={1000} max={120000} value={displayValue(selected.config.timeoutMs)} onChange={(event) => setConfig('timeoutMs', event.target.value)} placeholder={selectedProvider ? String(selectedProvider.timeoutMs) : '15000'} /></label>
        <HttpCalloutFieldEditor label="Response Mapping" mode="response" value={displayValue(selected.config.responseMapping)} onChange={(value) => setConfig('responseMapping', value)} resources={flow.resources} fields={selectedObject?.fields ?? []} />
        <label className="form-label">Response Variable<select className="form-control" value={displayValue(selected.config.responseVariable)} onChange={(event) => setConfig('responseVariable', event.target.value)}><option value="">Do not store response</option>{flow.resources.filter((resource) => resource.type !== 'Constant').map((resource) => <option key={resource.name} value={resource.name}>{resource.label} · {resource.name}</option>)}</select></label>
        <label className="form-label">Status Code Variable<select className="form-control" value={displayValue(selected.config.statusVariable)} onChange={(event) => setConfig('statusVariable', event.target.value)}><option value="">Do not store status</option>{flow.resources.filter((resource) => resource.type !== 'Constant').map((resource) => <option key={resource.name} value={resource.name}>{resource.label} · {resource.name}</option>)}</select></label>
        <label className="form-label">On Error<select className="form-control" value={displayValue(selected.config.onError) || 'FAULT_PATH'} onChange={(event) => setConfig('onError', event.target.value)}><option value="FAULT_PATH">FAULT_PATH</option><option value="FAIL">FAIL</option><option value="CONTINUE">CONTINUE</option></select></label>
        <div className="info-callout">Select a tenant Named Credential or Integration Connection above. The Flow stores only the metadata reference; secrets, tokens, and authentication values remain protected in credential metadata and are never exposed as Flow variables.</div>
        <details className="flow-advanced-settings">
          <summary>Advanced credential binding</summary>
          <p className="settings-panel-copy">Optional: resolve the credential or integration connection ID from a Flow resource. Normal Flows should select the credential directly above and do not need a Get Credentials step.</p>
          <label className="form-label">Named Credential Resource<input className="form-control" value={displayValue(selected.config.namedCredentialResource)} onChange={(event) => {
            setConfig('namedCredentialResource', event.target.value);
            if (event.target.value) {
              setConfig('namedCredentialId', '');
              setConfig('integrationConnectionId', '');
              setConfig('integrationConnectionResource', '');
            }
          }} placeholder="{!CredentialSettings.NamedCredentialId__c}" /></label>
          <label className="form-label">Integration Connection Resource<input className="form-control" value={displayValue(selected.config.integrationConnectionResource)} onChange={(event) => {
            setConfig('integrationConnectionResource', event.target.value);
            if (event.target.value) {
              setConfig('integrationConnectionId', '');
              setConfig('namedCredentialId', '');
              setConfig('namedCredentialResource', '');
              setConfig('operation', '');
            }
          }} placeholder="{!CredentialSettings.IntegrationConnectionId__c}" /></label>
        </details>
      </>;
    }
    if (selected.type === 'Subflow') return <>
      <label className="form-label">Flow<select className="form-control" value={displayValue(selected.config.flowApiName)} onChange={(event) => setConfig('flowApiName', event.target.value)}><option value="">Select an active autolaunched flow</option>{flows.filter((candidate) => candidate.apiName !== flow.apiName && candidate.flowType === 'Autolaunched Flow' && candidate.status === 'Active').map((candidate) => <option key={candidate.apiName} value={candidate.apiName}>{candidate.label}</option>)}</select></label>
      <label className="form-label">Input Values<textarea className="form-control" rows={3} value={displayValue(selected.config.inputValues)} onChange={(event) => setConfig('inputValues', event.target.value)} placeholder="ChildInput={!ParentResource}" /></label>
      <label className="form-label">Output Values<textarea className="form-control" rows={3} value={displayValue(selected.config.outputValues)} onChange={(event) => setConfig('outputValues', event.target.value)} placeholder="ChildOutput=ParentResource" /></label>
      <p className="settings-panel-copy">Map one resource per line as child resource = parent resource/value. Inputs must be enabled on the selected flow; outputs must be enabled and match the parent resource type.</p>
    </>;
    return <label className="form-label">Configuration<textarea className="form-control" rows={4} value={JSON.stringify(selected.config, null, 2)} readOnly /></label>;
  };

  if (landing) return <div className="flow-start-page">
    <div className="flow-start-heading">
      <div className="eyebrow">AUTOMATION</div>
      <h1>Start a Flow</h1>
      <p>Choose a flow type to create, or open an existing flow.</p>
    </div>
    <section className="flow-start-create surface" aria-labelledby="flow-start-types">
      <h2 id="flow-start-types">Choose a flow type</h2>
      <div className="flow-start-types">
        {flowTypeOptions.map((option) => <button type="button" key={option.type}
          className={newFlowType === option.type ? 'flow-start-type selected' : 'flow-start-type'}
          aria-pressed={newFlowType === option.type}
          onClick={() => setNewFlowType(option.type)}>
          <strong>{option.type}</strong>
          <span>{option.description}</span>
        </button>)}
      </div>
      <label className="form-label" htmlFor="flow-start-label">Flow Label</label>
      <input id="flow-start-label" className="form-control" value={newFlowLabel}
        onChange={(event) => setNewFlowLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && newFlowLabel.trim()) {
            onCreateFlow(newFlowLabel, newFlowType);
            setNewFlowLabel('');
          }
        }}
        placeholder="For example, Start Kiosk Order" />
      <button className="btn btn-brand" type="button" disabled={!newFlowLabel.trim()}
        onClick={() => {
          onCreateFlow(newFlowLabel, newFlowType);
          setNewFlowLabel('');
        }}><Plus size={14} />Create Flow</button>
    </section>
    <section className="flow-start-existing surface" aria-labelledby="flow-start-existing-title">
      <h2 id="flow-start-existing-title">Open an existing flow</h2>
      {flows.length
        ? <div className="flow-start-list">{flows.map((candidate) => <button type="button" className="flow-start-existing-item"
          key={candidate.apiName} onClick={() => onSelectFlow(candidate.apiName)}>
          <span><strong>{candidate.label}</strong><small>{candidate.flowType} · {candidate.status} · v{candidate.versionNumber}</small></span>
          <MoveRight size={16} />
        </button>)}</div>
        : <p className="settings-panel-copy">No flows yet. Choose a flow type above to create one.</p>}
    </section>
  </div>;

  return <div className="flow-builder">
    <div className="flow-topbar">
      <button className="icon-button subtle" aria-label="Back to setup" onClick={onExit}><ArrowLeft size={17} /></button>
      <div className="flow-name"><input aria-label="Flow label" value={flow.label} onChange={(event) => onFlowChange({ ...flow, label: event.target.value })} /><span className="flow-type-pill">{flow.status} · v{flow.versionNumber}</span><span className={`flow-save-state ${isDirty ? 'dirty' : ''}`} role="status">{isDirty ? 'Unsaved changes' : 'Saved'}</span><ChevronDown size={13} /></div>
      <div className="flow-toolbar-actions">
        <button className="icon-button subtle" title="Undo" aria-label="Undo" onClick={onUndo} disabled={!canUndo}><Undo2 size={15} /></button>
        <button className="icon-button subtle" title="Redo" aria-label="Redo" onClick={onRedo} disabled={!canRedo}><Redo2 size={15} /></button>
        <button className="btn" onClick={onValidate}><Check size={14} />Check</button>
        <button className="btn" onClick={onSave}><Save size={14} />Save</button>
        {(flow.flowType === 'Autolaunched Flow' || flow.flowType === 'Screen Flow') && <button className="btn" onClick={onDebug} disabled={!canRunFlows} title={!canRunFlows ? 'The Run Flows permission is required.' : 'Debug the most recently saved version with sample inputs.'}>Debug</button>}
        {(flow.flowType === 'Autolaunched Flow' || flow.flowType === 'Screen Flow') && <button className="btn" onClick={onRun} disabled={!canRunFlows} title={!canRunFlows ? 'The Run Flows permission is required.' : isDirty ? 'Runs the most recently saved version; unsaved changes are excluded.' : undefined}>Run</button>}
        <button className="btn btn-brand" onClick={onActivate}><Check size={14} />Activate</button>
        <button className="icon-button subtle" title="Flow Builder help" onClick={() => onNotify('Configure the Start node, build element paths, check, then save or activate.')}><CircleHelp size={16} /></button>
      </div>
    </div>
    <div className="flow-workarea">
      <aside className="flow-toolbox">
        <div className="toolbox-heading"><h2>Toolbox</h2><button className="icon-button subtle" aria-label="Toolbox options" onClick={() => onNotify('Flow Builder toolbox')}><MoreHorizontal size={16} /></button></div>
        <div className="toolbox-tabs"><button className={toolTab === 'Elements' ? 'active' : ''} onClick={() => onToolTab('Elements')}>Elements</button><button className={toolTab === 'Manager' ? 'active' : ''} onClick={() => onToolTab('Manager')}>Manager</button></div>
        {toolTab === 'Elements' ? <>
          <div className="component-search"><Search size={14} /><input placeholder="Search elements..." aria-label="Search flow elements" value={elementSearch} onChange={(event) => setElementSearch(event.target.value)} /></div>
          {toolboxGroups.map((group) => {
            const elements = flowElementMetadata.filter((item) => item.group === group && item.type.toLowerCase().includes(elementSearch.trim().toLowerCase()) && isElementAvailable(item.type));
            return elements.length ? <div className="toolbox-group" key={group}><h3>{group}</h3>{elements.map((element) => <button key={element.type} className="flow-element-option" onClick={() => onAdd(element.type)}><span>{element.icon}</span>{element.type}<Plus size={13} /></button>)}</div> : null;
          })}
          {flowElementMetadata.filter((item) => item.type.toLowerCase().includes(elementSearch.trim().toLowerCase()) && isElementAvailable(item.type)).length === 0 && <p className="empty-list">No elements found.</p>}
        </> : <div className="resource-list">
          <div className="toolbox-group"><h3>Flows</h3>{flows.map((candidate) => <div className="flow-manager-row" key={candidate.apiName}><button className={`flow-manager-item ${flow.apiName === candidate.apiName ? 'active' : ''}`} onClick={() => onSelectFlow(candidate.apiName)}><span>{candidate.flowType}</span><strong>{candidate.label}</strong><small>{candidate.status} · v{candidate.versionNumber}</small></button><div className="flow-manager-actions"><button className="btn btn-small" aria-label={`Clone ${candidate.label}`} title="Clone flow" onClick={() => onCloneFlow(candidate)}><Copy size={13} />Clone</button>{candidate.status === 'Active' && <button className="btn btn-small" aria-label={`Deactivate ${candidate.label}`} onClick={() => onDeactivateFlow(candidate.apiName)}>Deactivate</button>}<button className="btn btn-small" aria-label={`Delete ${candidate.label}`} onClick={() => onDeleteFlow(candidate.apiName)}>Delete</button></div></div>)}</div>
          <div className="toolbox-group"><h3>Version History</h3>{flow.versions.length
            ? [...flow.versions].sort((left, right) => right.versionNumber - left.versionNumber).map((version, index) =>
              <div className="flow-resource-card" key={`${version.versionNumber}-${index}`}>
                <strong>Version {version.versionNumber} · {version.status}</strong>
                <small>{version.label ?? flow.label} · {version.flowType ?? flow.flowType} · {new Date(version.savedAt).toLocaleString()}</small>
                {version.description && <small>{version.description}</small>}
                <button className="text-action" aria-label={`Restore version ${version.versionNumber} as draft`}
                  onClick={() => onRestoreFlowVersion(version)}>Restore as Draft</button>
              </div>)
            : <p className="empty-list">No saved versions yet.</p>}</div>
          <div className="toolbox-group"><h3>Flow Portability</h3><button className="btn" onClick={onExportFlow}>Export Flow JSON</button><label className="form-label">Import Flow JSON<input className="form-control" type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportFlow(file);
            event.target.value = '';
          }} /></label><p className="settings-panel-copy">Import creates a separate Draft and will not overwrite an existing Flow.</p></div>
          <div className="toolbox-group"><h3>Flow Description</h3><label className="form-label">Description<textarea className="form-control" rows={3} value={flow.description ?? ''} onChange={(event) => onFlowChange({ ...flow, description: event.target.value })} /></label></div>
          <div className="toolbox-group"><h3>New Flow</h3><label className="form-label">Flow Label<input className="form-control" value={newFlowLabel} onChange={(event) => setNewFlowLabel(event.target.value)} /></label><label className="form-label">Flow Type<select className="form-control" value={newFlowType} onChange={(event) => setNewFlowType(event.target.value as FlowDefinitionMetadata['flowType'])}>{flowTypeOptions.map((option) => <option key={option.type}>{option.type}</option>)}</select></label><button className="btn btn-brand" disabled={!newFlowLabel.trim()} onClick={() => { onCreateFlow(newFlowLabel, newFlowType); setNewFlowLabel(''); }}><Plus size={13} />Create Flow</button></div>
          <div className="toolbox-group"><h3>Platform Events</h3>
            <button className="btn" onClick={() => {
              setPlatformEventApiName('');
              setPlatformEventLabel('');
              setPlatformEventDescription('');
              setPlatformEventFields([]);
            }}><Plus size={13} />New Event</button>
            {platformEvents.map((event) => <div className="flow-resource-card" key={event.apiName}>
              <button className="flow-manager-item" onClick={() => {
                setPlatformEventApiName(event.apiName);
                setPlatformEventLabel(event.label);
                setPlatformEventDescription(event.description);
                setPlatformEventFields(event.fields);
              }}><strong>{event.label}</strong><small>{event.apiName} · {event.fields.length} fields</small></button>
              <button className="btn btn-small" onClick={() => void onDeletePlatformEvent(event.apiName).catch((error: unknown) => onNotify(error instanceof Error ? error.message : String(error)))}>Delete</button>
            </div>)}
            <label className="form-label">Event Label<input className="form-control" value={platformEventLabel} onChange={(event) => {
              const label = event.target.value;
              setPlatformEventLabel(label);
              if (!platformEventApiName || !platformEvents.some((item) => item.apiName === platformEventApiName)) {
                setPlatformEventApiName(`${label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}__e`);
              }
            }} /></label>
            <label className="form-label">API Name<input className="form-control" value={platformEventApiName} onChange={(event) => setPlatformEventApiName(event.target.value)} placeholder="Order_Updated__e" /></label>
            <label className="form-label">Description<textarea className="form-control" rows={2} value={platformEventDescription} onChange={(event) => setPlatformEventDescription(event.target.value)} /></label>
            {platformEventFields.map((field, index) => <div className="flow-resource-card" key={`new-platform-field-${index}`}>
              <label className="form-label">Field Label<input className="form-control" value={field.label} onChange={(event) => setPlatformEventFields((current) => current.map((item, itemIndex) => itemIndex === index ? {
                ...item,
                label: event.target.value,
                apiName: `${event.target.value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}__c`
              } : item))} /></label>
              <label className="form-label">API Name<input className="form-control" value={field.apiName} onChange={(event) => setPlatformEventFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, apiName: event.target.value } : item))} /></label>
              <label className="form-label">Data Type<select className="form-control" value={field.dataType} onChange={(event) => setPlatformEventFields((current) => current.map((item, itemIndex) => itemIndex === index ? {
                ...item,
                dataType: event.target.value,
                ...(event.target.value === 'Picklist' ? { picklistRestricted: true, picklistValues: item.picklistValues ?? [] } : {})
              } : item))}>{['Text(255)', 'Long Text Area', 'Number', 'Currency', 'Percent', 'Checkbox', 'Date', 'DateTime', 'Picklist'].map((type) => <option key={type}>{type}</option>)}</select></label>
              {field.dataType === 'Picklist' && <label className="form-label">Picklist Values (one per line)<textarea className="form-control" rows={3} value={field.picklistValues?.join('\n') ?? ''} onChange={(event) => setPlatformEventFields((current) => current.map((item, itemIndex) => itemIndex === index ? {
                ...item,
                picklistRestricted: true,
                picklistValues: event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
              } : item))} /></label>}
              <button className="btn btn-small" onClick={() => setPlatformEventFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove Field</button>
            </div>)}
            <button className="text-action" onClick={addPlatformEventField}><Plus size={13} />Add Field</button>
            <button className="btn btn-brand" disabled={!platformEventLabel.trim() || !platformEventFields.length || platformEventFields.some((field) => !field.apiName.trim() || !field.label.trim())} onClick={() => void savePlatformEvent().catch((error: unknown) => onNotify(error instanceof Error ? error.message : String(error)))}><Save size={13} />Save Platform Event</button>
          </div>
          <div className="toolbox-group"><h3>Resources</h3><label className="form-label">Resource Label<input className="form-control" value={resourceLabel} onChange={(event) => setResourceLabel(event.target.value)} /></label><label className="form-label">Resource Type<select className="form-control" value={resourceType} onChange={(event) => {
            const type = event.target.value as FlowResourceMetadata['type'];
            setResourceType(type);
            if (type === 'Record' || type === 'Record Collection') setResourceDataType(objects[0]?.apiName ?? '');
            else if (type === 'Variable' || type === 'Formula' || type === 'Constant' || type === 'Choice') setResourceDataType('Text');
          }}>{['Variable', 'Record', 'Record Collection', 'Formula', 'Constant', 'Choice', 'Text Template'].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="form-label">Data Type{resourceType === 'Record' || resourceType === 'Record Collection'
              ? <select className="form-control" value={resourceDataType} onChange={(event) => setResourceDataType(event.target.value)}>{objects.filter((object) => object.apiName !== 'User').map((object) => <option key={object.apiName} value={object.apiName}>{object.label}</option>)}</select>
              : ['Variable', 'Formula', 'Constant', 'Choice'].includes(resourceType)
                ? <select className="form-control" value={resourceDataType} onChange={(event) => setResourceDataType(event.target.value)}>
                    {['Text', 'Number', 'Currency', 'Percent', 'Boolean', 'Date', 'Date/Time', 'Time', 'Id', 'Picklist', 'Multi-Select Picklist'].map((type) => <option key={type}>{type}</option>)}
                  </select>
                : <input className="form-control" value={resourceDataType} onChange={(event) => setResourceDataType(event.target.value)} />}</label>
            {resourceType === 'Formula' && <div className="flow-config-list">
              <div className="flow-config-row">
                <select className="form-control" aria-label="Formula field or resource" value={formulaInsertField} onChange={(event) => setFormulaInsertField(event.target.value)}>
                  <option value="">Select field or resource</option>
                  {selectedObject && <optgroup label="Trigger Fields">{selectedObject.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</optgroup>}
                  {selectedPlatformEvent && <optgroup label="Event Fields">{selectedPlatformEvent.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}</optgroup>}
                  <optgroup label="Flow Resources">{flow.resources.map((resource) => <option key={resource.name} value={resource.name}>{resource.label}</option>)}</optgroup>
                </select>
                <button className="btn btn-small" disabled={!formulaInsertField} onClick={() => insertFormulaToken(formulaInsertField)}>Insert Field</button>
              </div>
              <div className="flow-config-row">
                <select className="form-control" aria-label="Formula operator" value={formulaOperator} onChange={(event) => setFormulaOperator(event.target.value)}>{formulaOperators.map((operator) => <option key={operator}>{operator}</option>)}</select>
                <button className="btn btn-small" onClick={() => insertFormulaToken(` ${formulaOperator} `)}>Insert Operator</button>
              </div>
              <div className="flow-config-row">
                <select className="form-control" aria-label="Formula function" value={formulaFunction} onChange={(event) => setFormulaFunction(event.target.value)}>{formulaFunctions.map((name) => <option key={name}>{name}</option>)}</select>
                <button className="btn btn-small" onClick={() => insertFormulaToken(`${formulaFunction}()`, formulaFunction.length + 1)}>Insert Function</button>
              </div>
              <p className="settings-panel-copy">Insert controls add text at the cursor. Use Check to validate the expression and the rest of the Flow.</p>
            </div>}
            <label className="form-label">{resourceType === 'Formula' ? 'Formula Expression' : resourceType === 'Text Template' ? 'Template' : 'Default Value'}{resourceType === 'Formula' || resourceType === 'Text Template'
              ? <textarea ref={resourceType === 'Formula' ? formulaEditorRef : undefined} className="form-control" rows={5} value={resourceValue} onChange={(event) => setResourceValue(event.target.value)} />
              : <input className="form-control" value={resourceValue} onChange={(event) => setResourceValue(event.target.value)} />}</label>
            <button className="btn" disabled={!resourceLabel.trim()} onClick={addResource}><Plus size={13} />New Resource</button>
            {flow.resources.map((resource) => <div className="flow-resource-card" key={resource.name}>
              <strong>{resource.label}</strong><small>{resource.name} · {resource.type} · {resource.dataType}</small>
              <label className="form-label">{resource.type === 'Formula' ? 'Formula Expression' : resource.type === 'Text Template' ? 'Template' : 'Default Value'}{resource.type === 'Formula' || resource.type === 'Text Template'
                ? <textarea className="form-control" rows={4} value={displayValue(resource.value)} onChange={(event) => updateResource(resource.name, { value: event.target.value })} />
                : <input className="form-control" value={displayValue(resource.value)} onChange={(event) => updateResource(resource.name, { value: event.target.value })} />}</label>
              <div className="form-options"><label className="checkbox-row"><input type="checkbox" checked={resource.availableForInput} disabled={!['Variable', 'Record', 'Record Collection'].includes(resource.type)} onChange={(event) => updateResource(resource.name, { availableForInput: event.target.checked })} />Available for input</label><label className="checkbox-row"><input type="checkbox" checked={resource.availableForOutput} onChange={(event) => updateResource(resource.name, { availableForOutput: event.target.checked })} />Available for output</label></div>
              <button className="text-action" onClick={() => onFlowChange({ ...flow, resources: flow.resources.filter((item) => item.name !== resource.name) })}><X size={13} />Delete Resource</button>
            </div>)}
          </div>
          <div className="toolbox-group"><h3>Named Credentials</h3>          <p>Tenant-scoped HTTPS and SMTP credentials are encrypted at rest. Secrets are never returned to the browser.</p>
            <label className="form-label">API Name<input className="form-control" value={credentialName} onChange={(event) => setCredentialName(event.target.value.replace(/[^A-Za-z0-9_]/g, ''))} placeholder="Partner_API" /></label>
            <label className="form-label">Label<input className="form-control" value={credentialLabel} onChange={(event) => setCredentialLabel(event.target.value)} placeholder="Partner API" /></label>
            <label className="form-label">Protocol<select className="form-control" value={credentialProtocol} onChange={(event) => { const protocol = event.target.value as NamedCredentialMetadata['protocol']; setCredentialProtocol(protocol); if (protocol === 'SMTP' && credentialAuthType !== 'Basic' && credentialAuthType !== 'None') setCredentialAuthType('Basic'); }}><option>HTTPS</option><option>SMTP</option></select></label>
            <label className="form-label">{credentialProtocol === 'SMTP' ? 'SMTP Server URL' : 'Base URL'}<input className="form-control" type="url" value={credentialBaseUrl} onChange={(event) => setCredentialBaseUrl(event.target.value)} placeholder={credentialProtocol === 'SMTP' ? 'smtp://smtp.example.com:587' : 'https://api.example.com/'} /></label>
            <label className="form-label">Authentication<select className="form-control" value={credentialAuthType} onChange={(event) => setCredentialAuthType(event.target.value as NamedCredentialMetadata['authType'])}>{(credentialProtocol === 'SMTP' ? ['None', 'Basic'] : ['None', 'Bearer', 'Basic', 'API Key']).map((type) => <option key={type}>{type}</option>)}</select></label>
            {credentialAuthType === 'API Key' && <label className="form-label">API Key Header<input className="form-control" value={credentialHeaderName} onChange={(event) => setCredentialHeaderName(event.target.value)} /></label>}
            {credentialAuthType === 'Basic' && <label className="form-label">Username<input className="form-control" autoComplete="off" value={credentialUsername} onChange={(event) => setCredentialUsername(event.target.value)} placeholder={credentialId ? 'Leave blank to retain' : ''} /></label>}
            {credentialAuthType !== 'None' && <label className="form-label">{credentialAuthType === 'Basic' ? 'Password' : 'Secret'}<input className="form-control" type="password" autoComplete="new-password" value={credentialSecret} onChange={(event) => setCredentialSecret(event.target.value)} placeholder={credentialId ? 'Stored securely · blank keeps existing secret' : 'Enter secret'} /></label>}
            <button className="btn btn-brand" disabled={!credentialName.trim() || !credentialLabel.trim() || !credentialBaseUrl.trim()} onClick={() => void submitCredential()}>{credentialId ? 'Update Named Credential' : 'Save Named Credential'}</button>
            {credentialId && <button className="text-action" onClick={() => editCredential()}>Cancel edit</button>}
            {namedCredentials.map((credential) => <div className="flow-resource-card" key={credential.id}><strong>{credential.label}</strong><small>{credential.protocol} · {credential.name} · {credential.authType} · key {credential.keyId}</small><small>{credential.baseUrl} · Secret {credential.hasSecret ? 'stored (masked)' : 'not required'}</small><div className="toolbar-actions"><button className="btn" onClick={() => editCredential(credential)}>Edit</button><button className="btn" onClick={() => void onRotateNamedCredential(credential.id).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to rotate credential key'))}>Rotate Key</button><button className="btn" onClick={() => void onDeleteNamedCredential(credential.id).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to delete credential'))}>Delete</button></div></div>)}
            {!namedCredentials.length && <p className="empty-list">No Named Credentials are configured.</p>}
          </div>
          <div className="toolbox-group"><h3>Email Alerts</h3>
            <p>Reusable, tenant-scoped alerts for record-triggered flows. Recipients, subject, and body support Flow record references.</p>
            <label className="form-label">API Name<input className="form-control" value={emailAlertName} onChange={(event) => setEmailAlertName(event.target.value.replace(/[^A-Za-z0-9_]/g, ''))} placeholder="Account_Notification" /></label>
            <label className="form-label">Label<input className="form-control" value={emailAlertLabel} onChange={(event) => setEmailAlertLabel(event.target.value)} placeholder="Account Notification" /></label>
            <label className="form-label">Object<select className="form-control" value={emailAlertObject} onChange={(event) => setEmailAlertObject(event.target.value)}><option value="">Select an object</option>{objects.filter((object) => object.apiName !== 'User').map((object) => <option key={object.apiName} value={object.apiName}>{object.label} ({object.apiName})</option>)}</select></label>
            <label className="form-label">SMTP Named Credential<select className="form-control" value={emailAlertCredentialId} onChange={(event) => setEmailAlertCredentialId(event.target.value)}><option value="">Select an SMTP credential</option>{namedCredentials.filter((credential) => credential.protocol === 'SMTP').map((credential) => <option key={credential.id} value={credential.id}>{credential.label}</option>)}</select></label>
            <label className="form-label">From Email<input className="form-control" type="email" value={emailAlertFrom} onChange={(event) => setEmailAlertFrom(event.target.value)} /></label>
            <label className="form-label">Recipients (comma or semicolon separated)<input className="form-control" value={emailAlertRecipients} onChange={(event) => setEmailAlertRecipients(event.target.value)} placeholder="person@example.com, {!$Record.Email}" /></label>
            <label className="form-label">Subject<input className="form-control" value={emailAlertSubject} onChange={(event) => setEmailAlertSubject(event.target.value)} /></label>
            <label className="form-label">Plain-text Body<textarea className="form-control" rows={4} value={emailAlertBody} onChange={(event) => setEmailAlertBody(event.target.value)} placeholder="Hello {!$Record.Name}" /></label>
            <button className="btn btn-brand" disabled={!emailAlertName.trim() || !emailAlertLabel.trim() || !emailAlertObject || !emailAlertCredentialId || !emailAlertFrom.trim() || !emailAlertRecipients.trim() || !emailAlertSubject.trim() || !emailAlertBody.trim()} onClick={() => void submitEmailAlert()}>{emailAlertId ? 'Update Email Alert' : 'Save Email Alert'}</button>
            {emailAlertId && <button className="text-action" onClick={() => editEmailAlert()}>Cancel edit</button>}
            {emailAlerts.map((alert) => <div className="flow-resource-card" key={alert.id}><strong>{alert.label}</strong><small>{alert.name} · {alert.objectApiName}</small><small>{alert.recipients} · SMTP credential: {namedCredentials.find((credential) => credential.id === alert.namedCredentialId)?.label ?? 'Unavailable'}</small><div className="toolbar-actions"><button className="btn" onClick={() => editEmailAlert(alert)}>Edit</button><button className="btn" onClick={() => void onDeleteEmailAlert(alert.id).catch((error: unknown) => onNotify(error instanceof Error ? error.message : 'Unable to delete Email Alert'))}>Delete</button></div></div>)}
            {!emailAlerts.length && <p className="empty-list">No Email Alerts are configured.</p>}
          </div>
        </div>}
      </aside>
      <section className="flow-canvas-region">
        <div className="flow-canvas-top"><div><span className="flow-status-dot" />Auto-Layout · {flow.elements.length} elements · {Math.round(zoom * 100)}%</div><button className="btn btn-small" onClick={onValidate}><Activity size={13} />Errors and Warnings</button></div>
        {validation && <div className={`flow-validation ${validation.valid ? 'valid' : 'invalid'}`} role="status"><strong>{validation.valid ? 'Flow check passed' : `${validation.errors.length} error(s) found`}</strong>{validation.errors.map((error) => <div key={error}>{error}</div>)}{validation.warnings.map((warning) => <div key={warning}>Warning: {warning}</div>)}</div>}
        <div className="flow-canvas" ref={canvasRef}><div className="flow-graph" style={{ width: graphWidth, height: graphHeight, transform: `scale(${zoom})` }}>
          <svg className="flow-graph-connectors" width={graphWidth} height={graphHeight} aria-hidden="true">
            <defs><marker id="flow-graph-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8e8e8e" /></marker></defs>
            {flow.connectors.map((connector) => {
              const from = graphPositions.get(connector.from);
              const to = graphPositions.get(connector.to);
              if (!from || !to) return null;
              const startX = from.x + graphNodeWidth / 2;
              const startY = from.y + 74;
              const endX = to.x + graphNodeWidth / 2;
              const endY = to.y;
              const bend = Math.max(35, Math.abs(endY - startY) / 2);
              const labelX = (startX + endX) / 2;
              const labelY = (startY + endY) / 2 - 6;
              return <g key={connector.id} className={`flow-graph-edge ${connector.kind}`}>
                <path d={`M ${startX} ${startY} C ${startX} ${startY + bend}, ${endX} ${endY - bend}, ${endX} ${endY}`} markerEnd="url(#flow-graph-arrow)" />
                {(connector.label || connector.kind !== 'normal') && <text x={labelX} y={labelY}>{connector.label || connector.kind}</text>}
              </g>;
            })}
          </svg>
          {flow.elements.map((element) => {
            const position = graphPositions.get(element.id) ?? { x: graphPadding, y: graphPadding };
            return <button key={element.id} className={`flow-step flow-graph-node ${element.type === 'Start' ? 'start-step' : ''} ${selectedId === element.id ? 'selected' : ''}`} style={{ left: position.x, top: position.y, width: graphNodeWidth }} onClick={() => onSelect(element.id)}>
              <span className="flow-step-icon">{flowElementMetadata.find((item) => item.type === element.type)?.icon ?? '◉'}</span><span className="flow-step-content"><small>{element.type === 'Start' ? flow.flowType.toUpperCase() : element.type.toUpperCase()}</small><strong>{element.label}</strong>{element.type === 'Start' && <em>{flow.flowType === 'Platform Event-Triggered Flow' ? `Event: ${selectedPlatformEvent?.label ?? flow.triggerObject ?? 'Select event'}` : flow.triggerObject ? `Object: ${flow.triggerObject}` : 'No record object'} · {displayValue(flow.startConfig.trigger) || displayValue(flow.startConfig.frequency) || 'Manual'}</em>}</span><MoreHorizontal size={16} className="step-menu" />
            </button>;
          })}
        </div></div>
        <div className="flow-zoom"><button onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} aria-label="Zoom in"><Plus size={15} /></button><button onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} aria-label="Zoom out"><span>−</span></button><button onClick={fitGraphToCanvas} aria-label="Fit to view"><MoveRight size={14} /></button></div>
      </section>
      <aside className="flow-settings">
        <div className="settings-header"><h2>{selected?.type === 'Start' ? 'Configure Start' : 'Set Up'}</h2><button className="icon-button subtle" onClick={() => selected && selected.type !== 'Start' && onRemove(selected.id)} aria-label="Delete element" disabled={!selected || selected.type === 'Start'}><X size={16} /></button></div>
        <div className="settings-element-type"><span className="flow-step-icon">{flowElementMetadata.find((item) => item.type === selected?.type)?.icon ?? '◉'}</span><div><small>{selected?.type}</small><strong>{selected?.label}</strong></div></div>
        {selected?.type === 'Start' && <label className="form-label flow-editor-field">Flow Type<select className="form-control" value={flow.flowType} onChange={(event) => updateFlowType(event.target.value as FlowDefinitionMetadata['flowType'])}>{flowTypeOptions.map((option) => <option key={option.type}>{option.type}</option>)}</select></label>}
        <label className="form-label flow-editor-field">Label<input className="form-control" value={selected?.label ?? ''} onChange={(event) => selected && onUpdateLabel(selected.id, event.target.value)} /></label>
        <label className="form-label flow-editor-field">API Name<div className="form-display">{selected?.label.replace(/[^A-Za-z0-9]+/g, '_') ?? ''}</div></label>
        <div className="settings-divider" />
        <div className="settings-panel-copy"><h3>{selected?.type === 'Start' ? 'Configure Start' : `${selected?.type ?? 'Element'} Details`}</h3><p>{selected?.type === 'Start' ? 'Choose how this flow starts and set its trigger criteria.' : 'Configure the behavior and data for this flow element.'}</p></div>
        <div className="flow-element-config">{renderElementSettings()}</div>
        {selected && <div className="flow-branches"><h3>Connector Paths</h3>{flow.connectors.filter((connector) => connector.from === selected.id).map((connector) => <div key={connector.id}>
          <div className="flow-config-row">
            <input className="form-control" aria-label="Connector outcome label" value={connector.label} onChange={(event) => updateConnector(connector.id, { label: event.target.value })} placeholder="Outcome label" />
            <select className="form-control" aria-label="Connector target" value={connector.to} onChange={(event) => updateConnector(connector.id, { to: Number(event.target.value) })}>{flow.elements.filter((element) => element.id !== selected.id && element.type !== 'Start').map((element) => <option key={element.id} value={element.id}>{element.label}</option>)}</select>
            <select className="form-control" aria-label="Connector type" value={connector.kind} onChange={(event) => setConnectorKind(connector.id, event.target.value as FlowDefinitionMetadata['connectors'][number]['kind'])}>
              <option value="normal">Normal</option>
              <option value="fault" disabled={selected.type === 'Start'}>Fault</option>
              <option value="scheduled" disabled={selected.type !== 'Start' || flow.flowType !== 'Record-Triggered Flow'}>Scheduled Path</option>
            </select>
            <button className="row-menu" aria-label="Remove connector" onClick={() => onFlowChange({ ...flow, connectors: flow.connectors.filter((item) => item.id !== connector.id) })}><X size={14} /></button>
          </div>
          {connector.kind === 'scheduled' && <div className="flow-config-row">
            <select className="form-control" aria-label="Scheduled path time source field" value={connector.scheduledPath?.timeSourceFieldApiName ?? ''} onChange={(event) => updateConnector(connector.id, { scheduledPath: { ...connector.scheduledPath!, timeSourceFieldApiName: event.target.value } })}>
              <option value="">Select Date/DateTime field</option>
              {objects.find((object) => object.apiName === flow.triggerObject)?.fields.filter((field) => ['Date', 'DateTime'].includes(field.dataType)).map((field) => <option key={field.apiName} value={field.apiName}>{field.label}</option>)}
            </select>
            <input className="form-control" type="number" aria-label="Scheduled path offset" value={connector.scheduledPath?.offsetAmount ?? 0} onChange={(event) => updateConnector(connector.id, { scheduledPath: { ...connector.scheduledPath!, offsetAmount: Number(event.target.value) } })} />
            <select className="form-control" aria-label="Scheduled path offset unit" value={connector.scheduledPath?.offsetUnit ?? 'Hours'} onChange={(event) => updateConnector(connector.id, { scheduledPath: { ...connector.scheduledPath!, offsetUnit: event.target.value as 'Minutes' | 'Hours' | 'Days' } })}>
              <option>Minutes</option><option>Hours</option><option>Days</option>
            </select>
          </div>}
        </div>)}<button className="text-action" onClick={addConnector}><Plus size={13} />Add Connector</button></div>}
        <button className="btn btn-brand btn-full" onClick={onSave}>Save Flow</button>
      </aside>
    </div>
    <div className="flow-bottom-bar"><span>Flow Builder</span><span>{flow.status} · Version {flow.versionNumber}</span><button className="text-action" onClick={() => onNotify('Select a node to configure it. Use Ctrl+Z / Ctrl+Shift+Z for history.')}><CircleHelp size={12} />Keyboard shortcuts</button></div>
  </div>;
}
