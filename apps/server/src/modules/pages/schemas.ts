import { z } from 'zod';
import { pageComponentSchema } from '../metadata/page-component-schema.js';
import { appNavigationEntrySchema } from '../../app-navigation-schema.js';

/** Published Pages and Navigation metadata; builders use the same validation. */
export const pageActivationAssignmentSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['Org Default', 'App Default', 'App and Profile', 'App, Record Type, and Profile']),
  appId: z.string().min(1).regex(/^[A-Za-z][A-Za-z0-9_]*$/).nullable(),
  profileId: z.string().min(1).nullable(),
  recordTypeId: z.string().min(1).nullable(),
  formFactors: z.array(z.enum(['Desktop', 'Phone'])).min(1)
}).superRefine((assignment, context) => {
  if (new Set(assignment.formFactors).size !== assignment.formFactors.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['formFactors'], message: 'Form factors must be unique' });
  }
  if (assignment.scope === 'Org Default' && (assignment.appId || assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Org Default assignments cannot target an app, profile, or record type' });
  }
  if (assignment.scope === 'App Default' && !assignment.appId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['appId'], message: 'App Default assignments require an app' });
  }
  if (assignment.scope === 'App Default' && (assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App Default assignments cannot target a profile or record type' });
  }
  if (assignment.scope === 'App and Profile' && (!assignment.appId || !assignment.profileId || assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App and Profile assignments require an app and profile, and cannot target a record type' });
  }
  if (assignment.scope === 'App, Record Type, and Profile' && (!assignment.appId || !assignment.profileId || !assignment.recordTypeId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'App, record type, and profile assignments require all three values' });
  }
});
export const lightningAppSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  installationAppKey: z.string().regex(/^[a-z0-9][a-z0-9-]{0,159}$/).optional(),
  navigationItems: z.array(z.string().min(1)).min(1),
  navigationPageApiNames: z.array(z.string().min(1)).default([]),
  navigationOrder: z.array(appNavigationEntrySchema).default([]),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0176d3'),
  utilityItems: z.array(z.enum(['Notes', 'History'])).default([])
}).superRefine((app, context) => {
  if (new Set(app.navigationItems).size !== app.navigationItems.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationItems'], message: 'Navigation items must be unique' });
  }
  if (new Set(app.navigationPageApiNames).size !== app.navigationPageApiNames.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationPageApiNames'], message: 'Navigation pages must be unique' });
  }
  const navigationKeys = app.navigationOrder.map((item) => `${item.type}:${item.apiName}`);
  if (new Set(navigationKeys).size !== navigationKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationOrder'], message: 'Navigation order entries must be unique' });
  }
  if (app.navigationOrder.length) {
    const expectedNavigationKeys = [
      ...app.navigationItems.map((apiName) => `Object:${apiName}`),
      ...app.navigationPageApiNames.map((apiName) => `App Page:${apiName}`)
    ].sort();
    if (navigationKeys.some((key) => !expectedNavigationKeys.includes(key))
      || navigationKeys.length !== expectedNavigationKeys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['navigationOrder'], message: 'Navigation order must include every selected item exactly once' });
    }
  }
  if (new Set(app.utilityItems).size !== app.utilityItems.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['utilityItems'], message: 'Utility items must be unique' });
  }
});
export const pageTemplateSchema = z.enum(['one-region', 'header-main', 'main-sidebar', 'header-main-sidebar']);
export const pageTemplateRegions: Record<z.infer<typeof pageTemplateSchema>, string[]> = {
  'one-region': ['main'],
  'header-main': ['header', 'main'],
  'main-sidebar': ['main', 'sidebar'],
  'header-main-sidebar': ['header', 'main', 'sidebar']
};
export function createPageSchema(persistedMetadataReadMode?: { readonly active: boolean }) {
return z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  updatedAt: z.string().datetime().optional(),
  targetObject: z.string(),
  pageType: z.enum(['Record Page', 'App Page', 'Home Page']),
  layoutMode: z.enum(['template', 'free-canvas']).default('template'),
  template: pageTemplateSchema.default('one-region'),
  canvasWidth: z.number().int().min(320).max(7680).default(1920),
  canvasHeight: z.number().int().min(320).max(7680).default(1080),
  status: z.enum(['Draft', 'Active']),
  devices: z.array(z.enum(['Desktop', 'Phone'])).min(1),
  components: z.array(pageComponentSchema.extend({
    region: z.enum(['header', 'main', 'sidebar', 'footer']).default('main'),
    position: z.object({
      x: z.number().int().min(0).max(7680),
      y: z.number().int().min(0).max(7680),
      width: z.number().int().min(1).max(7680),
      height: z.number().int().min(1).max(7680)
    }).optional()
  })),
  activationAssignments: z.array(pageActivationAssignmentSchema).optional(),
  scope: z.enum(['tenant','platform-system']).optional(), ownerNamespace: z.string().max(128).optional(),
  definitionVersion: z.number().int().positive().optional(), overridePolicy: z.enum(['presentation-only','none']).optional(),
  requiredPermissions: z.array(z.string().min(1)).optional()
}).superRefine((page, context) => {
  const ids = page.components.map((component) => component.id); if (page.pageType === 'Record Page' && !page.targetObject.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetObject'], message: 'Record Pages require a target object' });
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: 'Component IDs must be unique' });
  page.components.forEach((component, index) => {
    if (page.layoutMode === 'template' && !pageTemplateRegions[page.template].includes(component.region)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'region'], message: 'Component region must exist in the selected page template' });
    }
    if (page.layoutMode === 'free-canvas') {
      const position = component.position;
      if (!position) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'position'], message: 'Free Canvas components require a position and size' });
      } else if (position.x + position.width > page.canvasWidth || position.y + position.height > page.canvasHeight) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'position'], message: 'Component position and size must fit inside the Free Canvas' });
      }
      if (!component.type.startsWith('Custom:')) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'Free Canvas supports custom library components' });
      }
    }
    if (['Field Section', 'Record Field'].includes(component.type)
      && (page.pageType !== 'Record Page' || page.layoutMode !== 'template')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'Dynamic Forms components are only available on template-based Record Pages' });
    }
    if (page.pageType !== 'Record Page'
      && !['Accordion', 'Tabs', 'Report Chart', 'Dashboard'].includes(component.type)
      && !component.type.startsWith('Custom:')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['components', index, 'type'], message: 'This component is only available on Record Pages' });
    }
  });
  const assignments = page.activationAssignments ?? [];
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (new Set(assignmentIds).size !== assignmentIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments'], message: 'Activation assignment IDs must be unique' });
  assignments.forEach((assignment, index) => {
    if (page.pageType !== 'Record Page' && assignment.scope === 'App, Record Type, and Profile') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Record type activation assignments are only valid on Record Pages' });
    }
    if (page.pageType === 'Home Page' && assignment.scope === 'Org Default') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Home Pages must be assigned to an app or app and profile' });
    }
    if (page.pageType === 'App Page' && !persistedMetadataReadMode?.active) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'App Pages are added to app navigation instead of using activation assignments' });
    }
    for (const other of assignments.slice(index + 1)) {
      if (assignment.scope === other.scope
        && assignment.appId === other.appId
        && assignment.profileId === other.profileId
        && assignment.recordTypeId === other.recordTypeId
        && assignment.formFactors.some((formFactor) => other.formFactors.includes(formFactor))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['activationAssignments', index], message: 'Activation assignments cannot overlap for the same target and form factor' });
        break;
      }
    }
  });
});
}

export const pageSchema = createPageSchema();
