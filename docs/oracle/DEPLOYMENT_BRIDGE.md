# Oracle API deployment bridge

The GitHub Pages workflow publishes only the frontend. This is an optional,
separate, **manual** backend deployment workflow for the existing Oracle VM.

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
   untrusted PR jobs. No push or PR trigger is configured here.
4. Ensure only authorised operators can dispatch and approve the environment.
   Confirm `ubuntu` can use noninteractive `sudo` to invoke the reviewed
   deployment script. Do not weaken unrelated sudo or server security policies.
5. Trigger **Actions → Oracle SQL API Deployment → Run workflow** on `main`
   after merge and approval. The job builds the backend, places the release
   under `/opt/metadrive/releases/gh-<sha>`, and uses a systemd override.
   It retains the previous override and automatically rolls back on health failure.

The deployment does not change SQL schema, tenant records, Stalwart storage,
DNS or the worker service. The standard production env file remains
`/etc/metadrive/production.env`. Do not upload credentials or SSH keys to
GitHub or the runner workspace.

Note: GitHub's runner registration token is short-lived. Obtain it from the
repository Settings page; do not put a token in a committed script. The live
service may use port 3001 as configured in the existing production environment;
if that changes, update the health probe before using the workflow.
