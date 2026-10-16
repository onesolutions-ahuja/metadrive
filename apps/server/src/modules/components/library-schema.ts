import { z } from 'zod';

export const libraryComponentResizeSchema = z.object({
  defaultWidth: z.number().int().min(80).max(2000),
  defaultHeight: z.number().int().min(40).max(2000),
  minWidth: z.number().int().min(40).max(2000),
  minHeight: z.number().int().min(30).max(2000)
}).superRefine((resize, context) => {
  if (resize.minWidth > resize.defaultWidth) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minWidth'], message: 'Minimum width cannot exceed the default width' });
  }
  if (resize.minHeight > resize.defaultHeight) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minHeight'], message: 'Minimum height cannot exceed the default height' });
  }
});
export const defaultLibraryComponentResize = { defaultWidth: 320, defaultHeight: 180, minWidth: 120, minHeight: 60 };
export const propertyDefinitionSchema = z.object({propertyKey:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),label:z.string().min(1).max(100),kind:z.enum(['TEXT','NUMBER','BOOLEAN','COLOR','IMAGE','SELECT','OBJECT_FIELD','FLOW','CURRENCY']),required:z.boolean().optional(),isBindable:z.boolean().optional(),displayOrder:z.number().int().optional(),defaultValue:z.union([z.string(),z.number(),z.boolean()]).optional(),choices:z.array(z.object({key:z.string().min(1),label:z.string().min(1)})).max(200).optional()}); const libraryComponentRevisionSchema = z.object({
  version: z.number().int().positive(), label: z.string().trim().min(1).max(80),
  description: z.string().max(500), surfaces: z.array(z.enum(['page','dashboard','flow','platform'])).min(1),
  resize: libraryComponentResizeSchema, jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000), compiledJs: z.string().min(1).max(500_000),
  scopedCss: z.string().max(150_000), updatedAt: z.string().datetime(), propertyDefinitions:z.array(propertyDefinitionSchema).max(200).optional()
});
export const libraryComponentSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500),
  surfaces: z.array(z.enum(['page', 'dashboard', 'flow', 'platform'])).min(1),
  resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
  jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000),
  compiledJs: z.string().min(1).max(500_000),
  scopedCss: z.string().max(150_000),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  status: z.enum(['Draft','Published']).optional(),
  publishedVersion: z.number().int().nonnegative().optional(),
  revisions: z.array(libraryComponentRevisionSchema).max(100).optional(),
  pendingDraft: libraryComponentRevisionSchema.optional(),
  trustedBundled: z.boolean().optional(),
  scope: z.literal('platform-system').optional(),
  tenantId: z.string().min(1).optional(), propertyDefinitions:z.array(propertyDefinitionSchema).max(200).optional()
}).superRefine((component, context) => {
  if (new Set(component.surfaces).size !== component.surfaces.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['surfaces'], message: 'Component surfaces must be unique' });
  }
  if ((component.scope === 'platform-system' || component.surfaces.includes('platform'))
    && !(component.scope === 'platform-system' && component.trustedBundled === true && component.tenantId === undefined))
    context.addIssue({code:z.ZodIssueCode.custom,path:['scope'],message:'Platform metadata requires unowned trusted bundle'});
});
export const libraryComponentInputSchema = z.object({
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  surfaces: z.array(z.enum(['page', 'dashboard', 'flow'])).min(1),
  resize: libraryComponentResizeSchema.default(defaultLibraryComponentResize),
  jsxSource: z.string().min(1).max(200_000),
  cssSource: z.string().max(100_000).default(''),
  publicationStatus: z.enum(['Draft','Published']).default('Published'), propertyDefinitions:z.array(propertyDefinitionSchema).max(200).optional()
}).superRefine((component, context) => {
  if (new Set(component.surfaces).size !== component.surfaces.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['surfaces'], message: 'Component surfaces must be unique' });
  }
});
export type LibraryComponent = z.infer<typeof libraryComponentSchema>;
export type LibraryComponentRevision = z.infer<typeof libraryComponentRevisionSchema>;
