import { useState } from 'react';
import { sortComponentSettings, validateComponentSetting, type ComponentSettingDefinition } from './componentSettingDefinitions';
import {
  addComponentProperty,
  displayComponentPropertyName,
  validateComponentPropertyName,
  type ComponentPropertyKind,
  type ComponentPropertyValues
} from './componentProperties';

export default function CustomComponentPropertyEditor({
  properties,
  onChange,
  disabled = false,
  addOnly = false,
  definitions
}: {
  properties: ComponentPropertyValues;
  onChange: (next: ComponentPropertyValues) => void;
  disabled?: boolean;
  addOnly?: boolean;
  definitions?: readonly ComponentSettingDefinition[];
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
    {(!addOnly || typedDefinitions.length > 0) && <>
      <div className="properties-section-title">Component settings</div>
      {!Object.keys(properties).length && <p className="properties-help">No settings yet. Add a property to configure this component.</p>}
      {(addOnly ? visibleProperties.filter(([name]) => definitionByName.has(name)) : visibleProperties).map(([name, value]) => {
        const definition = definitionByName.get(name);
        const label = definition?.label ?? displayComponentPropertyName(name);
        const id = `component-property-${name}`;
        return <div className="metadata-array-property" key={name}>
          {definition?.kind === 'SELECT' && definition.choices ? <label className="form-label" htmlFor={id}>{label}
            <select id={id} className="form-control" disabled={disabled} value={String(value)} onChange={event => update(name,event.target.value)}>
              {!definition.required && <option value="">None</option>}
              {definition.choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
            </select></label> :
          typeof value === 'boolean'
            ? <label className="checkbox-row"><input type="checkbox" disabled={disabled} checked={value}
                onChange={(event) => update(name, event.target.checked)} />{label}</label>
            : typeof value === 'number'
              ? <label className="form-label" htmlFor={id}>{label}
                  <input id={id} className="form-control" type="number" disabled={disabled}
                    value={Number.isFinite(value) ? value : 0}
                    onChange={(event) => update(name, event.target.value === '' ? 0 : Number(event.target.value))} />
                </label>
              : typeof value === 'string'
                ? <label className="form-label" htmlFor={id}>{label}
                    <input id={id} className="form-control" disabled={disabled}
                      type={definition?.kind === 'COLOR' || (/color/i.test(name) && /^#[0-9a-f]{6}$/i.test(value)) ? 'color' : 'text'}
                      value={value} onChange={(event) => update(name, event.target.value)} />
                  </label>
                : <div className="properties-help">{label} contains structured data; its existing value is preserved.</div>}
          {definition && !validateComponentSetting(definition,value) && <span className="auth-error">Invalid {label.toLowerCase()}</span>}
          <button className="btn btn-small" type="button" disabled={disabled || Boolean(definition?.required)}
            aria-label={`Remove ${label} property`} onClick={() => remove(name)}>Remove property</button>
        </div>;
      })}
    </>}
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
