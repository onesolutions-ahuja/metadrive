# Parity delivery phases

The acceptance criteria remain exclusively in [PARITY_SCOPE_FREEZE.md](./PARITY_SCOPE_FREEZE.md). This file only groups existing requirement IDs into the three delivery phases requested on 2026-10-09; it does not modify, defer out of scope, or weaken any criterion.

## P1 — Flow Builder foundation (active)

Deliver and verify all applicable `FLOW-*` criteria. Prioritize flow lifecycle, type/invocation, builder editing, standard elements, paths, start behavior, resources/formulas, screens/interviews, data operations, actions/subflows, transactions/asynchronous work, validation/debug/operations, and metadata/security.

**First implementation item:** `FLOW-01` saved Flow clone / Save As creates an independent Draft definition with copied graph/resources and no accidental active-version state.

## P2 — Metadata-driven builders and data model

Deliver and verify all applicable `OBJ-*`, `PAGE-*`, `REPORT-*`, and `DASH-*` criteria, including Object Manager metadata behavior and its consumption by the page, report, and dashboard surfaces.

## P3 — Cross-surface security, dependencies, and release proof

Deliver and verify all applicable `RBAC-*`, `META-*`, and `QA-*` criteria, including cross-surface permission/dependency behavior, portability, authenticated browser workflows, regression coverage, and completion evidence. Resolve any unmet P1/P2 acceptance criteria as part of the relevant cross-surface verification; phase boundaries do not waive requirements.

## Progress rule

Track implementation and test evidence against the frozen requirement IDs. Keep this phase grouping current without reproducing or revising the frozen checklist. Overall completion remains pending until every applicable criterion in every phase is verified.
