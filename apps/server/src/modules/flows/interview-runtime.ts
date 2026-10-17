
import type { FlowMetadata, FlowExecutionResult, FlowInterview, ObjectMetadata } from '../../index.js';
import { flowLocalDateTimeToInstant } from '../../core/local-time.js';
import { retryDelayMs } from '../../automation-policy.js';
import { createFlowInterview as buildFlowInterview } from './interview-factory.js';

/** Shared Flow interview ownership, locale/formula context and schedule timestamps. */
export function createFlowInterviewRuntime(deps: {
 getUsers: () => LocalUser[];
 tenantData: (tenantId: string) => TenantData | undefined;
}) {
 const { getUsers, tenantData } = deps;
function formulaContextForUser(tenant: TenantData, userId: string): {
  timeZone: string;
  locale: string;
  currentUser: Record<string, unknown>;
  corporateCurrency: string;
  currencyRates: Record<string, number>;
  userCurrencyIsoCode: string;
} {
  const user = tenant.accessControl.users.find((candidate) => candidate.id === userId);
  return {
    timeZone: user?.timeZone ?? 'UTC',
    locale: user?.locale ?? 'en-US',
    currentUser: user ? {
      Id: user.id,
      Name: user.name,
      Username: user.username,
      Email: user.username,
      UserRoleId: user.roleId ?? tenant.accessControl.roles.find((role) => role.name === user.role)?.id,
      ProfileId: user.profileId,
      LocaleSidKey: user.locale,
      TimeZoneSidKey: user.timeZone,
      CurrencyIsoCode: user.currencyIsoCode ?? tenant.currencySettings.corporateCurrency
    } : { Id: userId },
    corporateCurrency: tenant.currencySettings.corporateCurrency,
    userCurrencyIsoCode: user?.currencyIsoCode ?? tenant.currencySettings.corporateCurrency,
    currencyRates: Object.fromEntries(tenant.currencySettings.currencies.map((currency) => [
      currency.currencyIsoCode, currency.conversionRate
    ]))
  };
}

function scheduledPathTimestamp(
  field: ObjectMetadata['fields'][number] | undefined,
  value: unknown,
  timeZone: string,
  offsetAmount: number,
  offsetUnit: 'Minutes' | 'Hours' | 'Days'
): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value);
  let baseTime: Date | undefined;
  if (field?.dataType === 'Date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (match) {
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (date.toISOString().slice(0, 10) === raw) {
        baseTime = flowLocalDateTimeToInstant(date, 0, 0, timeZone);
      }
    }
  } else if (field?.dataType === 'DateTime') {
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
      const parsed = new Date(raw);
      if (Number.isFinite(parsed.getTime())) baseTime = parsed;
    } else {
      const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);
      if (match) {
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        if (date.toISOString().slice(0, 10) === raw.slice(0, 10)) {
          baseTime = flowLocalDateTimeToInstant(date, Number(match[4]), Number(match[5]), timeZone);
        }
      }
    }
  }
  if (!baseTime) throw new Error(`Scheduled path time source contains an invalid ${field?.dataType ?? 'date/time'} value.`);
  const unitMilliseconds = { Minutes: 60_000, Hours: 3_600_000, Days: 86_400_000 }[offsetUnit];
  const timestamp = baseTime.getTime() + offsetAmount * unitMilliseconds;
  if (!Number.isFinite(timestamp)) throw new Error('Scheduled path offset is outside the supported date range.');
  return new Date(Math.max(timestamp, Date.now()));
}

function createFlowInterview(flow: FlowMetadata, userId: string, result: Extract<FlowExecutionResult, { status: 'waiting' }>): FlowInterview {
  return buildFlowInterview(flow, userId, result, {
    getTenantIdForUser: (id) => getUsers().find(user => user.id === id)?.tenantId,
    tenantData
  });
}

function flowRetryDelayMs(attempt: number): number {
  return retryDelayMs(attempt);
}

 return { formulaContextForUser, scheduledPathTimestamp, createFlowInterview, flowRetryDelayMs };
}
