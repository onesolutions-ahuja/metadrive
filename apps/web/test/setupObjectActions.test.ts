import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSetupObjectActions} from '../src/core/builders/ObjectManager/setupObjectActions';

const fieldDraftSetters = [
  'setNewFieldType', 'setNewFieldStage', 'setNewFieldLabel', 'setNewFieldTextLength',
  'setNewFieldAutoNumberFormat', 'setNewFieldPrecision', 'setNewFieldScale',
  'setNewFieldDescription', 'setNewFieldHelpText', 'setNewFieldDefaultValue',
  'setNewFieldHasDefault', 'setNewFieldFormula', 'setNewFieldFormulaValidation',
  'setNewFieldPicklistValues', 'setNewFieldPicklistRestricted',
  'setNewFieldControllerApiName', 'setNewFieldValueSettings',
  'setNewFieldRelationshipTarget', 'setNewFieldRelationshipName',
  'setNewFieldChildRelationshipName', 'setNewFieldRollupChildObject',
  'setNewFieldRollupRelationshipField', 'setNewFieldRollupOperation',
  'setNewFieldRollupSourceField', 'setNewFieldDeleteBehavior',
  'setNewFieldAllowReparenting', 'setNewFieldLookupFilters',
  'setNewFieldLookupFilterLogic', 'setNewFieldRequired', 'setNewFieldUnique',
  'setNewFieldExternalId', 'setNewFieldCaseSensitive', 'setNewFieldLayoutIds'
];

test('resetting a new field draft clears rollup configuration', () => {
  const calls = new Map<string, unknown[]>();
  const setters = Object.fromEntries(fieldDraftSetters.map((name) => [
    name,
    (...values: unknown[]) => calls.set(name, values)
  ]));
  const actions = createSetupObjectActions({
    ...setters,
    object: {fields: []},
    newFieldLabel: '',
    newFieldPicklistValues: '',
    newFieldControllerApiName: ''
  });

  actions.resetNewFieldDraft();

  assert.deepEqual(calls.get('setNewFieldRollupChildObject'), ['']);
  assert.deepEqual(calls.get('setNewFieldRollupRelationshipField'), ['']);
  assert.deepEqual(calls.get('setNewFieldRollupOperation'), ['COUNT']);
  assert.deepEqual(calls.get('setNewFieldRollupSourceField'), ['']);
});
