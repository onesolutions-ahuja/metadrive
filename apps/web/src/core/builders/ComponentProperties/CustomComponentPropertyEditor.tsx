import BooleanPropertyEditor from './property-editors/BooleanPropertyEditor';
import NumberPropertyEditor from './property-editors/NumberPropertyEditor';
import PicklistPropertyEditor from './property-editors/PicklistPropertyEditor';
import ObjectFieldMapPropertyEditor from './property-editors/ObjectFieldMapPropertyEditor';
import ExpressionPropertyEditor from './property-editors/ExpressionPropertyEditor';
import StringPropertyEditor from './property-editors/StringPropertyEditor';
import EventPropertyEditor from './property-editors/EventPropertyEditor';
import ResponsivePropertyEditor from './property-editors/ResponsivePropertyEditor';
import {metadataReference,metadataSelection,metadataFieldObject} from '../../metadata/Definitions/metadataReferences';
import { useState } from 'react';
import TenantMediaPicker from './TenantMediaPicker';
import type { ObjectMetadata,FlowDefinitionMetadata } from '../../metadata/Definitions/metadata';
import { sortComponentSettings, validateComponentSetting, type ComponentSettingDefinition } from '../../components/Properties/componentSettingDefinitions';
import {
  addComponentProperty,
  displayComponentPropertyName,
  validateComponentPropertyName,
  type ComponentPropertyKind,
  type ComponentPropertyValues
} from '../../components/Properties/componentProperties';

