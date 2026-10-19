import { useState } from 'react';
import type { FieldMetadata } from '../../core/metadata/Definitions/metadata';
import {
  examineRecordFilter, isBooleanFilterField, isNumericFilterField, supportedFilterOperators
} from '../../core/records/RecordWorkspace/recordFilterMetadata';

export default function RecordFilterEditor({
  title, fields, filters, onChange
}: {
  title: string;
  fields: FieldMetadata[];
  filters: unknown[];
  onChange: (next: unknown[]) => void;
}) {
  const [fieldSearch, setFieldSearch] = useState('');
  const set = (index: number, patch: Record<string, unknown>) => {
    onChange(filters.map((entry, i) => i === index
      ? { ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}), ...patch }
      : entry));
  };
  const remove = (index: number) => onChange(filters.filter((_, i) => i !== index));
  const search = fieldSearch.trim().toLowerCase();
  return <div className="metadata-record-filter-editor" aria-label={title + ' filter editor'}>
    <div className="properties-section-title">{title}</div>
    <label className="form-label">Find a field
      <input type="search" className="form-control" value={fieldSearch} placeholder="Search field names"
        onChange={e => setFieldSearch(e.target.value)} />
    </label>
    {filters.map((entry, index) => {
      const raw = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry as Record<string, unknown> : {};
      const fieldName = String(raw.field ?? '');
      const field = fields.find(candidate => candidate.apiName === fieldName);
      const operator = String(raw.operator ?? 'Equals');
      const dynamic=raw.value && typeof raw.value === 'object' && !Array.isArray(raw.value)
        ?raw.value as {source?:string;key?:string}:undefined;
      const source=dynamic?.source??'Fixed';
      const value = dynamic?'':String(raw.value ?? '');
      const available = supportedFilterOperators(field);
      const candidates = fields.filter(item =>
        item.apiName === fieldName || !search
          || (item.label + ' ' + item.apiName).toLowerCase().includes(search));
      const error = examineRecordFilter(entry, fields);
      return <div key={index} className="home-page-assignment metadata-filter-condition" data-filter-index={index}>
        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Condition {index + 1}</strong>
          <button type="button" className="btn btn-small" onClick={() => remove(index)}>Remove filter</button>
        </div>
        <label className="form-label">Field
          <select className="form-control" aria-label={title + ' field ' + (index + 1)} value={fieldName}
            onChange={e => set(index, { field: e.target.value, operator: 'Equals', value: '' })}>
            <option value="">Choose field…</option>
            {fieldName && !field && <option value={fieldName} disabled>Missing: {fieldName}</option>}
            {candidates.map(item => <option key={item.apiName} value={item.apiName}>
              {item.label} ({item.apiName})
            </option>)}
          </select>
        </label>
        <label className="form-label">Operator
          <select className="form-control" aria-label={title + ' operator ' + (index + 1)}
            value={operator} onChange={e => set(index, { operator: e.target.value })}>
            {!available.includes(operator as typeof available[number]) && <option value={operator} disabled>
              Unsupported: {operator}
            </option>}
            {available.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="form-label">Value source
          <select className="form-control" aria-label={title+' value source '+(index+1)}
            value={source} onChange={e=>set(index,{value:e.target.value==='Fixed'?''
              :e.target.value==='PageState'?{source:'PageState',key:''}
              :{source:e.target.value}})}>
            <option value="Fixed">Fixed value</option>
            <option value="PageState">Page state / Flow output</option>
            <option value="CurrentRecord">Current record ID</option>
            <option value="Session">Current session ID</option>
          </select>
        </label>
        {source==='PageState' ? <label className="form-label">Page state key
          <input className="form-control" aria-label={title+' page state key '+(index+1)}
            value={dynamic?.key??''} placeholder="e.g. CurrentCartId"
            onChange={e=>set(index,{value:{source:'PageState',key:e.target.value}})} />
        </label> : source==='Fixed' ? <label className="form-label">Value
          {isBooleanFilterField(field)
            ? <select className="form-control" aria-label={title + ' value ' + (index + 1)}
                value={value} onChange={e => set(index, { value: e.target.value })}>
                <option value="">Choose value…</option><option value="true">True</option><option value="false">False</option>
              </select>
            : field?.dataType === 'Picklist' && field.picklistValues?.length
              ? <select className="form-control" aria-label={title + ' value ' + (index + 1)}
                  value={value} onChange={e => set(index, { value: e.target.value })}>
                  <option value="">Choose value…</option>
                  {value && !field.picklistValues.includes(value) && <option value={value}>
                    Saved: {value}
                  </option>}
                  {field.picklistValues.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                </select>
              : <input className="form-control" aria-label={title + ' value ' + (index + 1)}
                  type={isNumericFilterField(field) ? 'number' : 'text'} value={value}
                  onChange={e => set(index, { value: e.target.value })} />}
        </label> : null}
        {error && <p className="properties-help" role="alert">{error}</p>}
      </div>;
    })}
    <button type="button" className="btn btn-small" disabled={!fields.length}
      onClick={() => onChange([...filters, { field: '', operator: 'Equals', value: '' }])}>Add filter</button>
    {!fields.length && <p className="properties-help">Select a data object with accessible fields to create a filter.</p>}
  </div>;
}
