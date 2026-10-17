// Retired state-snapshot adapter. SQL access lives in the canonical system service.
// This module does not load JSON/JSONB state or register seeded metadata.
export { SqlPersistence } from './system-files/sql-persistence.js';
export type { SqlExecutor } from './system-files/sql-persistence.js';