export default function CustomComponentPropertyEditor({
  properties,
  onChange,
  disabled = false,
  addOnly = false,
  definitions,
  objects = [], flows = [], primaryObjectApiName = '', appObjectApiNames = []
}: {
  properties: ComponentPropertyValues;
  onChange: (next: ComponentPropertyValues) => void;
  disabled?: boolean;
  addOnly?: boolean;
  definitions?: readonly ComponentSettingDefinition[];
  objects?: readonly ObjectMetadata[];
  flows?: readonly FlowDefinitionMetadata[];
  primaryObjectApiName?: string;
  appObjectApiNames?: readonly string[];
}) {
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState<ComponentPropertyKind>('text');
  const [error, setError] = useState('');
  const update = (name: string, value: unknown) => onChange({ ...properties, [name]: value });
  const remove = (name: string) => {
    const next = { ...properties };
    delete next[name];
    onChange(next);
  };
  const add = () => {
    const name = propertyName.trim();
    const validation = validateComponentPropertyName(name, properties);
    if (validation) { setError(validation); return; }
    onChange(addComponentProperty(properties, name, propertyType));
    setPropertyName('');
    setError('');
  };

  const typedDefinitions = definitions ? sortComponentSettings(definitions) : [];
  const definitionByName = new Map(typedDefinitions.map(definition => [definition.propertyKey, definition]));
  const visibleProperties = definitions ? [
    ...typedDefinitions.map(definition => [definition.propertyKey, properties[definition.propertyKey] ?? definition.defaultValue ?? ''] as const),
    ...Object.entries(properties).filter(([name]) => !definitionByName.has(name))
  ] : Object.entries(properties);
  return <div className="metadata-component-properties" aria-label="Custom component properties">
    {(!addOnly || typedDefinitions.length > 0) && <details className="component-optional-settings" open={!addOnly}>
      <summary className="properties-section-title">{addOnly ? 'Add optional appearance, card, image and responsive settings' : 'Component settings'}</summary>
      {!Object.keys(properties).length && <p className="properties-help">No settings yet. Add a property to configure this component.</p>}
      {(addOnly ? visibleProperties.filter(([name]) => definitionByName.has(name) && !Object.prototype.hasOwnProperty.call(properties,name)) : visibleProperties).map(([name, value]) => {
        const definition = definitionByName.get(name);
        const label = definition?.label ?? displayComponentPropertyName(name);
        const id = `component-property-${name}`;
        const boundObject=metadataFieldObject(objects,{...properties,objectApiName:properties.objectApiName||primaryObjectApiName},name);
        return <div className="metadata-array-property" key={name}>
          {definition?.kind === 'OBJECT_FIELD' ? <ObjectFieldMapPropertyEditor id={id} label={label} name={name} value={value} disabled={disabled} fields={boundObject?.fields??[]} onChange={next=>update(name,next)}/> : definition?.kind === 'FLOW' ? <label className="form-label" htmlFor={id}>{label}
            <select id={id} className="form-control" disabled={disabled} value={metadataSelection(flows,value)?.apiName??String(value??'')}
              onChange={event=>{const flow=flows.find(f=>f.apiName===event.target.value);update(name,flow?.id?metadataReference(flow.id):event.target.value);}}>
              <option value="">Select Flow…</option>{flows.map(flow=><option key={flow.apiName} value={flow.apiName}>{flow.label}</option>)}
            </select></label> : definition?.kind === 'SELECT' && definition.choices ? <PicklistPropertyEditor id={id} label={label} value={value} disabled={disabled} required={definition.required} choices={definition.choices} onChange={next=>update(name,next)}/> :
          definition?.kind === 'IMAGE' ? <div className="form-label"><label>{label}</label>
            <TenantMediaPicker value={String(value??'')} disabled={disabled}
              onChange={next=>update(name,next)}/></div> :
          definition?.kind === 'BOOLEAN' || typeof value === 'boolean'
            ? <BooleanPropertyEditor label={label} value={value} disabled={disabled} onChange={next=>update(name,next)}/>
            : definition?.kind === 'NUMBER' || definition?.kind === 'CURRENCY' || typeof value === 'number'
              ? <NumberPropertyEditor id={id} label={label} value={value} disabled={disabled} onChange={next=>update(name,next)} onClear={()=>remove(name)}/> : typeof value === 'string'
                ? <div className="form-label"><label htmlFor={id}>{label}</label>
                    {/formula|expression/i.test(name)
                      ? <ExpressionPropertyEditor id={id} value={value} disabled={disabled} objects={objects} primaryObjectApiName={primaryObjectApiName} appObjectApiNames={appObjectApiNames} onChange={next=>update(name,next)}/>
                      : /^(on[A-Z]|event)/.test(name)
                        ? <EventPropertyEditor id={id} value={value} disabled={disabled} objects={objects} primaryObjectApiName={primaryObjectApiName} appObjectApiNames={appObjectApiNames} onChange={next=>update(name,next)}/>
                        : /mobile|tablet|desktop|responsive|breakpoint/i.test(name)
                          ? <ResponsivePropertyEditor id={id} value={value} disabled={disabled} objects={objects} primaryObjectApiName={primaryObjectApiName} appObjectApiNames={appObjectApiNames} onChange={next=>update(name,next)}/>
                          : <StringPropertyEditor id={id} name={name} isColor={definition?.kind==='COLOR'} value={value} disabled={disabled} objects={objects} primaryObjectApiName={primaryObjectApiName} appObjectApiNames={appObjectApiNames} onChange={next=>update(name,next)}/>}
                  </div> : <div className="properties-help">{label} contains structured data; its existing value is preserved.</div>}
          {definition && !validateComponentSetting(definition,value) && <span className="auth-error">Invalid {label.toLowerCase()}</span>}
          <button className="btn btn-small" type="button" disabled={disabled || Boolean(definition?.required)}
            aria-label={`Remove ${label} property`} onClick={() => remove(name)}>Remove property</button>
        </div>;
      })}
    </details>}
    <div className="properties-section-title">Add setting</div>
    <label className="form-label">Property API name
      <input className="form-control" disabled={disabled} value={propertyName}
        placeholder="e.g. title, accentColor, columns"
        onChange={(event) => { setPropertyName(event.target.value); setError(''); }} />
    </label>
    <label className="form-label">Value type
      <select className="form-control" value={propertyType} disabled={disabled}
        onChange={(event) => setPropertyType(event.target.value as ComponentPropertyKind)}>
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="boolean">True / false</option>
      </select>
    </label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <button type="button" className="btn" disabled={disabled || !propertyName.trim()}
      onClick={add}>Add property</button>
  </div>;
}
