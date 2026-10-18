# SQL runtime architectural and frontend compatibility audit

Source: GitHub SQL runtime at the current review branch, with the automated inventory from `scripts/audit-sql-api-contract.mjs`.

## Scope checked

The audit scans 147 frontend TypeScript/TSX files and finds 171 statically recognisable API calls. The SQL server advertises 73 statically enumerated or generic definition routes in this heuristic inventory. **76 distinct frontend request paths did not match a registered SQL route.** These are static-analysis findings, not 76 independently verified broken browser pages; dynamic URLs, inferred HTTP methods, permission checks and user navigation need additional authenticated end-to-end validation. The mismatch is sufficient to establish **frontend/SQL parity has NOT been achieved**.

Missing path inventory is versioned in `scripts/sql-api-compatibility-gaps.json`. New unmatched paths fail `npm run check`. Full parity is separately testable with `node scripts/audit-sql-api-contract.mjs --strict`, which currently fails. Do not classify a 404 JSON fallback as a working endpoint.

## Missing route families (distinct paths, heuristic)

- `auth`: 15
- `metadata/objects`: 8
- `records`: 7
- `metadata/dashboards`: 6
- `reports`: 4
- `tenant`: 4
- `component-library`: 3
- `connector-apps`: 3
- `named-credentials`: 3
- `approvals`: 2
- `metadata/flow-interviews`: 2
- `metadata/flows`: 2
- `metadata/route-aliases`: 2
- `notifications`: 2
- `platform`: 2
- `apps`: 1
- `flow-interviews`: 1
- `flows`: 1
- `integration-connections`: 1
- `metadata/apps`: 1
- `metadata/automation-settings`: 1
- `metadata/currencies`: 1
- `metadata/flow-logs`: 1
- `metadata/offline-publication`: 1
- `metadata/permissions`: 1
- `routes`: 1

## Duplication findings and removals

- Removed duplicated permission evaluation SQL from `session-metadata.ts`; the central `RbacEngine.allowedMany` now supplies effective capability decisions with tenant/user scope, wildcard grants and deny precedence.
- Removed unused duplicate `RecordActivity`, `ChatterComment` and `ChatterPost` declarations from `App.tsx`, keeping the live record workspace definitions.
- Cross-file identical-code windows are reported through `scripts/audit-duplicate-code.mjs`. Shared type shapes or repeated imports are not alone evidence of a parallel runtime. Additional duplicated interactive page action logic must be reviewed before removing functionality.

## Required completion gates

- Implement the missing API operations through existing shared SQL/OneEngine engines with tenant/field/record RBAC, not placeholder handlers or false empty arrays.
- Verify each frontend page and each action, including administrative writes, authenticated flows, permissions, recovery, and error cases, against a test tenant/database.
- Obtain a passing **strict** API parity audit, production-compatible migration tests, and end-to-end browser checks before claiming full compatibility.
- Do not remove business data, schema history or genuine independent app seeders during consolidation.

This document records verified limitations, not a claim that all frontend pages work.
