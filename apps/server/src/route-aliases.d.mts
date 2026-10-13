export type RouteAlias = {
  appId: string; slug: string; kind: 'App Home' | 'App Page' | 'Record List';
  targetApiName: string; status: 'Active' | 'Disabled'; version: number;
  updatedAt?: string;
};
export declare const routeAliasKinds: Array<RouteAlias['kind']>;
export declare function validAliasSlug(value: unknown): value is string;
export declare function validRouteIdentifier(value: unknown): value is string;
export declare function validateRouteAliasInput(input: unknown): Omit<RouteAlias, 'version' | 'updatedAt'> & {expectedVersion: number};
export declare function routeAliasDestination(alias: RouteAlias, context: {
  apps: Array<{apiName: string; navigationPageApiNames?: string[]; navigationItems?: string[]}>;
  pages: Array<{apiName: string; pageType: string; status: string; activationAssignments?: Array<{appId: string | null}>}>;
  objects: Array<{apiName: string}>;
  canOpenApp: (apiName: string) => boolean;
  canOpenTab: (apiName: string) => boolean;
}): string | null;
export declare function rowToRouteAlias(row: Record<string, any>): RouteAlias;
