import type {Response} from 'express';
import type {Principal} from '../../auth.js';

/** Single authenticated-principal accessor reused by platform API routes. */
export function getPrincipal(res: Response): Principal {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) throw new Error('Authenticated principal was not established');
  return principal;
}
