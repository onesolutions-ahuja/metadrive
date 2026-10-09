# Dashboard Builder Parity — Handoff

**Status: Paused at the user's request. Not 100% complete.**

## Source of truth

- The frozen acceptance checklist remains [PARITY_SCOPE_FREEZE.md](./PARITY_SCOPE_FREEZE.md). Do not redefine, repeat, or replace its Dashboard criteria.
- [DASHBOARD-PARITY-SCOPE.md](./DASHBOARD-PARITY-SCOPE.md) is historical/superseded, not an acceptance source.

## Work completed in this session

- Confirmed the earlier test failures were solvable, not external blockers.
- Fixed a contradictory sequence in `rbac-sharing.smoke.test.ts`: it deactivated the Org Default page and later expected it to remain active. The test now reactivates that page before checking page precedence.
- Hardened snapshot reads to recheck current report-folder access, object/field permissions, running-user eligibility, and captured record-level access. Added tests for snapshots becoming unavailable after report-folder or record-share access is revoked.
- Added a report-builder regression test for preventing source-report changes that invalidate a saved chart grouping and for blocking deletion of referenced reports.
- Added a focused title helper and unit test for adopting source report labels while preserving user-customized widget titles.
- Recorded Trailhead Dashboard lesson inventory notes and progress in `PARITY_SCOPE_FREEZE.md`.

## Verification status at pause

- Full server suite passed **14/14** after the page-test reactivation and before the latest scheduled-delivery authorization change.
- Server and web production builds passed before the latest scheduled-delivery authorization change.
- The focused title behavior test passed.
- A newly identified gap was addressed in code: scheduled dashboard email rendering now marks a report-backed widget unavailable when its recipient cannot access the source report folder. The matching RBAC smoke test checks that the email and saved snapshot do not reveal report data.
- The latest focused RBAC smoke test completed with one failure at the later team-preview record-count assertion: actual 7 vs expected 8 (`team preview report runs must use the selected subordinate identity`). The new scheduled source-report access assertions are earlier in the same test, so execution reached beyond them; however, the test as a whole is not passing. The added test fixture creates and shares an Account record, which likely changes the later count; isolate or clean up that fixture on resume, rerun the smoke test, then perform full verification.

## Resume here

1. Fix the record fixture/count interference noted above without weakening the team-preview assertion; rerun `apps/server/test/rbac-sharing.smoke.test.ts`.
2. Run server build, web build, and the complete server test suite against the final changes.
3. Continue implementing and verifying the remaining applicable Dashboard criteria in the frozen checklist, especially DASH-11/12/13. The existing inventory/evidence entries do not constitute full completion.
4. Do not report 100% until every applicable frozen Dashboard criterion is implemented and verified. If a genuinely unresolvable blocker appears, state the exact criterion and required external input; otherwise continue.

## Workspace

- Root: `C:\Users\cc\Desktop\MetaSoft`
- This workspace is not a Git repository.
