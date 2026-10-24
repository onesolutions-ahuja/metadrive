# Oracle Stalwart mail cutover

This runbook replaces Freehosting mail service with the existing Stalwart instance at `132.145.18.46`. It is intentionally staged: do not change production DNS or recreate the production container until every readiness gate below passes.

## Preserved deployment state

Read-only inspection on 2026-10-23 found:

- Container `stalwart-setup`, image `stalwartlabs/stalwart:v0.16` (ARM64 image digest pinned in [stalwart-compose.yaml](../../scripts/oracle/stalwart-compose.yaml)).
- Persistent named volumes `stalwart-etc` mounted at `/etc/stalwart` and `stalwart-data` mounted at `/var/lib/stalwart`. The config volume contains a 128-byte RocksDB bootstrap config; account configuration and mail data are held in the persistent data store.
- Restart policy `unless-stopped`; container runs as user `stalwart`, working directory `/var/lib/stalwart`.
- The Compose file retains the same named volumes, user, working directory, command, health check and loopback-only JMAP binding. It publishes only SMTP 25, authenticated submission 587 and implicit-TLS IMAP 993. Port 465 is not published. Do not run Compose until Stalwart listener objects have been configured and verified.
- A read-only WebUI inspection on 2026-10-23 found internal listeners for SMTP `[::]:25` (STARTTLS enabled), implicit-TLS SMTP `[::]:465`, implicit-TLS IMAP `[::]:993`, HTTP `[::]:8080` and `[::]:443`, plus ManageSieve `[::]:4190` and POP3 `[::]:995`. A submission listener was subsequently created at `[::]:587` with TLS enabled and implicit TLS disabled (STARTTLS). The saved AUTH policy requires authentication on non-25 ports and advertises SASL mechanisms only after TLS. The SMTP 25 listener has TLS enabled but no certificate is selected as the default. A DNS-01 provider and ACME settings for `mail.unesolutions.co.uk` have been saved, but issuance and the certificate SAN/chain remain unverified. These are application listener objects, not host port publications; the running container still publishes only `127.0.0.1:8080`.
- Never remove or recreate either external volume. Before a planned deployment, take and verify an application-consistent backup of both volumes and record the running container/image IDs. A raw copy of a live RocksDB directory is not an application-consistent backup.

The existing MetaDrive API key cannot read or create Stalwart `NetworkListener` or `AcmeProvider` objects (`forbidden`). The Stalwart admin must configure and verify certificates and relay settings through the secured WebUI or a separately provisioned, least-privilege administrator credential. Do not broaden the MetaDrive mailbox-management key to server administration.

## Stalwart settings required before publishing ports

Using Stalwart's supported Network Listener configuration, verify the saved submission listener and the existing receive and IMAP listeners:

| Service | Bind | Protocol | TLS |
| --- | --- | --- | --- |
| SMTP receive | `0.0.0.0:25` | SMTP | Opportunistic STARTTLS with the verified `mail.unesolutions.co.uk` certificate |
| Mail submission | `0.0.0.0:587` | SMTP | STARTTLS required before authentication; authenticated submission only; no unauthenticated relay |
| IMAP client access | `0.0.0.0:993` | IMAP | Implicit TLS with the verified `mail.unesolutions.co.uk` certificate |
| Management/JMAP | `127.0.0.1:8080` on the host | Existing HTTP/JMAP | Keep private; do not publish on a public interface |

Use Stalwart ACME with DNS-01 for `mail.unesolutions.co.uk`, so issuance and renewal do not conflict with the existing Nginx web/API listeners. The Cloudflare token must be least-privilege for the `unesolutions.co.uk` zone and stored only in Stalwart's secret-backed DNS-provider configuration. Do not place tokens or private keys in this repository, logs, shell arguments or chat. Verify certificate chain, SAN and expiry from outside the VM before opening mail ports.

