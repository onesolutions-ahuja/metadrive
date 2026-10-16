import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { assertTenantIdentityIsolation } from '../../tenant-identity-isolation.mjs';
import { localStateWithoutSqlObjectDefinitions } from '../../local-platform-seed.js';
import type { PlatformState } from './types.js';

/** One live state reference and commit barrier shared by HTTP and scheduler writers. */
export function createPlatformStateStore(options: {
  maintenance: boolean;
  persistenceMode: string;
  dataPath: string;
  persistToPostgres: (next: PlatformState, serialized?: string) => Promise<unknown>;
}) {
  let state: PlatformState | undefined;
  let latestCommit: Promise<unknown> = Promise.resolve();

  function persistState(next: PlatformState): void {
    if (options.maintenance) throw new Error('Database writes disabled during maintenance');
    assertTenantIdentityIsolation(next);
    const serialized = JSON.stringify(options.persistenceMode === 'jsonb' ? { ...next, refreshSessions: [] } : next);
    const localSerialized = JSON.stringify(localStateWithoutSqlObjectDefinitions({ ...next, refreshSessions: [] }));
    if (options.persistenceMode !== 'typed') {
      mkdirSync(dirname(options.dataPath), { recursive: true });
      const temporaryPath = `${options.dataPath}.tmp`;
      writeFileSync(temporaryPath, localSerialized, { encoding: 'utf8', mode: 0o600 });
      renameSync(temporaryPath, options.dataPath);
    }
    latestCommit = options.persistToPostgres(next, serialized);
    void latestCommit.catch((error: unknown) => {
      console.error('CRITICAL: MetaDrive state commit failed', error);
    });
  }

  return {
    get state(): PlatformState {
      if (!state) throw new Error('Platform state has not been initialized');
      return state;
    },
    set state(next: PlatformState) { state = next; },
    get latestCommit() { return latestCommit; },
    set latestCommit(next: Promise<unknown>) { latestCommit = next; },
    persistState
  };
}
