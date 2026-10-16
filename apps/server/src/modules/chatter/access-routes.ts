import type { Request, Response } from "express";
import type { ChatterAccessRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerChatterAccessRoutes(deps: ChatterAccessRoutesDependencies): void {
  deps.app.get('/api/chatter/access', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant || !deps.hasObjectPermission(principal, tenant, deps.communicationObjectApiName, 'read')) {
      return res.status(403).json({error:'Communication access denied'});
    }
    const scope = deps.chatterScopeForUser(principal.tenantId, principal.userId, tenant);
    res.setHeader('Cache-Control','private, no-store');
    const eligibleAssignees = scope.grants.filter(grant => grant.canAssign).flatMap(grant =>
      deps.state.users.filter(user => user.tenantId === principal.tenantId && !user.disabled
        && deps.chatterScopeForUser(principal.tenantId, user.id, tenant).grants.some(candidate =>
          candidate.channelAccountId === grant.channelAccountId && candidate.canRead))
        .map(user => ({id:user.id,name:user.name,channelAccountId:grant.channelAccountId})));
    return res.json({
      userId: principal.userId, viewAll: scope.viewAllConversations,
      eligibleAssignees,
      grants: scope.grants.filter(grant => grant.canRead).map(grant => ({
        channelAccountId:grant.channelAccountId,canRead:grant.canRead,
        canSend:grant.canSend,canAssign:grant.canAssign,viewAll:grant.viewAll === true
      }))
    });
  });
}
