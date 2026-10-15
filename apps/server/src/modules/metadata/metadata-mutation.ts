import {
  assertTenantResourceAccess, assertMetadataRevisionWrite,
  type TenantResourceContext
} from './backend-convergence.js';

/** Atomic metadata-write preflight; the injected SQL transaction must be the
 * only persistence path. Never infer permission from the application name.
 */
export function authoriseMetadataMutation(
  context: TenantResourceContext,
  expectedRevision: number, currentRevision: number
): number {
  assertTenantResourceAccess(context);
  const nextRevision = currentRevision + 1;
  assertMetadataRevisionWrite({ expectedRevision, currentRevision, nextRevision });
  return nextRevision;
}
