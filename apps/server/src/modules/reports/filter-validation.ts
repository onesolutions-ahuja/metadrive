import { z } from 'zod';
import { reportFilterSchema } from './report-metadata.js';

/** Report authoring validation, reusing shared numeric and dashboard validators. */
export function createReportFilterValidation(deps: {
  isNumericField: (field: { dataType: string; formula?: { returnType: string } } | undefined) => boolean;
  dashboardFilterValueError: (field: { dataType: string; formula?: { returnType: string }; picklistValues?: string[] }, value: string) => string | null;
}) {
 const { isNumericField, dashboardFilterValueError } = deps;
type ReportFilterOperator = z.infer<typeof reportFilterSchema>['operator'];
function reportFilterOperatorAllowed(
  field: { dataType: string; formula?: { returnType: string } },
  operator: ReportFilterOperator
): boolean {
  const type = field.formula?.returnType ?? field.dataType.replace(/\(.*/, '');
  const nullOperators: ReportFilterOperator[] = ['Is Null', 'Is Not Null'];
  if (type === 'Multi-Select Picklist') {
    return [...nullOperators, 'Includes', 'Excludes'].includes(operator);
  }
  if (['Picklist', 'Checkbox', 'Reference', 'Id'].includes(type)) {
    return [...nullOperators, 'Equals', 'Not Equal To'].includes(operator);
  }
  if (isNumericField(field) || type === 'Date' || type === 'DateTime') {
    return [...nullOperators, 'Equals', 'Not Equal To', 'Greater Than', 'Greater Than or Equal To',
      'Less Than', 'Less Than or Equal To'].includes(operator);
  }
  return [...nullOperators, 'Equals', 'Not Equal To', 'Contains', 'Does Not Contain', 'Starts With'].includes(operator);
}
function reportFilterValueError(
  field: { dataType: string; formula?: { returnType: string }; picklistValues?: string[] },
  filter: z.infer<typeof reportFilterSchema>
): string | null {
  if (filter.operator === 'Is Null' || filter.operator === 'Is Not Null') return null;
  const values = filter.values.length
    ? filter.values
    : filter.value.trim()
      ? ['Includes', 'Excludes'].includes(filter.operator)
        ? filter.value.split(';').filter((value) => value.trim() !== '')
        : [filter.value]
      : [];
  for (const value of values) {
    const error = dashboardFilterValueError(field, value);
    if (error) return error;
  }
  return null;
}
 return { reportFilterOperatorAllowed, reportFilterValueError };
}