**Preparation saved in Stalwart:** the Cloudflare DNS provider and Let's Encrypt DNS-01 ACME provider were created, then the `unesolutions.co.uk` domain was saved with ACME TLS management, `mail` as an additional certificate hostname, and Automatic DNS management limited to **DKIM public keys only**. The UI confirmed “Saved successfully.” This configuration can publish Stalwart DKIM records and temporary ACME challenge TXT records; it does not manage MX or SPF. Public DKIM/challenge records and issuance of a certificate containing `mail.unesolutions.co.uk` have not yet been independently verified. The mail A/MX routing records have not been changed.

## Outbound relay

OCI Email Delivery was verified in the UK South (London) region (`uk-london-1`): the `unesolutions.co.uk` email domain is Active with DKIM Signing Active, and the console reports SPF Configured. `test@unesolutions.co.uk` was already an approved sender; `support@unesolutions.co.uk` has now been added as an approved sender. Public DNS still reports only the old Freehosting SPF, so the OCI console status is not sufficient evidence that live SPF is correct.

The console gives the SMTP endpoint `smtp.email.uk-london-1.oci.oraclecloud.com`; port 587 is recommended, with TLS required. Use authenticated SMTP with STARTTLS on port 587, after verifying TCP egress and the endpoint certificate from Oracle. Do not use the previously documented port 465 assumption. Provision credentials only for a dedicated, least-privileged OCI identity authorized to use the approved senders, and store them in Stalwart's secret-backed relay configuration. No SMTP credential or outbound Stalwart relay has been created yet. Confirm Stalwart queue retry and bounce behavior and verify delivery to independent external mailboxes. A successful JMAP `EmailSubmission/set` response is not delivery evidence.

If OCI Email Delivery is unavailable, blocked, or lacks approved sender entitlement, stop: this architecture has no fallback provider.

## Oracle networking gates

The protected Oracle diagnostic run #6 on 2026-10-24 confirmed there are no host listeners on 25, 465, 587 or 993, localhost connections to those ports are refused, and Docker publishes none of those mail ports. It returned `DO_NOT_CHANGE_MX_YET`. Earlier read-only checks confirmed the container is healthy, JMAP/API diagnostics pass, JMAP remains bound to `127.0.0.1:8080`, and UFW is inactive. The last external DNS probe on 2026-10-23 resolved `mail.unesolutions.co.uk` through the Brevo tracking CNAME to `94.143.16.132`, with MX still at `panel.freehosting.com`, the existing SPF still authorizing Freehosting, and DMARC reports still directed to Brevo. That probe timed out connecting directly to Oracle on ports 25, 587 and 993; the Oracle IP had no PTR response. Oracle outbound TCP 25 to a public mail exchanger also timed out, so direct-to-MX delivery is not currently viable. OCI Email Delivery is available in `uk-london-1`, but Oracle-to-relay TCP 587, a least-privilege SMTP credential, NSG/security-list rules and PTR remain unverified. The read-only runtime preflight tests TLS certificate validation and SMTP AUTH capability against the verified regional relay endpoint without authenticating or sending a message.

After Stalwart listeners and TLS are ready, an OCI tenancy administrator must review the instance VNIC's attached NSG and subnet security lists, then add only required ingress TCP 25, 587 and 993 rules. Also verify outbound TCP 587 to the confirmed OCI relay endpoint. Do not enable UFW blindly: first inventory existing host firewall rules and explicitly preserve SSH, HTTPS/API and required monitoring access. Request/set Oracle reverse DNS for `132.145.18.46` to `mail.unesolutions.co.uk` and verify the resulting PTR/A forward-confirmation.

Run [check-mail-delivery.py](../../scripts/oracle/check-mail-delivery.py) on the host and [check-mail-public.py](../../scripts/oracle/check-mail-public.py) from a non-Oracle network. The public check verifies mail-host DNS, direct Oracle TCP, SMTP STARTTLS certificate identity, submission AUTH advertisement and IMAPS TLS. It does not authenticate, send mail or prove recipient delivery.

