import { timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, RequestHandler } from 'express';

type PlatformPolicy = 'platform:superadmin' | 'licence:manage';
export function registerPlatformPolicyRoutes<User extends {id: string; email: string; disabled: boolean}, Principal extends {userId: string; permissions: string[]}>(app: Express, deps: {
  accessAuthentication: RequestHandler;
  getPrincipal: (res: Response) => Principal;
  principalUser: (principal: Principal) => User | undefined;
  activePlatformSuperadmins: () => string[];
  savePlatformPolicies: (actorId: string, userId: string, policies: PlatformPolicy[]) => void;
  getState: () => { users: User[]; platformPolicies: Record<string, PlatformPolicy[]> };
  parsePolicies: (value: unknown) => { success: boolean; data?: {policies: PlatformPolicy[]} };
  routeParam: (req: Request, name: string) => string;
}): void {
  const { accessAuthentication, getPrincipal, principalUser, activePlatformSuperadmins,
    savePlatformPolicies, getState, routeParam } = deps;
  const platformPolicySchema = {safeParse: deps.parsePolicies};
  // A tightly controlled one-time bootstrap is required for the first platform
  // operator. It cannot be initiated merely with tenant security:manage.
  app.post('/api/platform/policies/bootstrap', accessAuthentication, (req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const configuredEmail = process.env.METADRIVE_PLATFORM_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    const secret = process.env.METADRIVE_PLATFORM_BOOTSTRAP_KEY;
    if (!configuredEmail || !secret || secret.length < 24)
      return res.status(503).json({ error: 'Platform policy bootstrap is not configured.' });
    const user = principalUser(principal);
    if (!user || user.email.trim().toLowerCase() !== configuredEmail)
      return res.status(403).json({ error: 'Platform policy bootstrap is not permitted for this user.' });
    const supplied = req.header('x-platform-bootstrap-key');
    if (!supplied || supplied.length !== secret.length
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)))
      return res.status(403).json({ error: 'Invalid platform policy bootstrap credential.' });
    if (activePlatformSuperadmins().length)
      return res.status(409).json({ error: 'A platform administrator already exists.' });
    try {
      savePlatformPolicies(user.id, user.id, ['platform:superadmin']);
      return res.json({ policies: getState().platformPolicies[user.id] });
    } catch {
      return res.status(503).json({ error: 'Unable to persist platform policy.' });
    }
  });
  app.get('/api/platform/policies', accessAuthentication, (_req: Request, res: Response) => {
    const principal = getPrincipal(res);
    if (!principal.permissions.includes('platform:superadmin'))
      return res.status(403).json({ error: 'Platform administrator policy required.' });
    return res.json({ users: getState().users.filter((user) => (getState().platformPolicies[user.id] ?? []).length)
      .map((user) => ({ id: user.id, email: user.email, disabled: user.disabled, policies: getState().platformPolicies[user.id] })) });
  });
  app.put('/api/platform/policies/:userId', accessAuthentication, (req: Request, res: Response) => {
    const principal = getPrincipal(res);
    if (!principal.permissions.includes('platform:superadmin'))
      return res.status(403).json({ error: 'Platform administrator policy required.' });
    const parsed = platformPolicySchema.safeParse(req.body);
    if (!parsed.success || !parsed.data) return res.status(400).json({ error: 'Invalid platform policies.' });
    const userId = routeParam(req, 'userId');
    const target = getState().users.find((user) => user.id === userId && !user.disabled);
    if (!target) return res.status(404).json({ error: 'Active platform user not found.' });
    const requested = [...new Set(parsed.data.policies)];
    if ((getState().platformPolicies[userId] ?? []).includes('platform:superadmin')
      && !requested.includes('platform:superadmin')
      && activePlatformSuperadmins().every((id) => id === userId)) {
      return res.status(409).json({ error: 'The last active platform administrator cannot be removed.' });
    }
    try {
      savePlatformPolicies(principal.userId, userId, requested);
      return res.json({ userId, policies: requested });
    } catch {
      return res.status(503).json({ error: 'Unable to persist platform policies.' });
    }
  });
  
}
