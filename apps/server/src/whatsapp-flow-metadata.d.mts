/** TypeScript interface for the metadata-only WhatsApp migration; all flow fields remain strongly typed at call sites. */
export function repairWhatsappRouterMetadata<T>(input: T): { flow: T; changes: string[] };
export function publishRepairedWhatsappVersion<T>(existing: T, patchedFlow: T, savedAt: string): T;
