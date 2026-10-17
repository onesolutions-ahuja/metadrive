// @ts-nocheck
// Shared metadata-driven field creation wizard. View-only; actions remain in the object engine.
import type { RelatedLookupFilterMetadata } from './metadata';
import { Plus } from 'lucide-react';
import SmartFieldInput from './SmartFieldInput';
type NewFieldLookupFilterDraft = {
  id: string;
  relatedFieldApiName: string;
  operator: RelatedLookupFilterMetadata['operator'];
  valueMode: 'Value' | 'Field';
  value: string;
  valueFieldApiName: string;
  required: boolean;
};

export default function FieldWizardModal({ context }: { context: any }) {
  const ctx = context;
  const { X, addField, formulaEditorRef, insertFormulaText, newFieldAllowReparenting, newFieldApiName, newFieldCaseSensitive, newFieldChildRelationshipName, newFieldConfigurationError, newFieldController, newFieldControllerApiName, newFieldControllerValues, newFieldDefaultValue, newFieldDeleteBehavior, newFieldDescription, newFieldExternalId, newFieldFormula, newFieldFormulaValidation, newFieldHasDefault, newFieldHelpText, newFieldLabel, newFieldLayoutIds, newFieldLookupFilterLogic, newFieldLookupFilters, newFieldPicklistOptions, newFieldPicklistRestricted, newFieldPicklistValues, newFieldPrecision, newFieldRelationshipName, newFieldRelationshipTarget, newFieldRequired, newFieldReturnType, newFieldScale, newFieldStage, newFieldTextLength, newFieldType, newFieldUnique, newFieldValueSettings, object, objects, relatedLookupFilterOperators, resetNewFieldDraft, setNewFieldAllowReparenting, setNewFieldCaseSensitive, setNewFieldChildRelationshipName, setNewFieldControllerApiName, setNewFieldDefaultValue, setNewFieldDeleteBehavior, setNewFieldDescription, setNewFieldExternalId, setNewFieldFormula, setNewFieldFormulaValidation, setNewFieldHasDefault, setNewFieldHelpText, setNewFieldLabel, setNewFieldLayoutIds, setNewFieldLookupFilterLogic, setNewFieldLookupFilters, setNewFieldPicklistRestricted, setNewFieldPicklistValues, setNewFieldPrecision, setNewFieldRelationshipName, setNewFieldRelationshipTarget, setNewFieldRequired, setNewFieldReturnType, setNewFieldScale, setNewFieldStage, setNewFieldTextLength, setNewFieldType, setNewFieldUnique, setNewFieldValueSettings, setShowNewField, showNewField, validateNewFieldFormula } = ctx;
  return <>
      {showNewField && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { resetNewFieldDraft(); setShowNewField(false); } }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-field-title">
            <div className="modal-header"><h2 id="new-field-title">New Field</h2><button className="icon-button dark" onClick={() => { resetNewFieldDraft(); setShowNewField(false); }} aria-label="Close"><X size={18} /></button></div>
            <p className="modal-copy">Create a field on {object.label}. Formula and relationship definitions are stored as object metadata.</p>
            <div className="wizard-progress" aria-label="New field steps">
              {(['Select Type', 'Configure', 'Page Layouts', 'Review'] as const).map((step, index) => <span key={step} className={newFieldStage === index ? 'active' : newFieldStage > index ? 'complete' : ''}>{index + 1}. {step}</span>)}
            </div>
            {newFieldStage === 0 && <div>
              <label className="form-label" htmlFor="new-field-type">Data Type</label>
              <select className="form-control" id="new-field-type" value={newFieldType} onChange={(event) => setNewFieldType(event.target.value)}>
              {['Text', 'Long Text Area', 'Number', 'Currency', 'Percent', 'Date', 'Date/Time', 'Checkbox', 'Email', 'Phone', 'URL', 'Geolocation', 'Picklist', 'Multi-Select Picklist', 'Formula', 'Lookup Relationship', 'Master-Detail Relationship', ...(object.apiName === 'User' ? ['Hierarchical Relationship'] : [])].map((type) => <option key={type}>{type}</option>)}
              </select>
              <p className="permission-help">External Lookup and Indirect Lookup require external objects, which are not supported for this object. Hierarchical Relationship is available for User.</p>
            </div>}
            {newFieldStage === 1 && <div>
            <label className="form-label" htmlFor="new-field-label">Field Label</label>
            <input className="form-control" id="new-field-label" value={newFieldLabel} onChange={(event) => setNewFieldLabel(event.target.value)} placeholder="Enter a field label" autoFocus />
            <label className="form-label">Field Name<div className="form-display">{newFieldApiName || 'Enter a field label to generate the API name'}</div></label>
            {newFieldType === 'Text' && <label className="form-label" htmlFor="new-field-text-length">Length<input className="form-control" id="new-field-text-length" type="number" min={1} max={255} step={1} value={newFieldTextLength} onChange={(event) => setNewFieldTextLength(Number(event.target.value))} /></label>}
            {['Number', 'Currency', 'Percent'].includes(newFieldType) && <div className="form-options">
              <label className="form-label">Length (Precision)<input className="form-control" type="number" min={1} max={18} step={1} value={newFieldPrecision} onChange={(event) => {
                const precision = Number(event.target.value);
                setNewFieldPrecision(precision);
                setNewFieldScale((scale) => Math.min(scale, precision));
              }} /></label>
              <label className="form-label">Decimal Places (Scale)<input className="form-control" type="number" min={0} max={newFieldPrecision} step={1} value={newFieldScale} onChange={(event) => setNewFieldScale(Number(event.target.value))} /></label>
            </div>}
            {['Picklist', 'Multi-Select Picklist'].includes(newFieldType) && <>
              <label className="form-label" htmlFor="new-field-picklist-values">Picklist Values</label>
              <textarea className="form-control" id="new-field-picklist-values" value={newFieldPicklistValues} onChange={(event) => {
                const values = event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
                setNewFieldPicklistValues(event.target.value);
                setNewFieldValueSettings((current) => Object.fromEntries(Object.entries(current)
                  .map(([controllerValue, selectedValues]) => [controllerValue, selectedValues.filter((value) => values.includes(value))])));
              }} placeholder={'New\\nIn Progress\\nCompleted'} rows={4} />
              <label className="checkbox-row"><input type="checkbox" checked={newFieldPicklistRestricted} onChange={(event) => setNewFieldPicklistRestricted(event.target.checked)} />Restrict to the values defined in the value set</label>
              {object.fields.some((field) => field.apiName !== newFieldApiName && (field.dataType === 'Picklist' || field.dataType === 'Checkbox')) && <div className="metadata-card">
                <label className="form-label">Controlling Field
                  <select className="form-control" value={newFieldControllerApiName} onChange={(event) => {
                    const controllerApiName = event.target.value;
                    const controller = object.fields.find((field) => field.apiName === controllerApiName);
                    const values = controller?.dataType === 'Checkbox' ? ['true', 'false'] : controller?.picklistValues ?? [];
                    setNewFieldControllerApiName(controllerApiName);
                    setNewFieldValueSettings(Object.fromEntries(values.map((value) => [value, newFieldValueSettings[value] ?? []])));
                  }}>
                    <option value="">None</option>{object.fields.filter((field) => field.apiName !== newFieldApiName && (field.dataType === 'Picklist' || field.dataType === 'Checkbox')).map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.dataType})</option>)}
                  </select>
                </label>
                {newFieldControllerApiName && <><p className="permission-help">Choose which values are available for each controlling value.</p>{newFieldControllerValues.map((controllerValue) => <div className="metadata-card" key={controllerValue}>
                  <strong>{controllerValue}</strong>
                  <div className="field-selector-list">{newFieldPicklistOptions.map((value) => <label className="checkbox-row" key={value}><input type="checkbox" checked={(newFieldValueSettings[controllerValue] ?? []).includes(value)} onChange={() => {
                    const selectedValues = newFieldValueSettings[controllerValue] ?? [];
                    setNewFieldValueSettings({ ...newFieldValueSettings, [controllerValue]: selectedValues.includes(value) ? selectedValues.filter((item) => item !== value) : [...selectedValues, value] });
                  }} />{value}</label>)}</div>
                </div>)}</>}
              </div>}
            </>}
            {(newFieldType === 'Lookup Relationship' || newFieldType === 'Master-Detail Relationship' || newFieldType === 'Hierarchical Relationship') && <>
              {newFieldType === 'Hierarchical Relationship'
                ? <div className="form-display">Related Object: User</div>
                : <label className="form-label" htmlFor="new-field-target">Related Object
                  <select className="form-control" id="new-field-target" value={newFieldRelationshipTarget} onChange={(event) => {
                    setNewFieldRelationshipTarget(event.target.value);
                    setNewFieldLookupFilters([]);
                    setNewFieldLookupFilterLogic('All');
                  }}>
                    <option value="">Select an object</option>{objects.filter((item) => item.apiName !== object.apiName).map((item) => <option key={item.apiName} value={item.apiName}>{item.label}</option>)}
                  </select>
                </label>}
              <label className="form-label">Relationship Name
                  <input className="form-control" value={newFieldRelationshipName || newFieldLabel.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}
                  onChange={(event) => setNewFieldRelationshipName(event.target.value)} />
              </label>
              <label className="form-label">Child Relationship Name
                <input className="form-control" value={newFieldChildRelationshipName || `${object.apiName.replace(/__c$/, '')}Records`}
                  onChange={(event) => setNewFieldChildRelationshipName(event.target.value)} />
              </label>
              {newFieldType === 'Lookup Relationship' && <label className="form-label">When a referenced record is deleted
                <select className="form-control" value={newFieldRequired ? 'Restrict' : newFieldDeleteBehavior}
                  disabled={newFieldRequired}
                  onChange={(event) => setNewFieldDeleteBehavior(event.target.value as 'Clear' | 'Restrict')}>
                  <option value="Clear">Clear the lookup field</option>
                  <option value="Restrict">Prevent deletion</option>
                </select>
              </label>}
              {newFieldType === 'Master-Detail Relationship' && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldAllowReparenting} onChange={(event) => setNewFieldAllowReparenting(event.target.checked)} />
                Allow reparenting
              </label>}
              {newFieldType !== 'Hierarchical Relationship' && newFieldRelationshipTarget && <>
                <div className="section-toolbar">
                  <div><h3>Related Lookup Filters</h3><p>Add one or more criteria that determine which records are eligible.</p></div>
                  <button type="button" className="btn" onClick={() => setNewFieldLookupFilters((filters) => [...filters, {
                    id: crypto.randomUUID(),
                    relatedFieldApiName: '',
                    operator: 'Equals',
                    valueMode: 'Value',
                    value: '',
                    valueFieldApiName: '',
                    required: true
                  }])}><Plus size={14} />Add Filter</button>
                </div>
                {newFieldLookupFilters.length > 1 && <label className="form-label">Required criteria match
                  <select className="form-control" aria-label="Lookup filter logic" value={newFieldLookupFilterLogic} onChange={(event) => setNewFieldLookupFilterLogic(event.target.value as 'All' | 'Any')}>
                    <option value="All">All criteria</option><option value="Any">Any criterion</option>
                  </select>
                </label>}
                {newFieldLookupFilters.map((filter, index) => {
                  const relatedFields = objects.find((item) => item.apiName === newFieldRelationshipTarget)?.fields ?? [];
                  const noOperand = filter.operator === 'Is Null' || filter.operator === 'Is Not Null';
                  const updateFilter = (update: Partial<NewFieldLookupFilterDraft>) => setNewFieldLookupFilters((filters) =>
                    filters.map((candidate) => candidate.id === filter.id ? { ...candidate, ...update } : candidate));
                  return <div className="metadata-card" key={filter.id}>
                    <div className="metadata-card-header"><h4>Filter {index + 1}</h4><button type="button" className="row-menu" aria-label={`Remove lookup filter ${index + 1}`} onClick={() => setNewFieldLookupFilters((filters) => filters.filter((candidate) => candidate.id !== filter.id))}><X size={14} /></button></div>
                    <label className="form-label">Related Field
                      <select className="form-control" value={filter.relatedFieldApiName} onChange={(event) => updateFilter({ relatedFieldApiName: event.target.value })}>
                        <option value="">Select a field…</option>{relatedFields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                      </select>
                    </label>
                    <label className="form-label">Operator
                      <select className="form-control" value={filter.operator} onChange={(event) => updateFilter({
                        operator: event.target.value as RelatedLookupFilterMetadata['operator'],
                        ...(event.target.value === 'Is Null' || event.target.value === 'Is Not Null' ? { value: '', valueFieldApiName: '' } : {})
                      })}>
                        {relatedLookupFilterOperators.map((operator) => <option key={operator}>{operator}</option>)}
                      </select>
                    </label>
                    {!noOperand && <>
                      <label className="form-label">Compare Against
                        <select className="form-control" value={filter.valueMode} onChange={(event) => updateFilter({ valueMode: event.target.value as 'Value' | 'Field', value: '', valueFieldApiName: '' })}>
                          <option value="Value">A value</option>
                          <option value="Field">A field on this object</option>
                        </select>
                      </label>
                      {filter.valueMode === 'Field'
                        ? <label className="form-label">Source Field
                          <select className="form-control" value={filter.valueFieldApiName} onChange={(event) => updateFilter({ valueFieldApiName: event.target.value })}>
                            <option value="">Select a field…</option>{object.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                          </select>
                        </label>
                        : <label className="form-label">Value
                          <input className="form-control" value={filter.value} onChange={(event) => updateFilter({ value: event.target.value })} />
                        </label>}
                    </>}
                    <label className="checkbox-row"><input type="checkbox" checked={filter.required} onChange={(event) => updateFilter({ required: event.target.checked })} />Required</label>
                  </div>;
                })}
              </>}
            </>}
            {newFieldType === 'Formula' && <>
              <label className="form-label" htmlFor="new-field-return-type">Formula Return Type</label>
              <select className="form-control" id="new-field-return-type" value={newFieldReturnType} onChange={(event) => { setNewFieldReturnType(event.target.value); setNewFieldFormulaValidation({ status: 'idle', message: '' }); }}>{['Number', 'Currency', 'Percent', 'Text', 'Date', 'Checkbox'].map((type) => <option key={type}>{type}</option>)}</select>
              <label className="form-label" htmlFor="new-field-formula">Formula</label>
              <SmartFieldInput textareaRef={formulaEditorRef} id="new-field-formula" multiline rows={4} kind="formula"
                value={newFieldFormula} objects={objects} primaryObjectApiName={object.apiName}
                onChange={next => { setNewFieldFormula(next); setNewFieldFormulaValidation({ status: 'idle', message: '' }); }}
                placeholder="For example: @Sale.Amount * @Sale.Probability" />
              <div className="formula-builder-tools">
                <label className="form-label">Insert Field
                  <select className="form-control" value="" onChange={(event) => { if (event.target.value) insertFormulaText(event.target.value); }}>
                    <option value="">Select a field…</option>
                    {object.fields.map((field) => <option key={field.apiName} value={field.apiName}>{field.label} ({field.apiName})</option>)}
                  </select>
                </label>
                <label className="form-label">Insert Function
                  <select className="form-control" value="" onChange={(event) => {
                    const templates: Record<string, string> = {
                      IF: 'IF(condition, value_if_true, value_if_false)',
                      AND: 'AND(condition1, condition2)',
                      OR: 'OR(condition1, condition2)',
                      CASE: 'CASE(expression, value1, result1, default_result)',
                      ISBLANK: 'ISBLANK(value)',
                      BLANKVALUE: 'BLANKVALUE(value, replacement)',
                      TEXT: 'TEXT(value)',
                      DATE: 'DATE(year, month, day)',
                      ROUND: 'ROUND(number, num_digits)'
                    };
                    if (event.target.value) insertFormulaText(templates[event.target.value] ?? `${event.target.value}()`);
                    event.target.value = '';
                  }}>
                    <option value="">Select a function…</option>
                    {['IF', 'AND', 'OR', 'CASE', 'ISBLANK', 'BLANKVALUE', 'TEXT', 'DATE', 'ROUND'].map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>
              <div className="formula-operator-tools" aria-label="Insert operator">
                {[' + ', ' - ', ' * ', ' / ', ' = ', ' <> ', ' > ', ' < ', ' & ', ' AND ', ' OR '].map((operator) =>
                  <button key={operator} type="button" className="btn" onClick={() => insertFormulaText(operator)}>{operator.trim()}</button>
                )}
              </div>
              <div className="formula-validation-row">
                <button type="button" className="btn" onClick={() => { void validateNewFieldFormula(); }} disabled={!newFieldFormula.trim() || newFieldFormulaValidation.status === 'checking'}>
                  {newFieldFormulaValidation.status === 'checking' ? 'Checking…' : 'Check Syntax'}
                </button>
                {newFieldFormulaValidation.message && <span className={newFieldFormulaValidation.status === 'valid' ? 'formula-validation-success' : 'formula-validation-error'} role="status">{newFieldFormulaValidation.message}</span>}
              </div>
            </>}
            <label className="form-label" htmlFor="new-field-description">Description</label>
            <input className="form-control" id="new-field-description" value={newFieldDescription} onChange={(event) => setNewFieldDescription(event.target.value)} placeholder="Optional field description" />
            <label className="form-label" htmlFor="new-field-help-text">Help Text</label>
            <textarea className="form-control" id="new-field-help-text" value={newFieldHelpText} onChange={(event) => setNewFieldHelpText(event.target.value)} placeholder="Optional guidance shown to users" maxLength={255} rows={2} />
            {!['Formula', 'Geolocation', 'Lookup Relationship', 'Master-Detail Relationship', 'Hierarchical Relationship'].includes(newFieldType) && (newFieldType === 'Checkbox'
              ? <div className="form-options"><label className="checkbox-row"><input type="checkbox" checked={newFieldHasDefault} onChange={(event) => setNewFieldHasDefault(event.target.checked)} />Set a default value</label><label className="checkbox-row"><input type="checkbox" disabled={!newFieldHasDefault} checked={newFieldDefaultValue === 'true'} onChange={(event) => setNewFieldDefaultValue(String(event.target.checked))} />Default to checked</label></div>
              : ['Picklist', 'Multi-Select Picklist'].includes(newFieldType)
                ? <label className="form-label">Default Value<select className="form-control" multiple={newFieldType === 'Multi-Select Picklist'} value={newFieldType === 'Multi-Select Picklist' ? newFieldDefaultValue.split(';').filter(Boolean) : newFieldDefaultValue} onChange={(event) => {
                  const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
                  const value = newFieldType === 'Multi-Select Picklist' ? values.join(';') : values[0] ?? '';
                  setNewFieldDefaultValue(value);
                  setNewFieldHasDefault(value !== '');
                }}><option value="">— None —</option>{newFieldPicklistValues.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                : <label className="form-label" htmlFor="new-field-default">Default Value<input className="form-control" id="new-field-default" type={['Number', 'Currency', 'Percent'].includes(newFieldType) ? 'number' : newFieldType === 'Date' ? 'date' : newFieldType === 'Date/Time' ? 'datetime-local' : newFieldType === 'Email' ? 'email' : newFieldType === 'URL' ? 'url' : 'text'} step={['Number', 'Currency', 'Percent'].includes(newFieldType) ? (newFieldScale ? 10 ** -newFieldScale : 1) : undefined} maxLength={newFieldType === 'Text' ? newFieldTextLength : undefined} value={newFieldDefaultValue} onChange={(event) => { setNewFieldDefaultValue(event.target.value); setNewFieldHasDefault(event.target.value !== ''); }} /></label>)}
            {newFieldType !== 'Formula' && <div className="form-options">
              <label className="checkbox-row"><input type="checkbox" checked={newFieldType === 'Master-Detail Relationship' || newFieldRequired} disabled={newFieldType === 'Master-Detail Relationship'} onChange={(event) => setNewFieldRequired(event.target.checked)} /> Required</label>
              <label className="checkbox-row"><input type="checkbox" checked={newFieldUnique} disabled={newFieldType === 'Long Text Area' || newFieldType === 'Geolocation' || newFieldType === 'Multi-Select Picklist' || newFieldType === 'Lookup Relationship' || newFieldType === 'Master-Detail Relationship' || newFieldType === 'Hierarchical Relationship'} onChange={(event) => setNewFieldUnique(event.target.checked)} /> Unique</label>
              {['Text', 'Number', 'Email', 'Phone'].includes(newFieldType) && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldExternalId} onChange={(event) => setNewFieldExternalId(event.target.checked)} /> External ID
              </label>}
              {newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType) && <label className="checkbox-row">
                <input type="checkbox" checked={newFieldCaseSensitive} onChange={(event) => setNewFieldCaseSensitive(event.target.checked)} /> Treat uppercase and lowercase values as different
              </label>}
            </div>}
            </div>}
            {newFieldStage === 2 && <div className="metadata-card" aria-label="Add field to page layouts">
              <h3>Add to Page Layouts</h3>
              <p className="permission-help">Choose which record layouts should display this field. You can change placements later in Page Layouts.</p>
              {(object.pageLayouts ?? []).map((layout) => <label className="checkbox-row" key={layout.id}>
                <input type="checkbox" checked={newFieldLayoutIds.includes(layout.id)} onChange={() => setNewFieldLayoutIds((current) =>
                  current.includes(layout.id) ? current.filter((id) => id !== layout.id) : [...current, layout.id])} />
                {layout.label}
              </label>)}
              {(object.pageLayouts ?? []).length === 0 && <p className="permission-help">No page layouts are available for this object.</p>}
            </div>}
            {newFieldStage === 3 && <div className="metadata-card" aria-label="Field review">
              <h3>Review Field</h3>
              <dl className="metadata-summary">
                <dt>Data Type</dt><dd>{newFieldType}{newFieldType === 'Text' ? ` (${newFieldTextLength})` : ''}{['Number', 'Currency', 'Percent'].includes(newFieldType) ? ` (${newFieldPrecision}, ${newFieldScale})` : ''}</dd>
                <dt>Field Label</dt><dd>{newFieldLabel.trim()}</dd>
                <dt>Field Name</dt><dd>{newFieldApiName}</dd>
                <dt>Required / Unique</dt><dd>{newFieldType === 'Master-Detail Relationship' || newFieldRequired ? 'Required' : 'Optional'} / {newFieldUnique ? 'Unique' : 'Not unique'}</dd>
                {['Text', 'Number', 'Email', 'Phone'].includes(newFieldType) && <><dt>External ID</dt><dd>{newFieldExternalId ? 'Yes' : 'No'}</dd></>}
                {newFieldUnique && ['Text', 'Email', 'Phone'].includes(newFieldType) && <><dt>Case sensitivity</dt><dd>{newFieldCaseSensitive ? 'Case sensitive' : 'Case insensitive'}</dd></>}
                {newFieldDescription.trim() && <><dt>Description</dt><dd>{newFieldDescription.trim()}</dd></>}
                {newFieldHelpText.trim() && <><dt>Help Text</dt><dd>{newFieldHelpText.trim()}</dd></>}
                {newFieldPicklistOptions.length > 0 && <><dt>Values</dt><dd>{newFieldPicklistOptions.join(', ')}</dd></>}
                {newFieldController && <><dt>Controlling Field</dt><dd>{newFieldController.label}</dd></>}
                {newFieldRelationshipTarget && <><dt>Related Object</dt><dd>{newFieldRelationshipTarget}</dd></>}
                {newFieldHasDefault && <><dt>Default Value</dt><dd>{newFieldDefaultValue || '(blank)'}</dd></>}
                <dt>Page Layouts</dt><dd>{(object.pageLayouts ?? []).filter((layout) => newFieldLayoutIds.includes(layout.id)).map((layout) => layout.label).join(', ') || 'None'}</dd>
              </dl>
            </div>}
            {newFieldStage === 1 && newFieldConfigurationError && <p className="form-error" role="alert">{newFieldConfigurationError}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => { resetNewFieldDraft(); setShowNewField(false); }}>Cancel</button>
              {newFieldStage > 0 && <button className="btn" onClick={() => setNewFieldStage((stage) => (stage - 1) as 0 | 1 | 2 | 3)}>Back</button>}
              {newFieldStage < 3
                ? <button className="btn btn-brand" onClick={() => setNewFieldStage((stage) => (stage + 1) as 0 | 1 | 2 | 3)} disabled={newFieldStage === 1 && Boolean(newFieldConfigurationError)}>Next</button>
                : <button className="btn btn-brand" onClick={() => { void addField(); }} disabled={Boolean(newFieldConfigurationError)}>Save Field</button>}
            </div>
          </section>
        </div>
      )}</>;
}
