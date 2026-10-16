import { randomUUID } from 'node:crypto';
import type { TenantData } from '../../core/state/types.js';
import type { FlowRuntimeContext } from '../../index.js';
import { formulaLocalDate } from '../../core/local-time.js';
import { evaluateFormula } from './formula-evaluator.js';
import { evaluateCustomConditionLogic } from './condition-logic.js';

/** Shared Flow resource bindings, formulas, templates and conditional runtime. */
export function createFlowContextRuntime(deps: { formulaContextForUser: (tenant: TenantData, userId: string) => { timeZone: string } }) {
 const { formulaContextForUser } = deps;
function asConfigRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function flowVariablesForUser(
  tenant: TenantData,
  userId: string,
  interviewGuid: string = randomUUID(),
  interviewStartTime?: string
): Record<string, unknown> {
  const now = new Date();
  return {
    CurrentDate: formulaLocalDate(now, formulaContextForUser(tenant, userId).timeZone),
    CurrentDateTime: now.toISOString(),
    TriggeringUserId: userId,
    InterviewGuid: interviewGuid,
    InterviewStartTime: interviewStartTime ?? now.toISOString(),
    CompanySettings: {
      StandardVatRate: tenant.currencySettings.standardVatRate,
      CorporateCurrency: tenant.currencySettings.corporateCurrency
    }
  };
}

function flowInterviewIdentity(context: FlowRuntimeContext): { interviewGuid: string; interviewStartTime: string } {
  const interviewGuid = context.flowVariables?.InterviewGuid;
  const interviewStartTime = context.flowVariables?.InterviewStartTime;
  if (typeof interviewGuid !== 'string' || typeof interviewStartTime !== 'string') {
    throw new Error('Flow interview identity is unavailable.');
  }
  return { interviewGuid, interviewStartTime };
}

function resolveFlowResource(name: string, context: FlowRuntimeContext): unknown {
  const resource = context.resourceDefinitions?.find((item) => item.name === name);
  if (!resource) return context.variables[name];
  if (resource.type === 'Text Template') {
    return String(resource.value ?? '').replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
      const resolved = resolveFlowValue(`{${reference}}`, context);
      return resolved === undefined || resolved === null ? '' : String(resolved);
    });
  }
  if (resource.type !== 'Formula') return context.variables[name];
  if (context.formulaStack.has(name)) throw new Error(`Flow formula dependency cycle detected at "${name}".`);
  if (typeof resource.value !== 'string' || !resource.value.trim()) throw new Error(`Flow formula "${resource.label}" has no expression.`);
  context.formulaStack.add(name);
  try {
    const resolveReference = (reference: string) => {
      if (context.record && Object.hasOwn(context.record, reference)) return context.record[reference];
      if (context.prior && Object.hasOwn(context.prior, reference)) return context.prior[reference];
      return resolveFlowValue(`{${reference}}`, context);
    };
    const value = evaluateFormula(resource.value, resolveReference, {
      ...(context.recordEvent ? { isNew: context.recordEvent === 'created' } : {}),
        isClone: context.isClone,
      hasPrior: context.prior !== undefined,
      timeZone: context.timeZone,
      locale: context.locale,
      currentUser: context.currentUser,
      flowVariables: { ...context.flowVariables, ...context.flow },
      corporateCurrency: context.corporateCurrency,
      currencyRates: context.currencyRates,
      userCurrencyIsoCode: context.userCurrencyIsoCode,
      currencyIsoCode: typeof context.record?.CurrencyIsoCode === 'string'
        ? context.record.CurrencyIsoCode
        : context.corporateCurrency,
      resolvePriorField: (reference) => {
        if (context.prior && Object.hasOwn(context.prior, reference)) return context.prior[reference];
        return resolveFlowValue(`{${reference}}`, context);
      }
    });
    switch (resource.dataType) {
      case 'Number':
      case 'Currency':
      case 'Percent': {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error(`Flow formula "${resource.label}" did not produce a finite number.`);
        return numeric;
      }
      case 'Boolean':
      case 'Checkbox':
        if (typeof value !== 'boolean') throw new Error(`Flow formula "${resource.label}" must produce a Boolean value.`);
        return value;
      case 'Date': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Flow formula "${resource.label}" did not produce a valid date.`);
        return date.toISOString().slice(0, 10);
      }
      case 'Date/Time': {
        const date = new Date(String(value));
        if (!Number.isFinite(date.getTime())) throw new Error(`Flow formula "${resource.label}" did not produce a valid date and time.`);
        return date.toISOString();
      }
      case 'Time':
        if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/.test(value)) {
          throw new Error(`Flow formula "${resource.label}" did not produce a valid time.`);
        }
        return value;
      case 'Text':
        if (value !== null && typeof value !== 'string') {
          throw new Error(`Flow formula "${resource.label}" must produce text.`);
        }
        return value ?? '';
      default:
        return value;
    }
  } finally {
    context.formulaStack.delete(name);
  }
}

function resolveFlowValue(value: unknown, context: FlowRuntimeContext): unknown {
  if (typeof value !== 'string') return value;
  const reference = /^\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}?$/.exec(value.trim());
  const path = reference?.[1];
  if (!path) return value;
  const [root, ...segments] = path.split('.');
  let result: unknown = root === '$Record' ? context.record
    : root === '$Prior' || root === '$Record__Prior' ? context.prior
      : root === '$User' ? context.currentUser ?? { Id: context.currentUserId }
        : root === '$Flow' ? { ...context.flowVariables, ...context.flow }
          : root === '$CompanySettings' ? context.flowVariables?.CompanySettings
          : resolveFlowResource(root, context);
  for (const segment of segments) {
    if (!result || typeof result !== 'object') return undefined;
    result = (result as Record<string, unknown>)[segment];
  }
  return result;
}

function resolveFlowTemplate(value: string, context: FlowRuntimeContext): string {
  return value.replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
    const resolved = resolveFlowValue(`{${reference}}`, context);
    if (resolved === undefined) throw new Error(`Flow template references an unavailable value "${reference}".`);
    return resolved === null ? '' : typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
  });
}

function compareFlowValue(left: unknown, operator: string, right: unknown): boolean {
  const normalizedLeft = typeof left === 'string' ? left.toLowerCase() : left;
  const normalizedRight = typeof right === 'string' ? right.toLowerCase() : right;
  switch (operator) {
    case 'Equals': return normalizedLeft === normalizedRight || String(left ?? '') === String(right ?? '');
    case 'Not Equals':
    case 'Not Equal To': return !(normalizedLeft === normalizedRight || String(left ?? '') === String(right ?? ''));
    case 'Is Null': return left === null || left === undefined || left === '';
    case 'Is Not Null': return left !== null && left !== undefined && left !== '';
    case 'Greater Than': return Number(left) > Number(right);
    case 'Less Than': return Number(left) < Number(right);
    case 'Contains': return Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
    case 'Starts With': return String(left ?? '').toLocaleLowerCase().startsWith(String(right ?? '').toLocaleLowerCase());
    default: throw new Error(`Unsupported flow condition operator "${operator}".`);
  }
}

function flowConditionsMatch(conditions: Array<Record<string, unknown>>, source: Record<string, unknown>, context: FlowRuntimeContext, logicOverride?: unknown): boolean {
  if (!conditions.length) return true;
  const checks = conditions.map((condition) => {
    const field = typeof condition.field === 'string' ? condition.field : '';
    if (!field) throw new Error('A flow condition is missing its field.');
    const left = /^\{!?[A-Za-z_$][A-Za-z0-9_.$]*\}$/.test(field) ? resolveFlowValue(field, context) : source[field];
    return compareFlowValue(left, String(condition.operator ?? 'Equals'), resolveFlowValue(condition.value, context));
  });
  const rawLogic = String(logicOverride ?? conditions[0].logic ?? 'All');
  const logic = rawLogic.toLowerCase();
  if (logic === 'any') return checks.some(Boolean);
  if (logic === 'all') return checks.every(Boolean);
  return evaluateCustomConditionLogic(rawLogic, checks);
}

function flowFieldValues(config: Record<string, unknown>, context: FlowRuntimeContext): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const entry of asConfigRows(config.fieldValues)) {
    if (typeof entry.field !== 'string' || !entry.field) throw new Error('A flow field assignment is missing its field.');
    values[entry.field] = resolveFlowValue(entry.value, context);
  }
  if (!Object.keys(values).length && typeof config.field === 'string' && config.field) {
    values[config.field] = resolveFlowValue(config.value, context);
  }
  return values;
}


 return { asConfigRows, flowVariablesForUser, flowInterviewIdentity, resolveFlowResource,
  resolveFlowValue, resolveFlowTemplate, compareFlowValue, flowConditionsMatch, flowFieldValues };
}
