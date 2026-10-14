/** Metadata-driven Object Manager validation; rules are data, not repeated endpoint code. */
type ObjectLayoutMetadata = {
  pageLayoutAssignments?: Array<{ profileId: string }>;
  compactLayoutAssignments?: Array<{ profileId: string }>;
};
type Profile = { id: string };
const layoutAssignmentRules = [
  { key: 'pageLayoutAssignments', label: 'Page layout assignment' },
  { key: 'compactLayoutAssignments', label: 'Compact layout assignment' }
] as const;

export function validateObjectLayoutProfileAssignments(
  object: ObjectLayoutMetadata,
  profiles: readonly Profile[]
): string | null {
  const validProfiles = new Set(profiles.map(profile => profile.id));
  for (const rule of layoutAssignmentRules) {
    for (const assignment of object[rule.key] ?? []) {
      if (assignment.profileId !== '*' && !validProfiles.has(assignment.profileId)) {
        return `${rule.label} references unknown profile "${assignment.profileId}"`;
      }
    }
  }
  return null;
}

/** A page component declares which object feature it needs. */
const componentFeatureRequirements = {
  Activities: 'allowActivities',
  Chatter: 'allowInChatter',
  'Report Chart': 'allowReports'
} as const;

export function pageComponentFeatureEnabled(
  componentType: string,
  settings: { allowActivities?: boolean; allowInChatter?: boolean; allowReports?: boolean } | undefined
): boolean {
  const feature = componentFeatureRequirements[componentType as keyof typeof componentFeatureRequirements];
  return !feature || Boolean(settings?.[feature]);
}
