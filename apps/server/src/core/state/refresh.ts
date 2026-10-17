import { assertTenantIdentityIsolation } from '../../tenant-identity-isolation.mjs';
import type { PlatformState } from './types.js';
import type { createPlatformStateStore } from './store.js';

/** A SQL refresh may replace memory only if no local state or auth write raced it. */
export function createSqlStateRefresh(deps: {
  persistenceMode: string;
  store: ReturnType<typeof createPlatformStateStore>;
  authRevision: () => number;
  readPersistedState: () => Promise<unknown | null>;
  waitForPersistedState: () => Promise<unknown>;
  parsePersistedPlatformState: (raw: unknown) => PlatformState;
  restoreDurableAuthOverlay: (snapshot: PlatformState) => PlatformState;
  acknowledgeVerifiedSqlRefresh: () => void;
}) {
  return async (): Promise<boolean> => {
    if (deps.persistenceMode === 'jsonb') return true;
    const snapshotCommit = deps.store.latestCommit;
    const snapshotAuthRevision = deps.authRevision();
    const committed = await deps.readPersistedState();
    if (deps.store.latestCommit !== snapshotCommit || deps.authRevision() !== snapshotAuthRevision) {
      await deps.waitForPersistedState();
      return false;
    }
    if (committed === null) throw new Error('Scheduler requires a verified SQL snapshot');
    const restored = deps.restoreDurableAuthOverlay(deps.parsePersistedPlatformState(committed));
    assertTenantIdentityIsolation(restored);
    deps.store.state = restored;
    deps.acknowledgeVerifiedSqlRefresh();
    return true;
  };
}
