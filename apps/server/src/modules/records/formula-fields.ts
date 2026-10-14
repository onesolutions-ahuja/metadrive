import { evaluateFormula } from '../flows/formula-evaluator.js';
type FormulaField = { apiName: string; formula?: { expression: string; returnType: string } | null };
type FormulaObject = { fields: readonly FormulaField[] };
export function calculateFormulaFields<T extends Record<string, unknown>>(
  object: FormulaObject,
  record: T,
  formulaContext: {
    timeZone?: string;
    locale?: string;
    currentUser?: Record<string, unknown>;
    corporateCurrency?: string;
    currencyRates?: Record<string, number>;
    userCurrencyIsoCode?: string;
    isClone?: boolean;
  } = {}
): T {
  const fields = new Map(object.fields.map((field) => [field.apiName, field]));
  const result = { ...record };
  const calculating = new Set<string>();
  const calculateField = (fieldName: string): unknown => {
    const field = fields.get(fieldName);
    if (!field?.formula) return result[fieldName];
    if (calculating.has(fieldName)) throw new Error(`Formula dependency cycle detected at "${fieldName}".`);
    calculating.add(fieldName);
    const value = evaluateFormula(field.formula.expression, (reference) => {
      const referencedField = fields.get(reference);
      return referencedField?.formula ? calculateField(reference) : result[reference];
    }, {
      ...formulaContext,
      currencyIsoCode: typeof result.CurrencyIsoCode === 'string'
        ? result.CurrencyIsoCode
        : formulaContext.corporateCurrency
    });
    calculating.delete(fieldName);
    switch (field.formula.returnType) {
      case 'Number':
      case 'Currency':
      case 'Percent': {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error(`Formula field "${fieldName}" did not produce a valid number.`);
        result[fieldName] = numeric;
        break;
      }
      case 'Checkbox': result[fieldName] = Boolean(value); break;
      case 'Date': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Formula field "${fieldName}" did not produce a valid date.`);
        result[fieldName] = date.toISOString().slice(0, 10);
        break;
      }
      default: result[fieldName] = String(value ?? '');
    }
    return result[fieldName];
  };
  for (const field of object.fields) if (field.formula) calculateField(field.apiName);
  return result as T;
}

