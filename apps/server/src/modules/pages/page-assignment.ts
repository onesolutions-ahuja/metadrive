/** Page activation is metadata, not one router/condition tree per application. */
type Assignment = {
  scope: string;
  appId?: string;
  profileId?: string;
  recordTypeId?: string;
  formFactors: string[];
};
type Page = {
  status: string;
  pageType: string;
  targetObject?: string | null;
  devices: string[];
  activationAssignments?: Assignment[];
};
type PageContext = {
  pageType: 'Home Page' | 'Record Page';
  objectApiName?: string;
  appId: string;
  recordTypeId?: string;
  profileId: string;
  formFactor: 'Desktop' | 'Phone';
};

/** Priority is defined once and evaluated against stored activation assignments. */
const rules = {
  'Record Page': [
    { scope: 'Org Default', fields: [] },
    { scope: 'App Default', fields: ['appId'] },
    { scope: 'App and Profile', fields: ['appId', 'profileId'] },
    { scope: 'App, Record Type, and Profile', fields: ['appId', 'recordTypeId', 'profileId'] }
  ],
  'Home Page': [
    { scope: 'App Default', fields: ['appId'] },
    { scope: 'App and Profile', fields: ['appId', 'profileId'] }
  ]
} as const;

export function resolvePageAssignment<T extends Page>(pages: readonly T[], context: PageContext): T | undefined {
  let best: T | undefined;
  let bestPriority = 0;
  for (const page of pages) {
    if (page.status !== 'Active' || page.pageType !== context.pageType || !page.devices.includes(context.formFactor)) continue;
    if (context.pageType === 'Record Page' && page.targetObject !== context.objectApiName) continue;
    for (const assignment of page.activationAssignments ?? []) {
      if (!assignment.formFactors.includes(context.formFactor)) continue;
      const ruleIndex = rules[context.pageType].findIndex(rule =>
        rule.scope === assignment.scope
        && rule.fields.every(field => assignment[field] === context[field]));
      if (ruleIndex < 0) continue;
      const priority = ruleIndex + 1;
      if (priority > bestPriority) {
        best = page;
        bestPriority = priority;
      }
    }
  }
  return best;
}
