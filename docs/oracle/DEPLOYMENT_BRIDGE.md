# Oracle API deployment bridge

The GitHub Pages workflow publishes only the frontend. Backend changes on `main` now trigger a separate, protected Oracle deployment workflow for the existing VM. The workflow deploys the API **and durable worker** from the same immutable release.

## One-time setup (repository administrator + Oracle operator)

1. On GitHub **Settings → Environments**, create `oracle-production` and
   require approval from a trusted maintainer. Restrict deployment branches to
   `main`.
2. On GitHub **Settings → Actions → Runners → New self-hosted runner**,
   select Linux x64. Follow GitHub's current, expiring registration instructions
   **on the Oracle host**, using the existing `ubuntu` account. Register the
   runner with the additional custom label `metadrive-oracle`.
3. Prefer a dedicated isolated deployment host/runner where possible. A runner
   on the production VM should run only approved code and must never execute
   untrusted PR jobs. Only protected `main` pushes trigger production deployments; pull requests never execute on the production runner.
4. Ensure only authorised operators can dispatch and approve the environment.
   Confirm `ubuntu` can use noninteractive `sudo` to invoke the reviewed
   deployment script. Do not weaken unrelated sudo or server security policies.
5. Once a backend change is merged to `main`, **Oracle SQL API Deployment** runs automatically.
   Approve the `oracle-production` environment if approval is required by repository settings.
   A manual **Run workflow** action is still supported for recovery.
   The job builds the backend, places a single immutable release under
   `/opt/metadrive/releases/gh-<sha>`, and updates both `metadrive-api.service`
   and `metadrive-worker.service`. It backs up both systemd overrides, checks the
   API health endpoint and worker activity, and rolls both services back on failure.

The API and worker apply the repository's versioned SQL migrations on startup; do not claim a migration or queued Communication delivery succeeded without SQL evidence. Deployments do not delete tenant business records, Stalwart storage or DNS settings. The standard production env file remains
`/etc/metadrive/production.env`. Do not upload credentials or SSH keys to
GitHub or the runner workspace.

Note: GitHub's runner registration token is short-lived. Obtain it from the
repository Settings page; do not put a token in a committed script. The live
service may use port 3001 as configured in the existing production environment;
if that changes, update the health probe before using the workflow.
