# MetaDrive platform foundation — architecture and verification

Updated: 2026-10-12. This describes the observed repository foundation, not an assertion of successful production E2E testing.

## Runtime map

```text
Browser (React 18 + Vite, apps/web)
  | /api via Vite development proxy, or VITE_API_BASE_URL in deployed frontend
  v
Express/TypeScript API (apps/server/src/index.ts; compiled apps/server/dist/index.js)
  | authenticated tenant-scoped routes; access / refresh session handling
  v
Aiven PostgreSQL (pg driver, configured through backend environment)
  |
  +-- tenant metadata, records, credentials, flows and runtime persistence
```

The root npm workspace owns `apps/web` and `apps/server`. The web build uses `tsc -b && vite build`; the server build compiles TypeScript, copies runtime assets, and builds the web workspace. `npm run build` builds both workspaces. `npm run start:server` starts the compiled backend; `npm run dev:web` and `npm run dev:server` start the development processes. The Node.js version, API base URL, DB TLS/CA, cookie origin and signing keys must be set explicitly for the target deployment; do not substitute local development defaults in production.

## Trust boundaries

- Browser session credentials are not database credentials. The backend validates authenticated user and tenant scope before data access.
- Named Credential secrets are tenant-scoped and must never be exposed in browser payloads or startup diagnostics.
- Tenant-provided configuration must not grant platform-only privileges; licence/platform policy remains separate from tenant RBAC.
- No recovery operator may obtain a tenant password or silently impersonate a tenant user.
- Aiven TLS/CA validation must remain enabled, including during backup/cutover.
- Web and API may be on different origins. Cookies, proxying, allowed origins and CSRF strategy must be reviewed together.

## Runtime dependency inventory

| Dependency | Repository evidence | State |
| --- | --- | --- |
| React SPA | `apps/web/package.json` | Implemented |
| Express API | `apps/server/package.json` | Implemented |
| PostgreSQL client | `pg` in server dependencies | Implemented |
| Auth token support | `jose` in server dependencies | Implemented |
| Flow runtime | Server source and test suite | Implemented in part; separate Flow acceptance checks apply |
| Native scheduled-flow dispatcher | `dispatchScheduledFlows()` in `apps/server/src/index.ts`, backed by persisted tenant state | **Selected architecture; restart and failure recovery E2E must be proven** |
| Production E2E validation | Requires deployed deployment, credentials and Aiven endpoint | **Not established by repository inspection** |

**Architecture decision (2026-10-12):** retain MetaDrive's own PostgreSQL-backed scheduling and Flow runtime. Temporal is explicitly removed from Module 1 scope by user choice. No Temporal Cloud namespace or additional hosting should be provisioned. Functional acceptance requires at-most-once concurrent dispatch, tenant isolation, durable resume across API restarts, bounded retry/failure reporting and consistency on transient database failures.

## Reproducible foundation checks

1. From a fresh checkout, run `npm ci`.
2. Run `npm run build`. Check both web and API outputs are generated.
3. Run `npm run test --workspace apps/server` for the existing backend regression suite.
4. Configure a disposable isolated Aiven tenant and valid production-like TLS chain. Start the compiled backend via `npm run start:server`, and the built web app via `npm run start:web` (or the actual static host).
5. Test unauthenticated denial, valid sign-in, cookie refresh, deep-link reload, authorised record read/write/re-read, tenant A to tenant B denial, and failed database connection behavior.
6. Verify safe restart and persisted read-after-restart, without exposing credentials in logs.
7. On the deployed endpoints, verify correct API routing, browser console/network errors, session expiry and permission-denied UX.
8. For native scheduler: prove scheduled jobs and paused interviews survive API restarts and a transient Aiven failure, without duplicated side effects or cross-tenant execution.
9. Record commit SHA, environment, CI URL and actual pass/fail output. Never infer end-to-end pass from a green compile.

## Foundation completion gate

**Partial** until native scheduler restart/retry/tenant-isolation acceptance and fresh-build, API/frontend startup and real tenant-safe production-like journeys pass end-to-end. Temporal is not a requirement. QA audit is separately tracked; these are functional acceptance gates rather than cosmetic QA.

## Related plans

See `PARITY_SCOPE_FREEZE.md` for the authoritative Salesforce feature-level acceptance scope. Database conversion/cutover, tenant recovery and business workflows have their own release gates and must not be called complete merely because this foundation builds.
