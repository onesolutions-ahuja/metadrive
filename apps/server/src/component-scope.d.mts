export type ScopedLibraryComponent = { tenantId?: string; trustedBundled?: boolean };
export function libraryComponentVisible(component: ScopedLibraryComponent | undefined, tenantId: string, tenantIds: string[]): boolean;
export function libraryComponentEditable(component: ScopedLibraryComponent | undefined, tenantId: string, tenantIds: string[]): boolean;
