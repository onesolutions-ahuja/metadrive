# MetaDrive current tests (replacement)

Historical agent/phase/Kiosk-specific test files are removed. The new tests
exercise shared production modules directly. This is not a claim that every
integration or authenticated browser acceptance scenario is already covered.

* npm run test:unit — no live dependencies
* npm run build — one web compilation and one server compilation
* npm run check — current tests, production builds, policy, lazy loading
* npm run test:integration — opt-in only: requires METADRIVE_TEST_BASE_URL,
  METADRIVE_TEST_DATABASE_URL and METADRIVE_TEST_ALLOW_WRITES=true, pointing at
  an approved isolated staging app and disposable PostgreSQL database.

SQL seeder idempotency, actual authenticated object/field/record/action/Flow
denial tests, scheduler restart, published Builder UI and lifecycle uninstall
need real isolated tenant fixtures and must not be reported as verified until
those integration tests exist and pass. Never connect the disposable SQL test
to production. Mandatory CI runs functional core tests and both builds;
manual production procedures stay distinct from the regular test suite.
