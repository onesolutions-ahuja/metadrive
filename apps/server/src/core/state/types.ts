import type { z } from 'zod';
import type { ObjectMetadataChange, ObjectMetadata, FlowMetadata, platformEventSchema, platformEventMessageSchema, PageMetadata, LightningApp, DashboardMetadata, DashboardFolder, ReportFolder, DashboardTerritory, DashboardSnapshot, DashboardSubscription, ReportMetadata, AccessControl, SharingSetting, CurrencySettings, RecordShare, CampaignMember, RecordActivity, ChatterPost, CustomNotification, ApprovalRequest, ApprovalProcess, RuntimeRecord, FieldHistoryEntry, FlowInterview, FlowExecutionLog, scheduleRetrySchema, automationSettingsSchema, StoredNamedCredential, EmailAlert, ConnectorSettings, ConnectorDefinition, IntegrationConnection, LibraryComponent } from '../../index.js';
export type TenantData = {
    metadataHistory?: ObjectMetadataChange[];
    passwordRecovery: {
        smtpCredentialId: string;
        fromEmail: string;
        policy?: unknown;
    };
    securityAudit: SecurityAuditEvent[];
    mfaPolicy: {
        mode: 'Off' | 'Optional' | 'Required';
    };
    objects: ObjectMetadata[];
    flows: FlowMetadata[];
    platformEvents: z.infer<typeof platformEventSchema>[];
    platformEventMessages: z.infer<typeof platformEventMessageSchema>[];
    pages: PageMetadata[];
    apps: LightningApp[];
    dashboards: DashboardMetadata[];
    dashboardFolders: DashboardFolder[];
    reportFolders: ReportFolder[];
    dashboardTerritories: DashboardTerritory[];
    dashboardSnapshots: DashboardSnapshot[];
    dashboardSubscriptions: DashboardSubscription[];
    reports: ReportMetadata[];
    accessControl: AccessControl;
    sharingSettings: Record<string, SharingSetting>;
    currencySettings: CurrencySettings;
    companyProfile?: { legalName: string; tradingName: string; website: string; phone: string; email: string; addressLine1: string; addressLine2: string; city: string; postcode: string; country: string; timezone: string; locale: string; description: string };
    recordShares: RecordShare[];
    campaignMembers: CampaignMember[];
    activities: RecordActivity[];
    chatterPosts: ChatterPost[];
    notifications: CustomNotification[];
    approvalRequests: ApprovalRequest[];
    approvalProcesses: ApprovalProcess[];
    records: Record<string, RuntimeRecord[]>;
    autoNumberSequences: Record<string, number>;
    fieldHistory: FieldHistoryEntry[];
    interviews: FlowInterview[];
    flowLogs: FlowExecutionLog[];
    scheduleRuns: Record<string, string>;
    scheduleRetries: Record<string, z.infer<typeof scheduleRetrySchema>>;
    automationSettings: z.infer<typeof automationSettingsSchema>;
    namedCredentials: StoredNamedCredential[];
    emailAlerts: EmailAlert[];
    connectorSettings: ConnectorSettings[];
    connectorDefinitions: ConnectorDefinition[];
    integrationConnections: IntegrationConnection[];
};
export type SecurityAuditEvent = {
    id: string;
    at: string;
    actorUserId: string;
    action: string;
    targetUserId?: string;
    details?: Record<string, string>;
};
export type MfaEncryptedSecret = {
    keyId: string;
    iv: string;
    authTag: string;
    ciphertext: string;
};
export type LocalUser = {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    passwordSalt: string;
    passwordHash: string;
    role: string;
    permissionSetIds: string[];
    permissionSetGroupIds: string[];
    disabled: boolean;
    createdAt: string;
    authRevokedBefore?: number;
    mfaSecret?: MfaEncryptedSecret;
    mfaLastUsedStep?: number;
    mfaVersion?: number;
    authVersion?: number;
    passwordReset?: {
        tokenHash: string;
        expiresAt: number;
    };
    lockedUntil?: number;
};
export type RefreshSession = {
    tokenHash: string;
    familyId: string;
    userId: string;
    tenantId: string;
    expiresAt: number;
    usedAt: number | null;
    revokedAt: number | null;
    mfaVerified?: boolean;
    authVersion?: number;
};
export type TenantDomainRecord = {
    hostname: string;
    status: 'PENDING' | 'VERIFIED' | 'REVOKED';
    verificationToken: string;
    createdAt: string;
    verifiedAt?: string;
    revokedAt?: string;
};
export type TenantRegistryEntry = {
    domains?: TenantDomainRecord[];
    name: string;
    description: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    archivedAt?: string;
    retentionUntil?: string;
    legalHold?: boolean;
    usageTargets?: {
        users?: number;
        records?: number;
        objects?: number;
        flows?: number;
    };
    createdAt: string;
    updatedAt: string;
    // The complete initial workspace and administrator commit together.
    provisioning?: {
        status: 'READY';
        version: number;
        completedAt: string;
    };
    provisioningRequestHash?: string;
    developerSeed?: {
        userId: string;
        email: string;
        seededAt: string;
        activatedAt?: string;
    };
};
export type TenantManagementAuditEvent = {
    actorId: string;
    tenantId: string;
    action: 'CREATED' | 'UPDATED' | 'SUSPENDED' | 'REACTIVATED' | 'ARCHIVED' | 'RESTORED' | 'RETENTION_UPDATED' | 'USAGE_TARGETS_UPDATED' | 'DOMAIN_ADDED' | 'DOMAIN_VERIFIED' | 'DOMAIN_REMOVED';
    at: string;
    previous?: TenantRegistryEntry;
    next: TenantRegistryEntry;
};
export type PlatformState = {
    // Central registry is controlled exclusively by platform policy, never tenant RBAC.
    tenantRegistry: Record<string, TenantRegistryEntry>;
    tenantManagementAudit: TenantManagementAuditEvent[];
    // Platform policies are outside tenant-managed profiles and permission sets.
    platformPolicies: Record<string, Array<'platform:superadmin' | 'licence:manage'>>;
    platformPolicyAudit: Array<{
        actorId: string;
        userId: string;
        previous: string[];
        next: string[];
        at: string;
    }>;
    tenants: Record<string, TenantData>;
    libraryComponents: LibraryComponent[];
    users: LocalUser[];
    refreshSessions: RefreshSession[];
    revokedAccessTokens: Record<string, number>;
};
