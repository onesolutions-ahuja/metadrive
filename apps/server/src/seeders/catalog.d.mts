export function loadAppSeedCatalog(): {
  packages: Array<{ appKey: string; [key: string]: any }>;
  retiredPackages?: unknown[];
  retiredTrustedComponentPrefixes?: string[];
};
