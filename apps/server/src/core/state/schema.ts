import { z } from 'zod';
import { defaultAutomationSettings } from '../../automation-policy.js';
import type { CreatePlatformStateSchemaDependencies } from '../../index.js';

export function createPlatformStateSchema(deps: CreatePlatformStateSchemaDependencies) {
  const tenantRegistryEntrySchema = z.object({
    domains: z.array(z.object({
      hostname: z.string().min(4).max(253), status: z.enum(['PENDING', 'VERIFIED', 'REVOKED']),
      verificationToken: z.string().regex(/^[0-9a-f]{64}$/),
      createdAt: z.string().datetime(), verifiedAt: z.string().datetime().optional(),
      revokedAt: z.string().datetime().optional()
    }).strict()).max(5000).optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).default(''),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']),
    archivedAt: z.string().datetime().optional(),
    retentionUntil: z.string().datetime().optional(),
    legalHold: z.boolean().optional(),
    usageTargets: z.object({
      users: z.number().int().min(1).max(1000000000).optional(),
      records: z.number().int().min(1).max(1000000000).optional(),
      objects: z.number().int().min(1).max(1000000000).optional(),
      flows: z.number().int().min(1).max(1000000000).optional()
    }).strict().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    provisioning: z.object({
      status: z.literal('READY'),
      version: z.number().int().min(1),
      completedAt: z.string().datetime()
    }).strict().optional(),
    provisioningRequestHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    developerSeed: z.object({
      userId: z.string().uuid(), email: z.string().email(),
      seededAt: z.string().datetime(), activatedAt: z.string().datetime().optional()
    }).strict().optional()
  }).strict();

  const tenantManagementAuditSchema = z.object({
    actorId: z.string(), tenantId: z.string(),
    action: z.enum(['CREATED','UPDATED','SUSPENDED','REACTIVATED','ARCHIVED','RESTORED','RETENTION_UPDATED','USAGE_TARGETS_UPDATED','DOMAIN_ADDED','DOMAIN_VERIFIED','DOMAIN_REMOVED']),
    at: z.string().datetime(),
    previous: tenantRegistryEntrySchema.optional(),
    next: tenantRegistryEntrySchema
  });

  const objectMetadataChangeSchema = z.object({
    objectApiName: z.string(), revision: z.number().int().nonnegative(),
    action: z.enum(['CREATED', 'UPDATED', 'DELETED', 'FIELD_CREATED', 'FIELD_UPDATED', 'FIELD_DELETED']),
    actorUserId: z.string(), at: z.string().datetime(),
    before: deps.objectSchema.optional(), after: deps.objectSchema.optional()
  });

  const stateSchema = z.object({
    tenantRegistry: z.record(tenantRegistryEntrySchema).default({}),
    tenantManagementAudit: z.array(tenantManagementAuditSchema).default([]),
    platformPolicies: z.record(z.array(z.enum(['platform:tenants:manage', 'platform:superadmin', 'licence:manage']))).default({}),
    platformPolicyAudit: z.array(z.object({
      actorId: z.string(), userId: z.string(), previous: z.array(z.string()),
      next: z.array(z.string()), at: z.string().datetime()
    })).default([]),
    libraryComponents: z.array(deps.libraryComponentSchema).default([]),
    tenants: z.record(z.object({
      passwordRecovery: z.object({ smtpCredentialId: z.string().default(''), fromEmail: z.string().default(''), policy: z.unknown().optional() })
        .default({ smtpCredentialId: '', fromEmail: '' }),
      securityAudit: z.array(z.object({
        id: z.string(), at: z.string().datetime(), actorUserId: z.string(), action: z.string(),
        targetUserId: z.string().optional(), details: z.record(z.string()).optional()
      })).default([]),
      mfaPolicy: z.object({ mode: z.enum(['Off', 'Optional', 'Required']) }).default({ mode: 'Off' }),
      objects: z.array(deps.objectSchema),
      metadataHistory: z.array(objectMetadataChangeSchema).default([]),
      flows: z.array(deps.flowSchema),
      platformEvents: z.array(deps.platformEventSchema).default([]),
      platformEventMessages: z.array(deps.platformEventMessageSchema).default([]),
      pages: z.array(deps.pageSchema),
      apps: z.array(deps.lightningAppSchema).default(deps.defaultLightningApps),
      dashboards: z.array(deps.dashboardSchema).default([]),
      dashboardFolders: z.array(deps.dashboardFolderSchema).default([]),
      reportFolders: z.array(deps.reportFolderSchema).default([]),
      dashboardTerritories: z.array(deps.dashboardTerritorySchema).default([]),
      dashboardSnapshots: z.array(deps.dashboardSnapshotSchema).default([]),
      dashboardSubscriptions: z.array(deps.dashboardSubscriptionSchema).default([]),
      reports: z.array(deps.reportSchema).default([]),
      accessControl: deps.accessControlSchema,
      sharingSettings: z.record(deps.sharingSettingSchema).default({}),
      companyProfile: z.object({logoUrl:z.string().url().max(2000).or(z.literal('')).optional(),legalName:z.string().max(120),tradingName:z.string().max(120),website:z.string().max(500),phone:z.string().max(50),email:z.union([z.literal(''),z.string().email()]),addressLine1:z.string().max(200),addressLine2:z.string().max(200),city:z.string().max(120),postcode:z.string().max(30),country:z.string().max(100),timezone:z.string().max(100),locale:z.string().max(50),description:z.string().max(1000)}).strict().optional(),
      currencySettings: deps.currencySettingsSchema.default({ corporateCurrency: 'USD', standardVatRate: 20, currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }] }),
      recordShares: z.array(deps.recordShareSchema).default([]),
      campaignMembers: z.array(deps.campaignMemberSchema).default([]),
      activities: z.array(deps.recordActivitySchema).default([]),
      chatterPosts: z.array(deps.chatterPostSchema).default([]),
      notifications: z.array(deps.customNotificationSchema).default([]),
      approvalRequests: z.array(deps.approvalRequestSchema).default([]),
      approvalProcesses: z.array(deps.approvalProcessSchema).default([]),
      records: z.record(z.array(deps.runtimeRecordSchema)).default({}),
      autoNumberSequences: z.record(z.number().int().nonnegative()).default({}),
      fieldHistory: z.array(deps.fieldHistoryEntrySchema).default([]),
      interviews: z.array(deps.flowInterviewSchema).default([]),
      flowLogs: z.array(deps.flowExecutionLogSchema).default([]),
      scheduleRuns: z.record(z.string().datetime()).default({}),
      scheduleRetries: z.record(deps.scheduleRetrySchema).default({}),
      automationSettings: deps.automationSettingsSchema.default(defaultAutomationSettings),
      namedCredentials: z.array(deps.namedCredentialSchema).default([]),
      emailAlerts: z.array(deps.emailAlertSchema).default([]),
      connectorSettings: z.array(deps.connectorSettingsSchema).default(deps.defaultConnectorSettings),
      connectorDefinitions: z.array(deps.connectorDefinitionSchema).default(deps.defaultConnectorDefinitions),
      integrationConnections: z.array(deps.integrationConnectionSchema).default([])
    })),
    users: z.array(z.object({
      id: z.string(), tenantId: z.string(), name: z.string(), email: z.string().email(),
      passwordSalt: z.string(), passwordHash: z.string(), role: z.string(),
      permissionSetIds: z.array(z.string()), permissionSetGroupIds: z.array(z.string()).default([]),
      disabled: z.boolean(), createdAt: z.string().datetime(),
      authRevokedBefore: z.number().int().nonnegative().optional(),
      mfaSecret: z.object({ keyId: z.string(), iv: z.string(), authTag: z.string(), ciphertext: z.string() }).optional(),
      mfaLastUsedStep: z.number().int().nonnegative().optional(),
      mfaVersion: z.number().int().nonnegative().optional(),
      authVersion: z.number().int().nonnegative().optional(),
      passwordReset: z.object({
        tokenHash: z.string().regex(/^(?:[0-9a-f]{64}|[0-9a-f]{32}:[0-9a-f]{64})$/),
        expiresAt: z.number().int().nonnegative()
      }).optional(),
      lockedUntil: z.number().int().nonnegative().optional()
    })),
    refreshSessions: z.array(z.object({
      tokenHash: z.string(), familyId: z.string(), userId: z.string(), tenantId: z.string(),
      expiresAt: z.number(), usedAt: z.number().nullable(), revokedAt: z.number().nullable(),
      mfaVerified: z.boolean().optional(),
      authVersion: z.number().int().nonnegative().optional()
    })),
    revokedAccessTokens: z.record(z.number())
  }).superRefine((state, context) => {
    const emails = new Set<string>();
    state.users.forEach((user, index) => {
      const normalizedEmail = user.email.trim().toLowerCase();
      if (emails.has(normalizedEmail)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['users', index, 'email'],
          message: `Email "${normalizedEmail}" must be unique across all tenants`
        });
      }
      emails.add(normalizedEmail);
    });
  });
  return { stateSchema };
}
