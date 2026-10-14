// One-time snapshot hygiene. Does not change tenant records, objects, pages, or flows.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const path = 'apps/server/data/platform-state.json';
const original = JSON.parse(readFileSync(path, 'utf8'));
assert(Array.isArray(original.libraryComponents), 'Expected libraryComponents array');
const obsolete = original.libraryComponents.filter(item => /^(Kiosk|Till)/.test(item.apiName ?? ''));
const remaining = original.libraryComponents.filter(item => !/^(Kiosk|Till)/.test(item.apiName ?? ''));
assert(obsolete.length === 39, `Expected 39 retired components, found ${obsolete.length}`);
assert(remaining.every(item => !/^(Kiosk|Till)/.test(item.apiName ?? '')));
const cleaned = { ...original, libraryComponents: remaining };
assert.deepEqual(cleaned.tenants, original.tenants, 'Tenant metadata must remain unchanged');
assert.deepEqual(cleaned.users, original.users, 'Users must remain unchanged');
assert.deepEqual(cleaned.refreshSessions, original.refreshSessions, 'Sessions must remain unchanged');
assert.deepEqual(cleaned.revokedAccessTokens, original.revokedAccessTokens, 'Revocations must remain unchanged');
writeFileSync(path, JSON.stringify(cleaned, null, 2) + '\n');
console.log(`Removed ${obsolete.length} retired component snapshots; preserved ${remaining.length} others`);
