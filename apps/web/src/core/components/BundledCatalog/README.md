# Core bundled registrations

`manifest.json` contains the protected SystemPanel registration and the legacy
ChatterInbox reference. Source paths are relative to `apps/web/src`.

SystemPanel owns its JSX and CSS in `core/components/SystemPanel/`. ChatterInbox
uses `one/OneConversation/` with its original defaults and no duplicate renderer.

`scripts/component-catalog.mjs` reads this catalog and the indexed One descriptors
and bundles local sources and styles before registration. Tenant-authored code
retains its sandbox; the server remains responsible for permissions and trust.

The current server returns abbreviated definitions and lacks the editor's
save/publish endpoints. This source organization and packaging do not implement
that separate backend persistence contract.
