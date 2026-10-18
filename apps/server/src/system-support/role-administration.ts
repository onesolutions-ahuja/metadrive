import type { SqlPersistence } from '../system-files/sql-persistence.js';
import type { RbacEngine } from '../system-files/rbac-engine.js';

/** Central tenant-scoped role editor used by the SQL metadata endpoint. */
export class RoleAdministration {
  constructor(private readonly db: SqlPersistence, private readonly rbac: RbacEngine) {}
}
