import { z } from 'zod';
import type { Principal } from '../../auth.js';

import type { RuntimeRecord, ObjectMetadata } from '../../index.js';
import { reportCrossFilterSchema, reportFilterSchema } from './report-metadata.js';

export function createReportCrossFilterResolver(deps: {
 hasObjectPermission: typeof import('../../index.js')['hasObjectPermission'];
 hasFieldPermission: typeof import('../../index.js')['hasFieldPermission'];
 hasRecordAccess: typeof import('../../index.js')['hasRecordAccess'];
 calculateFormulaFields: typeof import('../../index.js')['calculateFormulaFields'];
 formulaContextForUser: typeof import('../../index.js')['formulaContextForUser'];
}) {
 const {hasObjectPermission,hasFieldPermission,hasRecordAccess,calculateFormulaFields,formulaContextForUser}=deps;
type ReportCrossFilterResolution =
  | { matchesRecord: (record: RuntimeRecord) => boolean }
  | { error: string; status: 400 | 403 };

function resolveReportCrossFilters(
  principal: Principal,
  tenant: TenantData,
  parentObject: ObjectMetadata,
  crossFilters: z.infer<typeof reportCrossFilterSchema>[],
  matchesFilter: (record: RuntimeRecord, filter: z.infer<typeof reportFilterSchema>) => boolean
): ReportCrossFilterResolution {
  const configured: Array<{
    mode: 'With' | 'Without';
    childRecords: RuntimeRecord[];
    relationshipFieldApiName: string;
    filters: z.infer<typeof reportFilterSchema>[];
  }> = [];
  for (const crossFilter of crossFilters) {
    const childObject = tenant.objects.find((item) => item.apiName === crossFilter.childObjectApiName);
    const relationshipField = childObject?.fields.find((field) =>
      field.relationship?.targetObject === parentObject.apiName);
    if (!childObject || !relationshipField) {
      return { error: `Cross-filter object "${crossFilter.childObjectApiName}" is not a child of "${parentObject.apiName}"`, status: 400 };
    }
    if (!hasObjectPermission(principal, tenant, childObject.apiName, 'read')) {
      return { error: `Missing read permission for cross-filter object "${childObject.apiName}"`, status: 403 };
    }
    if (!hasFieldPermission(principal, tenant, childObject.apiName, relationshipField.apiName, 'read')) {
      return { error: `Missing read permission for relationship field "${childObject.apiName}.${relationshipField.apiName}"`, status: 403 };
    }
    for (const filter of crossFilter.filters) {
      if (!childObject.fields.some((field) => field.apiName === filter.fieldApiName)) {
        return { error: `Cross-filter field "${filter.fieldApiName}" is unavailable on "${childObject.apiName}"`, status: 400 };
      }
      if (!hasFieldPermission(principal, tenant, childObject.apiName, filter.fieldApiName, 'read')) {
        return { error: `Missing read permission for cross-filter field "${childObject.apiName}.${filter.fieldApiName}"`, status: 403 };
      }
    }
    configured.push({
      mode: crossFilter.mode,
      relationshipFieldApiName: relationshipField.apiName,
      filters: crossFilter.filters,
      childRecords: (tenant.records[childObject.apiName] ?? []).filter((record) =>
        hasRecordAccess(principal, tenant, childObject.apiName, record, 'Read'))
        .map((record) => calculateFormulaFields(childObject, record, formulaContextForUser(tenant, principal.userId)))
    });
  }
  return {
    matchesRecord: (record) => configured.every((crossFilter) => {
      const hasMatchingChild = crossFilter.childRecords.some((childRecord) =>
        String(childRecord[crossFilter.relationshipFieldApiName] ?? '') === record.Id
        && crossFilter.filters.every((filter) => matchesFilter(childRecord, filter)));
      return crossFilter.mode === 'With' ? hasMatchingChild : !hasMatchingChild;
    })
  };
}

return resolveReportCrossFilters;
}
