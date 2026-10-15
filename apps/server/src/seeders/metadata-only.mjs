/**
 * Reject tenant business state and credentials from independently installable
 * metadata packages. AppExchange may seed object schemas, never customer rows.
 * Check presence rather than truthiness: even empty record payloads are invalid.
 */
export const FORBIDDEN_SEED_STATE = Object.freeze([
  'records','users','namedCredentials','integrationConnections',
  'refreshSessions','securityAudit','recordShares','scheduleRuns',
  'scheduleRetries','flowLogs','interviews','notifications',
  'passwordRecovery','mfaPolicy','autoNumberSequences'
]);

export function assertMetadataOnlySeed(definition, context = 'Metadata seed') {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition))
    throw Error(context + ' must be an object');
  for (const key of FORBIDDEN_SEED_STATE) {
    if (Object.hasOwn(definition,key))
      throw Error(context + ' may not contain tenant data or credentials: ' + key);
  }
  return definition;
}
