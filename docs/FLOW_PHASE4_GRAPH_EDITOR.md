# Phase 4: no-code Flow graph authoring

Phase 4 extends the existing, lazy-loaded Flow Builder. SQL Flow definition metadata and the shared execution engine remain unchanged.

## Browser controls

1. Open **Setup → Flows**, choose or create a Flow, and select the Elements toolbox.
2. **Click a connector's + button** to select its exact outcome, fault, async or scheduled path. Click a toolbox element to insert on that path, or **drag an element from the toolbox directly onto the connector +**.
3. Drop a toolbox element directly onto a node to insert after it. If a node has multiple outgoing paths, choose the exact path first. The editor refuses ambiguous rewiring.
4. Select a nonterminal element and click **Duplicate** (or Ctrl/Cmd+D). The copy inherits configuration and splits the selected continuation, but has its own ID and no duplicated freeform position. Branching elements require explicit path selection.
5. To remove an element, use its minus button, the Properties delete control or Delete/Backspace (outside editable inputs). Removal reconnects its **single normal** continuation while preserving incoming connectors, labels, kinds and IDs. Start, End, branching or otherwise unsafe edits are refused; nothing is silently discarded.
6. **Review graph** to locate disconnected elements, missing targets and unfinished paths. The review is an authoring hint; **Check** still calls authoritative server validation before Save/Activate.
7. Use Undo (Ctrl/Cmd+Z), Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y), and Save (Ctrl/Cmd+S). Shortcuts do not interfere with text-entry controls.
8. For layout, use Freeform to drag nodes or move them with arrow keys (Shift for larger movement), Reset Positions, Auto-Layout, Fit to view and zoom. Freeform positions remain metadata and do not affect Flow execution semantics.

## Invariants

* A Flow has one Start, connector IDs and branch meanings survive edits, and no element type unsupported by the tenant's SQL capability catalog can be added.
* Graph operations reuse the existing shared Flow graph insertion and graph operations modules. They do not introduce new runtime or CRUD engines.
* All changes enter the existing 50-entry undo/redo stack, transition active Flows into drafts, and are saved/versioned via the standard tenant-scoped SQL Flow APIs.
* The builder and graph modules remain lazily mounted; none are loaded by a tenant's published app runtime.

## Coverage

The graph operations regression tests cover straight-path bypass, fault/scheduled/async metadata retention, unsafe branch rejection, duplication, connector targeting and graph diagnostics. Real-browser smoke covers drag onto a connector, copy, undo, redo and graph review.
