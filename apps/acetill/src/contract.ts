import {ACETILL} from './manifest.js';

/** Public data contract: only references existing authorised tenant objects.
 * A client must never query SQL directly or supply its own tenant id.
 */
export type AcetillSessionContext = Readonly<{
  authenticated: boolean;
  tenantResolved: boolean;
  entitled: boolean;
  installed: boolean;
  active: boolean;
  canUseRegister: boolean;
}>;

export type AcetillRoute = (typeof ACETILL.pages)[number]['apiName'];

export function canOpenAcetill(context: AcetillSessionContext): boolean {
  return context.authenticated && context.tenantResolved && context.entitled &&
    context.installed && context.active && context.canUseRegister;
}

export function isAcetillPage(apiName: string): apiName is AcetillRoute {
  return ACETILL.pages.some(page => page.apiName === apiName);
}

export function buildAcetillNavigation() {
  return ACETILL.pages.map((page, index) => ({
    entryType: 'App Page' as const,
    apiName: page.apiName,
    sortOrder: (index + 1) * 10
  }));
}
