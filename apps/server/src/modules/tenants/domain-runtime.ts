import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import type { Request, Response } from 'express';
import type { Principal } from '../../auth.js';
import type { PlatformState, TenantRegistryEntry, TenantDomainRecord, TenantManagementAuditEvent } from '../../core/state/types.js';
import { normalizeTenantDomain, domainChallenge, matchesDomainChallenge, reservedDomain } from '../../tenant-domains.mjs';

/** Single tenant-domain lifecycle, DNS verification and failure-safe SQL updates. */
export function createTenantDomainRuntime(deps: {
 getState: () => PlatformState;
 getLatestCommit: () => Promise<unknown>;
 isProvisioningPending: (tenantId: string) => boolean;
 getPrincipal: (res: Response) => Principal;
 routeParam: (req: Request, name: string) => string;
 tenantRegistryEntry: (tenantId: string) => TenantRegistryEntry;
 commitTenantChange: (actorId: string, tenantId: string, action: TenantManagementAuditEvent['action'], updated: TenantRegistryEntry, previous: TenantRegistryEntry) => void;
 webOrigins: Set<string>;
}) {
 const {getState, getLatestCommit, isProvisioningPending, getPrincipal, routeParam,
 tenantRegistryEntry, commitTenantChange, webOrigins} = deps;
const addTenantDomainSchema = z.object({ hostname: z.string().min(4).max(253) }).strict();
const domainCheckInFlight = new Set<string>();
const domainCheckLastAttempt = new Map<string, number>();
let domainCommitUncertain = false;
function domainContext(req: Request, res: Response, platform: boolean): string | undefined {
  const tenantId = platform ? routeParam(req, 'tenantId') : getPrincipal(res).tenantId;
  return Object.hasOwn(getState().tenants, tenantId) && !isProvisioningPending(tenantId)
    ? tenantId : undefined;
}
function checkedDomain(hostname: string): string | null {
  try { return normalizeTenantDomain(hostname); } catch { return null; }
}
function domainResponse(record: TenantDomainRecord) {
  return { ...record, verification: domainChallenge(record.hostname, record.verificationToken),
    hosting: 'Attach this hostname to the HTTPS application service and complete provider TLS validation separately.' };
}
async function saveDomainChange(actorId: string, tenantId: string,
  action: TenantManagementAuditEvent['action'], updated: TenantRegistryEntry, previous: TenantRegistryEntry) {
  if (domainCommitUncertain) throw new Error('Previous domain persistence is uncertain; restart and reconcile');
  commitTenantChange(actorId, tenantId, action, updated, previous);
  const committed = getLatestCommit();
  try { await committed; } catch {
    domainCommitUncertain = true;
    throw new Error('Domain change persistence failed; restart and reconcile before further writes');
  }
}
function listTenantDomains(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  return res.json({ domains: (tenantRegistryEntry(tenantId).domains ?? [])
    .filter((item) => item.status !== 'REVOKED').map(domainResponse) });
}
async function addTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const parsed = addTenantDomainSchema.safeParse(req.body);
  const hostname = parsed.success ? checkedDomain(parsed.data.hostname) : null;
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  if (reservedDomain(hostname, webOrigins))
    return res.status(409).json({ error: 'Platform-owned hostnames cannot be registered to tenants' });
  if (Object.values(getState().tenantRegistry).some((entry) =>
    entry.domains?.some((domain) => domain.hostname === hostname && domain.status !== 'REVOKED')))
    return res.status(409).json({ error: 'Domain is already registered' });
  const previous = tenantRegistryEntry(tenantId);
  if ((previous.domains ?? []).filter((item) => item.status !== 'REVOKED').length >= 5)
    return res.status(409).json({ error: 'Maximum five active domains per tenant' });
  if ((previous.domains?.length ?? 0) >= 5000)
    return res.status(409).json({ error: 'Domain registration history requires archival' });
  const now = new Date().toISOString();
  const domain: TenantDomainRecord = {
    hostname, status: 'PENDING', verificationToken: randomBytes(32).toString('hex'), createdAt: now
  };
  const updated: TenantRegistryEntry = {
    ...previous, updatedAt: now,
    domains: [...(previous.domains ?? []).filter((item) => item.hostname !== hostname), domain]
  };
  try {
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_ADDED', updated, previous);
    return res.status(201).json({ domain: domainResponse(domain) });
  } catch { return res.status(503).json({ error: 'Unable to persist tenant domain' }); }
}
async function verifyTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const hostname = checkedDomain(routeParam(req, 'hostname'));
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  const current = tenantRegistryEntry(tenantId).domains?.find((item) => item.hostname === hostname && item.status !== 'REVOKED');
  if (!current) return res.status(404).json({ error: 'Domain does not belong to this tenant' });
  if (current.status === 'VERIFIED') return res.json({ domain: domainResponse(current) });
  const lock = tenantId + ':' + hostname;
  const nowMs = Date.now();
  if (domainCheckInFlight.has(lock) || nowMs - (domainCheckLastAttempt.get(lock) ?? 0) < 30_000)
    return res.status(429).json({ error: 'DNS verification may be retried after 30 seconds' });
  domainCheckInFlight.add(lock);
  domainCheckLastAttempt.set(lock, nowMs);
  if (domainCheckLastAttempt.size > 1000)
    for (const [key, at] of domainCheckLastAttempt)
      if (nowMs - at > 60_000) domainCheckLastAttempt.delete(key);
  try {
    const proof = domainChallenge(hostname, current.verificationToken);
    let txt: string[][];
    try { txt = await resolveTxt(proof.host); }
    catch { return res.status(409).json({ error: 'DNS TXT record is not available yet', verification: proof }); }
    if (!matchesDomainChallenge(txt, proof.value))
      return res.status(409).json({ error: 'DNS TXT ownership proof does not match', verification: proof });
    // DNS await can interleave with a domain deletion/re-registration.
    const previous = tenantRegistryEntry(tenantId);
    const latest = previous.domains?.find((item) => item.hostname === hostname && item.status !== 'REVOKED');
    if (!latest || latest.verificationToken !== current.verificationToken)
      return res.status(409).json({ error: 'Domain registration changed while verifying; retry' });
    if (latest.status === 'VERIFIED') return res.json({ domain: domainResponse(latest) });
    const now = new Date().toISOString();
    const verified: TenantDomainRecord = { ...latest, status: 'VERIFIED', verifiedAt: now };
    const updated: TenantRegistryEntry = {
      ...previous, updatedAt: now,
      domains: previous.domains!.map((item) => item.hostname === hostname ? verified : item)
    };
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_VERIFIED', updated, previous);
    return res.json({ domain: domainResponse(verified) });
  } catch { return res.status(503).json({ error: 'Unable to persist domain verification' }); }
  finally { domainCheckInFlight.delete(lock); }
}
async function removeTenantDomain(req: Request, res: Response, platform: boolean) {
  const tenantId = domainContext(req, res, platform);
  if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });
  if (domainCommitUncertain) return res.status(503).json({ error: 'Domain persistence requires reconciliation' });
  const hostname = checkedDomain(routeParam(req, 'hostname'));
  if (!hostname) return res.status(400).json({ error: 'Invalid DNS hostname' });
  const previous = tenantRegistryEntry(tenantId);
  if (!previous.domains?.some((record) => record.hostname === hostname && record.status !== 'REVOKED'))
    return res.status(404).json({ error: 'Domain does not belong to this tenant' });
  const updated: TenantRegistryEntry = {
    ...previous, updatedAt: new Date().toISOString(),
    domains: previous.domains.map((item) => item.hostname === hostname
      ? { ...item, status: 'REVOKED' as const, revokedAt: new Date().toISOString() } : item)
  };
  try {
    await saveDomainChange(getPrincipal(res).userId, tenantId, 'DOMAIN_REMOVED', updated, previous);
    return res.json({ removed: true, hostname });
  } catch { return res.status(503).json({ error: 'Unable to remove tenant domain' }); }
}

 return { listTenantDomains, addTenantDomain, verifyTenantDomain, removeTenantDomain };
}
