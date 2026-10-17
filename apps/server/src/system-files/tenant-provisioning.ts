import type { SqlPersistence } from './sql-persistence.js';
export class TenantProvisioning {
  constructor(private readonly db:SqlPersistence) {}
  async provision(slug:string,name:string) {
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid tenant slug');
    return this.db.transaction(async client=>{
      const {rows}=await client.query<{id:string}>(
        'INSERT INTO md_tenants (slug,name) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',[slug,name]);
      return rows[0].id;
    });
  }
}
