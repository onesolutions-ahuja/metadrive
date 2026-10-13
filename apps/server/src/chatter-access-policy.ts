/** Tenant-scoped authorisation policy for Chatter connection and conversation records.
 * Call on the server after authentication and before returning records or performing Flow actions.
 * This helper never trusts client-supplied user ids, channel ids or canViewAll flags.
 */
export type ChatterGrant = {
  userId: string;
  channelAccountId: string;
  canRead: boolean;
  canSend: boolean;
  canAssign: boolean;
};
export type ChatterScope = {
  tenantId: string;
  userId: string;
  viewAllConversations: boolean;
  grants: ChatterGrant[];
};
export type ChatterConversation = {
  tenantId: string;
  channelAccountId: string;
  assignedUserId?: string | null;
};
export type ChatterOperation = 'read' | 'send' | 'assign';

export function canAccessChatterConversation(
  principal: ChatterScope,
  conversation: ChatterConversation,
  operation: ChatterOperation
): boolean {
  if (!principal.tenantId || !principal.userId ||
      principal.tenantId !== conversation.tenantId ||
      !conversation.channelAccountId) return false;
  const grant = principal.grants.find(row =>
    row.userId === principal.userId && row.channelAccountId === conversation.channelAccountId);
  if (!grant) return false;
  if (operation === 'send' && !grant.canSend) return false;
  if (operation === 'assign' && !grant.canAssign) return false;
  if (operation === 'read' && !grant.canRead) return false;
  return principal.viewAllConversations ||
    conversation.assignedUserId === principal.userId ||
    conversation.assignedUserId == null;
}

export function filterChatterConversations<T extends ChatterConversation>(
  principal: ChatterScope,
  conversations: T[]
): T[] {
  return conversations.filter(row => canAccessChatterConversation(principal, row, 'read'));
}
