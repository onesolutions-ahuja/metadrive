/**
 * Infrastructure-only outbound host pause switch. No business routing is hardcoded.
 * Incoming webhooks and record-driven flow metadata remain available.
 */
export function assertCalloutHostAllowed(hostname: string, rawPausedHosts: string | undefined): void {
  const paused = new Set((rawPausedHosts ?? '').split(',')
    .map(host => host.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean));
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (paused.has(normalized)) {
    throw new Error('Outbound HTTP callout blocked by the operator pause policy.');
  }
}
