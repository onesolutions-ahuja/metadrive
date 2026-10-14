/** Shared metadata-driven record action checks and audit stamps. */
type ActionObject = {
  actions?: readonly {type: string;label: string;enabled: boolean}[];
  listViewButtons?: readonly string[];
  recordTypes?: readonly {id:string;active:boolean;isDefault?:boolean}[];
  pageLayoutAssignments?: readonly {profileId:string;recordTypeId:string;pageLayoutId:string}[];
  pageLayouts?: readonly {id:string;actions:readonly string[]}[];
};
export function stampRecordAuditFields<T extends Record<string, unknown>>(record: T, userId: string, timestamp: string, previous?: T): T {
  return {
    ...record,
    CreatedById: previous?.CreatedById ?? userId,
    LastModifiedById: userId,
    SystemModstamp: timestamp
  } as T;
}

export function recordActionEnabled(object: ActionObject, action: 'New' | 'Edit' | 'Delete', recordTypeId?: string, profileId?: string): boolean {
  if (object.actions && !object.actions.some((item) => item.type === 'Standard' && item.label === action && item.enabled)) return false;
  if (action === 'New' && object.listViewButtons && !object.listViewButtons.includes('New')) return false;
  const selectedRecordTypeId = recordTypeId
    ?? object.recordTypes?.find((item) => item.active && item.isDefault)?.id
    ?? object.recordTypes?.find((item) => item.active)?.id;
  const assignments = object.pageLayoutAssignments ?? [];
  const assignment = assignments.find((item) => item.profileId === profileId && item.recordTypeId === selectedRecordTypeId)
    ?? assignments.find((item) => item.profileId === '*' && item.recordTypeId === selectedRecordTypeId);
  const layout = object.pageLayouts?.find((item) => item.id === assignment?.pageLayoutId) ?? object.pageLayouts?.[0];
  return !layout || layout.actions.includes(action);
}

