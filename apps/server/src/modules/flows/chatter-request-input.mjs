/** Preserve shared Flow validation while stripping a legacy, untrusted Chatter record selector.
 * The server-side channel guard derives the actual authorized target record.
 */
export function sanitizeChatterCallerInput(apiName, input) {
  if (apiName !== 'CHATTER_ASSIGN_CONVERSATION' && apiName !== 'CHATTER_SEND_MESSAGE') return input;
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'TargetRecordId'));
}

// An authorized Chatter guard may derive protected Flow variables (credential,
// sender, assignee or target record). Allow them only in the in-memory execution
// definition, never in persisted Flow metadata or an unverified client payload.
export function trustedChatterExecutionFlow(flow, authorizedInput) {
  return {...flow, resources:flow.resources.map(resource =>
    !resource.availableForInput && Object.hasOwn(authorizedInput,resource.name)
      ? {...resource,availableForInput:true} : resource)};
}