## Cloudflare record plan (observed live zone; mail routing unchanged)

The observed zone has 22 records. Preserve apex GitHub Pages A records (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`), `www`, `api` (`132.145.18.46`, DNS only), verification records, and all non-mail application records. The Stalwart domain preparation above is saved, but the live mail A/MX records remain on the old routing; do not infer successful DKIM publication or ACME issuance from the UI save confirmation.

After external listener, TLS, relay, mailbox and data-readiness gates pass, have the DNS owner apply only this reviewed mail-specific diff:

| Action | Type | Name | Value | Proxy |
| --- | --- | --- | --- | --- |
| Replace the existing Brevo tracking CNAME | A | `mail` | `132.145.18.46` | DNS only |
| Replace the existing Freehosting MX | MX | `@` | `mail.unesolutions.co.uk`, priority 10 | DNS only |
| Replace the existing Freehosting SPF TXT | TXT | `@` | One SPF value for the verified sending path, including only independently verified legitimate senders | DNS only |
| Publish the Stalwart DKIM key | TXT | Selector returned by Stalwart | Exact public key returned by Stalwart | DNS only |
| Retain the existing OCI DKIM selector only if OCI confirms it is active and required for this sending domain | CNAME | `metarive-london-20261023._domainkey` | Existing `.lhr1.oracleemaildelivery.com` target | DNS only |
| Replace the existing Brevo DMARC report destination | TXT | `_dmarc` | `v=DMARC1; p=none`; add `rua` only for a verified owner-controlled report mailbox | DNS only |

Once the new server has passed delivery checks, remove obsolete mail-only records: the Freehosting `imap` and `smtp` CNAMEs, `_autodiscover._tcp` SRV record, Freehosting MX and SPF; Brevo `mail`, `img.mail`, `r.mail` tracking CNAMEs, `brevo1._domainkey` and `brevo2._domainkey` selectors, and `brevo-code` TXT; and the old `x._domainkey` TXT only after its former sender is confirmed retired. Verify each exact record in the live zone immediately before deletion. Do not remove any unrelated record or a DKIM record still required by the verified sending path. Do not create a second SPF record or invent DKIM material.

Do not change MX or remove the old-service records until real external inbound and outbound receipts, SPF/DKIM/DMARC results, support-mailbox readiness, and rollback are verified. Do not change the apex website records.

## Rollback

Before changing DNS, export/snapshot the complete Cloudflare zone and record the original values of every mail record. Keep existing mail-only records until the new system has passed a monitored soak period. If SMTP/TLS or delivery fails, restore the original MX and only the original mail records captured in that snapshot; leave apex, API and verification records untouched.

Before changing the Stalwart container, create and verify a consistent backup of both named volumes. Retain the exact old image ID and container inspection metadata. Roll back the container image/config from that saved deployment record without deleting, replacing or initializing either named volume. Verify JMAP and all existing accounts/data before considering rollback complete.

## Acceptance evidence

Record timestamps, external test provider/domain (not secrets), message IDs, and independent recipient observations for:

1. Port 25 accepts a remote SMTP connection and STARTTLS with a valid mail-host certificate.
2. Port 587 requires STARTTLS and authentication; invalid/unauthenticated external relay attempts are rejected.
3. Port 993 presents the valid IMAPS certificate.
4. OCI relay receives authenticated TLS submissions, Stalwart queues/retries/bounces as configured, and separate external recipients receive the message.
5. A message from an independent external sender reaches Stalwart and `support@unesolutions.co.uk`; a reply is independently received.
6. SPF, DKIM and DMARC alignment pass at external recipients.
7. Existing mailboxes, credentials and messages survive container and VM restart; the `support@` mailbox and all aliases are verified.
8. Tenant mailbox isolation still passes.

Do not report email delivery complete until all checks pass. The self-hosted Oracle diagnostic is read-only; the public probe runs on a GitHub-hosted runner and originates outside the Oracle VM.
