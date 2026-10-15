/** Preserve shared Flow validation while stripping a legacy, untrusted Chatter record selector.
 * The server-side channel guard derives the actual authorized target record.
 */
export function sanitizeChatterCallerInput(apiName, input) {
  if (apiName !== 'CHATTER_ASSIGN_CONVERSATION' && apiName !== 'CHATTER_SEND_MESSAGE') return input;
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'TargetRecordId'));
}
