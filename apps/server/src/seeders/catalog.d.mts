/** Signed metadata descriptions for globally reusable One-* Core components. */
export type CoreComponentDescriptor = {
  apiName: string;
  label: string;
  description: string;
  surfaces: Array<'page' | 'dashboard' | 'flow'>;
  resize: { defaultWidth: number; defaultHeight: number; minWidth: number; minHeight: number };
  jsxFile: string;
  cssFile: string;
  version: number;
  propertyDefinitions: Array<{
    propertyKey: string;
    label: string;
    kind: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'COLOR' | 'IMAGE' | 'SELECT' | 'OBJECT_FIELD' | 'FLOW' | 'CURRENCY';
    required?: boolean;
    isBindable?: boolean;
    displayOrder?: number;
    defaultValue?: string | number | boolean;
    choices?: Array<{ key: string; label: string }>;
  }>;
};

export function loadAppSeedCatalog(): {
  packages: Array<{ appKey: string; [key: string]: any }>;
  /** Registered without app installation; license and app lifecycle are separate. */
  coreComponents: CoreComponentDescriptor[];
  retiredPackages?: unknown[];
  retiredTrustedComponentPrefixes?: string[];
};
