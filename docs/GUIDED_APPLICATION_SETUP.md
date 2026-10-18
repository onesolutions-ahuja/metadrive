# Guided application setup and readiness (metadata-level)

This is a shared extension of **App Manager**, not an independent Builder, another runtime, or an alternative installation engine. It is intentionally lazy-loaded with the existing App Manager route.

## How to use it

1. Open **Setup → App Manager** and choose an application or create one.
2. Enter an App Label; the UI suggests a valid, unused Lightning App **Developer Name** (different from an AppExchange installation key). The user may customise it.
3. Select existing Objects and active App Pages. The UI displays object API names, standard/custom identity and page type/status; draft pages are visible but cannot be added to live navigation.
4. Use **Application setup review** to see reference errors and jump to existing Object Manager, Page Builder, Flow Builder, OneEngine permissions or AppExchange.
5. Configure relationships, component field mappings, metadata events, Flow-backed state, tenant installation and permissions in their existing shared editors.
6. Validate and activate metadata using the normal publishing paths. Then test real role-scoped end-to-end workflows (payments, stock changes, failure recovery and external systems when applicable) separately.

## What the review does and does not prove

- The review inspects the current **unsaved** App Manager draft. It never writes or activates anything.
- It reuses `inspectPageDependencies` for page component, dashboard, report, event Flow, navigation and shared-state Flow references.
- Optional Flow/report/dashboard metadata is read **only while App Manager is open** and only when selected application pages reference those resources. Missing optional metadata access produces *Not verified*, not a false missing-resource finding.
- The review highlights duplicate object labels using actual API names; only a genuinely missing object is a blocking metadata finding.
- Object-only applications remain valid. Draft/active page status is never confused with an app-level Draft flag.
- **Configured** means only that inspected metadata references resolve. It never means successful payment, legal compliance, approved access, availability, safe uninstall, live SQL idempotency or end-to-end readiness.
- Effective OneEngine policy checks, external provider testing, device session isolation, licence status and operational checkout must be validated with authenticated tenant-aware runtime tests. No new permission bypass or Core business rules are added.

## Implementation boundaries

- `apps/web/src/core/applications/AppSetupGuide/appSetupReadiness.ts` — reusable, read-only metadata assessment and developer-name suggestion.
- `apps/web/src/core/applications/AppSetupGuide/AppSetupGuide.tsx` — guidance shown only in App Manager; optional fetches use the existing authenticated API.
- `apps/web/src/core/pages/PageRuntime/pageDependencies.ts` — existing shared inspector extended to configured state read/write Flows.
- `apps/web/src/core/applications/AppManager/AppManager.tsx` — display metadata identities and page statuses clearly.
- Existing AppExchange, seeders, OneEngine permissions, SQL records and publish routes remain the authority.

## Acceptance checks

Run `node --import tsx --test tests/current/app-setup-readiness.test.ts` and the standard policy, test, build and CI gates. On a disposable tenant, inspect an object-only app, duplicate Product labels, a missing/draft App Page, an inactive Flow, an unavailable optional metadata endpoint and a real installed app under restricted RBAC. Then verify that the checker **never** labels an untested transaction or installation as operationally ready.

## Subsequent operational scope

The initial implementation is the **guided configuration and dependency inspection** foundation. Complete runtime acceptance evidence still requires read-only and controlled disposable-tenant verification of effective RBAC, Flow checkout semantics, transactional SQL behaviour, real provider responses, paired-device security, publishing and AppExchange reinstall/uninstall. These are not claimed complete by the guide.
