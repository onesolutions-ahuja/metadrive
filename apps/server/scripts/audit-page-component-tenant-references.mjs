#!/usr/bin/env node
/**
 * Tenant-scoped, read-only inventory of component references stored in SQL.
 * Never exports business records or component property values.
 * No component replacement is attempted without a separately approved mapping.
 */
import { pathToFileURL } from 'node:url';

export function inventoryPageComponentReferences(rows) {
  const counts = new Map();
  for (const row of rows) {
    const tenantId = String(row.tenant_id ?? '');
    const collection = String(row.collection_name ?? '');
    if (!['pages', 'dashboards', 'flows'].includes(collection)) continue;
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const seen = new Set();
    const walk = (node, depth = 0) => {
      if (depth > 60 || !node || typeof node !== 'object') return;
      if (seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const child of node) walk(child, depth + 1);
        return;
      }
      let apiName;
      let surface;
      if (collection === 'pages' && typeof node.type === 'string' && node.type.startsWith('Custom:')) {
        apiName = node.type.slice(7);
        surface = 'page';
      } else if (collection === 'dashboards' && node.type === 'Custom') {
        apiName = node.customComponentApiName;
        surface = 'dashboard';
      } else if (collection === 'flows' && node.type === 'Custom Component') {
        apiName = node.componentApiName;
        surface = 'flow';
      }
      if (typeof apiName === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)) {
        const key = JSON.stringify([tenantId, surface, apiName]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, child] of Object.entries(node)) {
        if (['properties','records','credentials','sourceJsx','sourceCss','compiledJs'].includes(key)) continue;
        walk(child, depth + 1);
      }
    };
    walk(payload);
  }
  return [...counts].map(([key, references]) => {
    const [tenantId, surface, apiName] = JSON.parse(key);
    return {tenantId, surface, apiName, references};
  }).sort((a, b) => a.tenantId.localeCompare(b.tenantId) || a.surface.localeCompare(b.surface) || a.apiName.localeCompare(b.apiName));
}

/** Explicitly refuse conversion unless compatibility approval was independently recorded. */
export function assertSafeReplacement(approval, reference) {
  if (!approval || approval.tenantId !== reference.tenantId ||
      approval.from !== reference.apiName || !/^One[A-Za-z0-9]+$/.test(approval.to ?? '') ||
      approval.parityVerified !== true || approval.metadataSnapshotVerified !== true ||
      approval.draftPublishRollbackVerified !== true || approval.tenantApproved !== true) {
    throw new Error('Unsafe migration refused: explicit tenant approval, parity, snapshot and rollback evidence required');
  }
  return approval.to;
}

async function main() {
  if (process.argv.includes('--apply')) throw new Error('Read-only audit: applying mutations is prohibited');
  const tenantIndex = process.argv.indexOf('--tenant');
  const tenantId = tenantIndex < 0 ? '' : process.argv[tenantIndex + 1];
  if (!tenantId) throw new Error('Required: --tenant <tenant-id>; no cross-tenant scan permitted');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const { default: pg } = await import('pg');
  const client = new pg.Client({connectionString: url});
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query(
      "SELECT tenant_id, collection_name, payload FROM metadrive_rel_tenant_collection_items WHERE tenant_id = $1 AND collection_name = ANY($2::text[])",
      [tenantId, ['pages','dashboards','flows']]
    );
    const report = inventoryPageComponentReferences(result.rows);
    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({mode:'read-only',tenantId,collections:['pages','dashboards','flows'],references:report},null,2) + '\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
