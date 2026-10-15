import type { Request, Response } from 'express';
import type { ObjectMetadata, ObjectMetadataChange, TenantData } from '../../index.js';

/** Shared optimistic-concurrency gate for metadata writes. */
export function metadataPrecondition(
  req: Request, res: Response, current: ObjectMetadata, metadataVersion: (value: ObjectMetadata) => number
): boolean {
  const supplied = req.header('if-match');
  if (supplied === undefined) return true;
  if (supplied !== `"${metadataVersion(current)}"`) {
    res.status(412).json({
      error: 'Metadata has changed since it was loaded; refresh before saving',
      expectedRevision: metadataVersion(current)
    });
    return false;
  }
  return true;
}

/** Build an immutable, bounded metadata audit revision; persistence stays injected. */
export function commitObjectMetadata(
  tenantId: string, actorUserId: string, updatedTenant: TenantData,
  action: ObjectMetadataChange['action'], before: ObjectMetadata | undefined,
  after: ObjectMetadata | undefined,
  metadataVersion: (value?: ObjectMetadata) => number,
  persistTenantRecords: (tenantId: string, next: TenantData) => void
): ObjectMetadata | undefined {
  const revision = Math.max(metadataVersion(before), metadataVersion(after)) + 1;
  const saved = after ? { ...after, revision } : undefined;
  const audit: ObjectMetadataChange = {
    objectApiName: (after ?? before)!.apiName,
    revision, action, actorUserId, at: new Date().toISOString(),
    ...(before ? { before: structuredClone(before) } : {}),
    ...(saved ? { after: structuredClone(saved) } : {})
  };
  persistTenantRecords(tenantId, {
    ...updatedTenant,
    objects: updatedTenant.objects.map((candidate) =>
      candidate.apiName === saved?.apiName ? saved : candidate),
    metadataHistory: [...(updatedTenant.metadataHistory ?? []), audit].slice(-300)
  });
  return saved;
}
