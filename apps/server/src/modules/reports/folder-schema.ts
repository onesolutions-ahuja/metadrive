import { z } from 'zod';
import { dashboardFolderShareSchema } from '../dashboards/schemas.js';

/** Shared Report folder schema; preserves existing sharing validation. */
export const reportFolderSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable(),
  ownerUserId: z.string().min(1),
  shares: z.array(dashboardFolderShareSchema).default([]),
  visibility: z.enum(['Private', 'All Users']).default('Private'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((folder, context) => {
  const shareKeys = folder.shares.map((share) => `${share.targetType}:${share.targetId}`);
  if (new Set(shareKeys).size !== shareKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['shares'], message: 'Folder access targets must be unique' });
  }
});
export type ReportFolder = z.infer<typeof reportFolderSchema>;

