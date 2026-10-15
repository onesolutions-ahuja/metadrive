/** A portal identity can use only its explicitly supported read endpoints.
 * This is an additional restriction: OneEngine object, record and field checks
 * still apply to every allowed request.
 */
export function externalIdentityRouteAllowed(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  return path === '/api/auth/me'
    || /^\/api\/records\/[A-Za-z0-9_]+(?:\/[A-Za-z0-9_-]+)?$/.test(path);
}
