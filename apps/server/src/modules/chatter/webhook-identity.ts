/** Persist account identity from the verified Meta webhook phone ID, not browser inputs.
 * Only populate fields that are present in the tenant's metadata definition.
 */
export function chatterIncomingIdentityFields(
  object: {fields: ReadonlyArray<{apiName: string}>},
  sender: string,
  displayPhone: string | undefined,
  phoneId: string
): Record<string, string> {
  if (!/^\d{8,}$/.test(phoneId)) {
    throw new Error('Signed WhatsApp webhook did not contain a valid Phone Number ID');
  }
  return {
    Direction__c: 'Incoming',
    From_Number__c: sender,
    To_Number__c: displayPhone ?? '',
    ...(object.fields.some(field => field.apiName === 'Channel_Account__c')
      ? {Channel_Account__c: phoneId} : {}),
    ...(object.fields.some(field => field.apiName === 'Chatter_Conversation_Id__c')
      ? {Chatter_Conversation_Id__c: JSON.stringify([phoneId, sender])} : {})
  };
}
