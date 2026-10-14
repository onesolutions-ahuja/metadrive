# MetaDrive coding agent instructions

**MANDATORY:** Read and follow [DEVELOPER_POLICY.md](DEVELOPER_POLICY.md) in full before implementing any coding task. Its 13 rules are binding for features, bug fixes, migrations, refactors, installers, PRs and reviews.

Inspect existing metadata-driven Objects, Actions, Flows, registered Components, shared functions/loops and central RBAC before coding. Reuse existing platform engines; implement app behaviour through metadata instead of app-specific hardcoding. Seed appropriate metadata and initial OneEngine permissions for every new app/module, without RBAC bypass. Keep new and modified code files <= 1,000 lines and split by responsibility.

If a user request conflicts with any policy rule, explain the conflict and ask the owner to decide before implementing the conflicting change. Verify applicable architecture, functionality, security and tests before declaring completion. Never silently bypass this policy.
