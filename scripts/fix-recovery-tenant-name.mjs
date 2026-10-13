import { readFileSync, writeFileSync } from 'node:fs';
const f='apps/server/src/index.ts';let s=readFileSync(f,'utf8');
const old="  return (tenant as unknown as { name?: string }).name || tenantId;";
const replacement="  return state.tenantRegistry[tenantId]?.name ?? tenantId;";
if(s.split(old).length!==2)throw Error('Missing tenant registry name binding');
writeFileSync(f,s.replace(old,replacement));
console.log('Recovery template Tenant.Name resolved from tenant-scoped registry');
