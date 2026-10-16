# Flow Builder parity scope — historical notes

**Status: Superseded; completeness addendum added 2026-10-09.** The authoritative scope is [PARITY_SCOPE_FREEZE.md](../PARITY_SCOPE_FREEZE.md). This file is retained as implementation-history context only; its exclusions and checklist are not separate acceptance criteria.

The user explicitly requested a completeness review on 2026-10-09. It identified a risk that broad flow catalogs can still miss reference-specific settings, combinations, state transitions, and runtime consequences. The master checklist now includes **FLOW-14 through FLOW-16**: reference inventory/traceability, authoring-to-runtime contracts, and invocation/operations coverage. Agents must use FLOW-01 through FLOW-16 in the master checklist. These additions make omissions visible; they are not evidence that any criterion is implemented or verified.

Do not use this historical checklist to narrow or override the consolidated frozen scope.

## Reference baseline

Match the native Salesforce Flow Builder capability and user-visible behavior documented in the official Salesforce references below, as available on 2026-10-09. Match outcomes and behavior, not Salesforce's implementation language or internal architecture. The explicit "every native" clauses below include baseline features even if an individual feature is not separately named in an example list.

- [Trailhead: Flow Builder Basics](https://trailhead.salesforce.com/content/learn/modules/flow-basics)
- [Trailhead: Meet Flow Builder](https://trailhead.salesforce.com/content/learn/modules/flow-basics/meet-flow-builder)
- [Trailhead: Screen Flows](https://trailhead.salesforce.com/content/learn/modules/screen-flows)
- [Trailhead: Record-Triggered Flows](https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows)
- [Salesforce Help: Flow Elements](https://help.salesforce.com/s/articleView?id=sf.flow_ref_elements.htm&type=5)

## Explicit exclusions

- Apex code and Apex-based custom Flow actions.
- Custom Lightning-component (LWC) Flow screen components and Lightning-component-based Flow UI.

These exclusions do not exclude standard Salesforce-provided screen components, standard first-party actions, or the Flow Builder's own UI.

## Frozen-scope acceptance checklist

### 1. Flow types and lifecycle

- [ ] Create, label, API-name, describe, save, save-as, clone, edit, delete, activate, deactivate, and version flows with Salesforce-equivalent lifecycle rules.
- [ ] Support every native Flow Builder flow type in the reference baseline, including Screen, Autolaunched, Record-Triggered, Schedule-Triggered, Platform Event-Triggered, and any native orchestration type exposed by that baseline.
- [ ] Preserve active-version semantics, drafts, prior versions, activation status, start configuration, and element/resource/connector metadata across reloads.
- [ ] Allow the supported ways to launch or invoke each flow type, with the corresponding input/output contract and access checks.

### 2. Builder UI, canvas, and editing experience

- [ ] Provide the Flow Builder toolbox (Elements and Manager), searchable standard elements/resources, contextual configuration, canvas, start configuration, toolbar, and validation/debug surfaces.
- [ ] Add, select, configure, connect, reconnect, reorder, copy/duplicate where supported, and remove elements; support automatic and manual layout, branching paths, fault paths, and valid reconnection behavior.
- [ ] Support canvas navigation and editing behavior, including zoom, fit/reset, pan, selection, keyboard operation/shortcuts, undo/redo, and unsaved-change handling.
- [ ] Provide accessible, responsive, understandable builder interactions and Salesforce-equivalent element/property labels, defaults, constraints, help, and error feedback.
- [ ] Keep toolbox, canvas, property editor, validation, and saved metadata in sync; no displayed configuration may be a nonfunctional placeholder.

### 3. Standard element catalog and configuration

- [ ] Implement every native standard element in the reference baseline, with its documented properties, input/output resources, validation, runtime behavior, and connector behavior.
- [ ] Cover the native interaction, data, and logic categories: Screen, Action, Subflow; Get/Create/Update/Delete Records, Roll Back Records, Publish Platform Event; Assignment, Decision, Loop, Wait/Pause, Collection Filter, Collection Sort, Transform; and every additional native standard element in the baseline.
- [ ] Support standard first-party actions available to Flow Builder in the baseline (including their inputs, outputs, availability rules, permission checks, and runtime effects), except Apex-based actions.
- [ ] Ensure element availability is correctly constrained by flow type, trigger mode, screen context, resource types, and other Salesforce configuration rules.

### 4. Connectors, paths, and control flow

- [ ] Support normal, conditional/outcome, default, fault, scheduled, and other native connector/path kinds in the baseline.
- [ ] Preserve connector order and conditions; execute only the correct path, including outcome ordering, default handling, branching, loops, waits, and fault routing.
- [ ] Validate graph structure, required start/end behavior, unreachable or invalid paths, connector references, and element-specific path rules.

### 5. Start elements and triggering

- [ ] Implement Start configuration for each flow type: object/event selection, trigger timing, create/update/delete semantics, entry criteria and custom condition logic, schedule details, and all other baseline Start properties.
- [ ] Match record-trigger behavior, including before-save/after-save support, changed-record/run-on-update semantics, trigger ordering, triggering and prior record context, and supported optimization choices.
- [ ] Support schedule-triggered execution and platform-event-triggered execution with correct eligibility, event/record context, scheduling, persistence, retries, and cancellation behavior.
- [ ] Enforce trigger-specific restrictions in the builder, validator, activation process, and runtime.

### 6. Flow resources, global values, and formulas

- [ ] Implement all native resource kinds and data types in the baseline, including variables, constants, records/record collections, formulas, text templates, choices/choice sets, and their collection, input, output, default, and availability properties.
- [ ] Provide the baseline Flow global variables and global constants with correct scope, identity, lifetime, and values.
- [ ] Match the complete formula language available in Flow for the baseline: operators, functions, data types, coercion, null/blank behavior, errors, locale/time-zone/currency behavior, Flow/resource references, and record-trigger context.
- [ ] Support formula and text-template editing, validation, evaluation timing, and use in every property/resource context allowed by Salesforce.

### 7. Screen design and interview runtime

- [ ] Implement every standard Salesforce-provided Screen component in the baseline, including (where available) Display Text, Display Image, Text, Long Text Area, Number, Currency, Date, Date/Time, Email, URL, Phone, Password, Checkbox, Toggle, Slider, Picklist, Multi-Select Picklist, Radio Buttons, Choice Lookup, Lookup, Name, Address, Data Table, Repeater, File Upload, Section, and every other standard component; match its properties, input/output value semantics, validation, help text, required behavior, choices, and supported data types. Custom Lightning components remain excluded.
- [ ] Support screen composition/layout, display content, conditional visibility, field dependencies, choice sources, record lookups, tables/repeaters, file inputs, and other standard component behaviors present in the baseline.
- [ ] Match interview navigation and runtime behavior: next/previous, custom buttons/outcomes, pause/resume where supported, persisted values, validation errors, fault handling, accessibility, and expiration/cancellation behavior.
- [ ] Render standard screen content and component values consistently between preview/debug and an actual running interview.

### 8. Data operations and record semantics

- [ ] Match Get/Create/Update/Delete Records configuration and runtime, including single-record versus collection results, field selection/assignment, filters and condition logic, sorting, limits, null handling, relationships, and output resources.
- [ ] Support bulk/collection operation semantics and platform-equivalent field/object validation, formulas, defaults, record types, lookups, and record lifecycle effects.
- [ ] Enforce tenant isolation and running-user object, field, record, sharing, and system permissions consistently in configuration, validation, debug, and runtime.
- [ ] Match transaction boundaries, rollback, ordering, recursion/loop safeguards, and externally visible side effects for supported Flow operations.

### 9. Subflows, actions, and integrations

- [ ] Invoke eligible flows as Subflows with Salesforce-equivalent input/output mapping, version selection, validation, recursion protection, error propagation, and permission behavior.
- [ ] Support baseline standard first-party actions and action discovery/configuration, including reusable metadata-backed actions such as Email Alerts where Salesforce provides them.
- [ ] Support baseline native integration/action behavior, credentials, inputs/outputs, faults, and permission checks; Apex extension points remain excluded.
- [ ] Match reusable Email Alert/template and recipient behavior if present in the reference baseline, while retaining the explicitly excluded Apex/LWC scope.

### 10. Waits, asynchronous work, orchestration, and delivery

- [ ] Persist and resume waits, scheduled paths, interviews, and other asynchronous work with correct timing, time zones, recurrence, cancellation, retries, and process-restart behavior.
- [ ] Implement native asynchronous paths, event publication/subscription, and orchestration stages/steps/work items to the extent they are native Flow Builder features in the reference baseline.
- [ ] Match delivery/retry/error behavior and make queued or pending work observable and manageable in the supported UI.

### 11. Validation, debug, testing, and operations

- [ ] Match Flow Check/validation errors and warnings, including resource/property/graph/trigger/security constraints, with actionable locations and messages.
- [ ] Provide debug/run behavior for supported flow types, test inputs, execution paths, values, results, errors, rollback behavior, and permissions equivalent to the baseline.
- [ ] Provide execution history/logs and operational visibility for interviews, failures, waits, scheduled work, and asynchronous runs to the extent the baseline exposes them.
- [ ] Provide native Flow administration/inspection surfaces in the baseline, including Flow Trigger Explorer, paused/interview management, and flow tests where Salesforce makes them part of the supported Flow authoring/operations experience.
- [ ] Prevent activation of invalid flows and verify that the activated version is the version actually executed.

### 12. Metadata, access control, and tenant behavior

- [ ] Persist, retrieve, and round-trip all supported Flow metadata, including versions, resources, elements, connectors, trigger settings, screen configuration, action references, and related definitions.
- [ ] Support native Flow metadata portability/deployment/import/export and dependency behavior where available in the reference baseline.
- [ ] Apply 100% tenant isolation and role/permission-based access to viewing, creating, editing, validating, debugging, running, activating, deactivating, deleting, and deploying flows and dependencies.
- [ ] Support applicable labels, descriptions, help text, and translated Flow/screen content available in the baseline.
- [ ] Return clear authorization, validation, dependency, and runtime failures without success-shaped fallbacks or silent loss of metadata.

### 13. Limits, compatibility, and quality gates

- [ ] Match documented native limits and boundary behavior in the baseline where they affect Flow configuration or execution; reject unsupported or over-limit configurations clearly.
- [ ] Preserve backward compatibility and migrate existing Flow metadata safely as supported metadata evolves.
- [ ] Add automated coverage for each checklist item across configuration/persistence, validation, runtime, permissions, and UI behavior where applicable.
- [ ] Keep user-facing documentation accurate about implemented parity and any remaining work; do not claim completion while any in-scope item is pending or unverified.

## Completion rule

“100% done” means every checkbox above is implemented and verified against the reference baseline, with no known in-scope gaps. An item may be excluded from completion only if the user explicitly amends the frozen scope or a genuine blocker is identified and explained.
