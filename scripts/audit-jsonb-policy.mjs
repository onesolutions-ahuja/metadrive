import fs from 'node:fs';
import path from 'node:path';

/**
 * Guard the explicitly approved component-property JSONB exception.
 * Existing legacy columns are frozen migration debt; this guard rejects any
 * new non-component JSONB column before the full data-safe cutover.
 */
const approved = new Set([
  'md_component_properties.properties',
  'md_component_properties.value_jsonb',
  'md_page_component_properties.properties',
  'md_page_component_properties.value_jsonb'
]);
const legacyDebt = new Set([
  'md_system_definitions.properties',
  'md_tenant_settings.properties',
  'md_password_recovery_settings.policy',
  'md_security_events.details'
]);
const sqlFiles = ['apps/server/src/system-files/schema.sql'];
const migrations = 'apps/server/src/system-support/migrations';
for (const entry of fs.readdirSync(migrations)) {
  if (entry.endsWith('.sql')) sqlFiles.push(path.join(migrations, entry));
}
const found = new Set();
const violations = [];
for (const file of sqlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  // Each DDL statement is inspected independently. String literals and SQL
  // expressions (e.g. jsonb_build_object) do not declare JSONB columns.
  for (const statement of source.split(';')) {
    const match = statement.match(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(md_[a-z0-9_]+)\s*\(/i);
    if (!match) continue;
    const table = match[1].toLowerCase();
    for (const column of statement.matchAll(/(?:^|[,(]\s*|\n\s*)([a-z_][a-z0-9_]*)\s+jsonb\b/gi)) {
      const key = table + '.' + column[1].toLowerCase();
      found.add(key);
      if (!approved.has(key) && !legacyDebt.has(key)) violations.push(file + ': ' + key);
    }
  }
  // ALTER ADD COLUMN declarations may be introduced in later migrations.
  for (const match of source.matchAll(/\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(md_[a-z0-9_]+)\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s+jsonb\b/gi)) {
    const key = match[1].toLowerCase() + '.' + match[2].toLowerCase();
    found.add(key);
    if (!approved.has(key) && !legacyDebt.has(key)) violations.push(file + ': ' + key);
  }
}
if (violations.length) {
  console.error('Unapproved JSONB columns (only component properties are exempt):\n' + [...new Set(violations)].join('\n'));
  process.exitCode = 1;
}
const debt = [...legacyDebt].filter(x => found.has(x));
console.log('Existing non-component JSONB migration debt: ' + (debt.join(', ') || 'none'));
if (!violations.length) console.log('JSONB policy: no newly introduced non-component columns.');
