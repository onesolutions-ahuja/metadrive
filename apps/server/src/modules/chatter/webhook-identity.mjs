/** Map only trusted, signed Meta webhook metadata into Communication record fields.
 * The channel field remains optional until the tenant's metadata migration adds it.
 * Never accept channel identity from a page prop, Flow input, or user-supplied header.
 */
export function chatterIncomingIdentityFields(object, sender, displayPhone, phoneId) {
  if (typeof phoneId !== 'string' || !/^\\d{8,}$/.test(phoneId)) {
    throw new Error('Signed WhatsApp webhook did not contain a valid Phone Number ID');
  }
  return {
    Direction__c: 'Incoming',
    From_Number__c: sender,
    To_Number__c: displayPhone ?? '',
    ...(object.fields.some(field => field.apiName === 'Channel_Account__c')
      ? { Channel_Account__c: phoneId } : {})
  };
}
