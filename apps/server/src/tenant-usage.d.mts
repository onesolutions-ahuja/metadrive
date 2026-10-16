export declare function tenantUsageSnapshot(input: {
  tenantId: string; tenant: unknown;
  users: Array<{ tenantId: string; disabled?: boolean }>;
  registry: unknown; now?: Date;
}): {
  tenantId: string; status: string; sampledAt: string;
  counts: Record<string, number>; targets: Record<string, number>;
  warnings: string[]; enforcement: 'advisory_only'; storageBytes: null;
};
