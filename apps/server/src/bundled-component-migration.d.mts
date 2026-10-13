export type LegacyBundledComponent = {
  apiName?: string;
  tenantId?: string;
  trustedBundled?: boolean;
  jsxSource?: string;
  cssSource?: string;
};
export declare function sourceGitBlobSha(source: unknown): string;
export declare function bundledLegacyMigrationDecision(
  legacy: LegacyBundledComponent | null | undefined,
  apiName: string,
  bundledJsx: string,
  bundledCss: string
): 'preserve' | 'adopt-current' | 'upgrade-historical';
