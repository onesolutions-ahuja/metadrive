import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
test('AceKiosk menu metadata stays tenant scoped, user context, idempotent and Flow-driven',()=>{
 const s=readFileSync(new URL('../../src/app-seeders/acekiosk-menu-flow.ts',import.meta.url),'utf8');
 assert.match(s,/md_app_installations/);
 assert.match(s,/md_app_entitlements/);
 assert.match(s,/if\(existing\.rowCount\)return false/);
 assert.match(s,/Get Records/);
 assert.match(s,/kind:'normal'/);
 assert.match(s,/executionContext:'User'/);
 assert.doesNotMatch(s,/INSERT INTO md_records|INSERT INTO md_permission_assignments/);
});

test('AceKiosk modifier Flow is tenant-scoped and only uses existing meal metadata',()=>{
 const source=readFileSync(new URL('../../src/app-seeders/acekiosk-menu-flow.ts',import.meta.url),'utf8');
 assert.match(source,/seedAceKioskProductOptions/);
 assert.match(source,/MealChoiceGroup/);
 assert.match(source,/MealChoiceOption/);
 assert.match(source,/appApiName:'AceKiosk'/);
 assert.match(source,/availableForOutput:true/);
 assert.doesNotMatch(source,/INSERT INTO md_records|INSERT INTO md_permission_assignments/);
});
