import type { FieldMetadata, PageComponentMetadata } from './metadata';
import { examineRecordFilter } from './recordFilterMetadata';

export type VisibilityCondition =
  | { source: 'Device'; operator: 'Equals' | 'Not Equals'; value: 'Desktop' | 'Phone' }
  | { source: 'Record Field'; fieldApiName: string; operator: string; value: string };

export type ComponentVisibilityRule = {
  logic: 'All' | 'Any';
  conditions: VisibilityCondition[];
};

export type ComponentVisibilityContext = {
  formFactor: 'Desktop' | 'Phone';
  fields?: ReadonlyArray<FieldMetadata>;
  record?: Readonly<Record<string, unknown>> | null;
  readableFieldApiNames?: ReadonlySet<string>;
};

const safeName = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Visibility controls presentation, NEVER the server's object/record/field permissions. */
export function validateVisibilityRule(
  raw: unknown,
  fields: ReadonlyArray<FieldMetadata>,
  allowRecordFields: boolean
): string[] {
  if (raw === undefined || raw === null) return [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['Invalid visibility metadata.'];
  const rule = raw as Record<string, unknown>;
  if (rule.logic !== 'All' && rule.logic !== 'Any') return ['Choose All or Any conditions.'];
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0 || rule.conditions.length > 20) {
    return ['Add between 1 and 20 visibility conditions.'];
  }
  return rule.conditions.flatMap((item: unknown, index: number) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return ['Condition ' + (index + 1) + ' is invalid.'];
    }
    const entry = item as Record<string, unknown>;
    if (entry.source === 'Device') {
      return (entry.operator === 'Equals' || entry.operator === 'Not Equals')
        && (entry.value === 'Desktop' || entry.value === 'Phone')
        ? [] : ['Condition ' + (index + 1) + ' has an invalid device comparison.'];
    }
    if (entry.source === 'Record Field') {
      if (!allowRecordFields) return ['Record field conditions require a Record Page.'];
      if (typeof entry.fieldApiName !== 'string' || !safeName.test(entry.fieldApiName)) {
        return ['Condition ' + (index + 1) + ' needs a record field.'];
      }
      const match = examineRecordFilter({
        field: entry.fieldApiName, operator: entry.operator, value: entry.value
      }, fields);
      return match ? ['Condition ' + (index + 1) + ': ' + match] : [];
    }
    return ['Condition ' + (index + 1) + ' has an unsupported source.'];
  });
}

/** Unconfigured components remain visible; invalid configurations fail closed. */
export function isComponentVisible(
  component: Pick<PageComponentMetadata, 'visible' | 'properties'>,
  context: ComponentVisibilityContext,
  allowRecordFields: boolean
): boolean {
  if (!component.visible) return false;
  const rule = component.properties.visibilityRules;
  if (rule === undefined || rule === null) return true;
  const fields = context.fields ?? [];
  if (validateVisibilityRule(rule, fields, allowRecordFields).length > 0) return false;
  const definition = rule as ComponentVisibilityRule;
  const results = definition.conditions.map(condition => {
    if (condition.source === 'Device') {
      return condition.operator === 'Equals'
        ? context.formFactor === condition.value
        : context.formFactor !== condition.value;
    }
    if (!context.record || !context.readableFieldApiNames?.has(condition.fieldApiName)
      || !Object.prototype.hasOwnProperty.call(context.record, condition.fieldApiName)) return false;
    const value = context.record[condition.fieldApiName];
    // Only evaluate against API-authorized readable record fields.
    if (value === null || value === undefined) return false;
    const current = String(value);
    const target = String(condition.value);
    switch (condition.operator) {
      case 'Equals': return current === target;
      case 'Not Equals': return current !== target;
      case 'Contains': return current.toLowerCase().includes(target.toLowerCase());
      case 'Greater Than': return Number(current) > Number(target);
      case 'Less Than': return Number(current) < Number(target);
      default: return false;
    }
  });
  return definition.logic === 'All' ? results.every(Boolean) : results.some(Boolean);
}
