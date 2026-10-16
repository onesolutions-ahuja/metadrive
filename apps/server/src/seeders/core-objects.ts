import { randomUUID } from 'node:crypto';
import type { ObjectMetadata, RuntimeRecord } from '../index.js';

/** Independent Core Object catalog and connector app defaults, applied only by tenant seeders. */
export function createCoreObjectSeedCatalog(deps: {
 connectorAppCatalog: { object: ObjectMetadata; packages: Record<string, unknown>[] };
 runtimeRecordSchema: { parse(value: unknown): RuntimeRecord };
}) {
 const { connectorAppCatalog, runtimeRecordSchema } = deps;
function ensureConnectorAppRecords(records: RuntimeRecord[] | undefined, ownerId: string): RuntimeRecord[] {
  const existing = [...(records ?? [])];
  const now = new Date().toISOString();
  for (const values of connectorAppCatalog.packages) {
    const position = existing.findIndex((record) => record.AppKey__c === values.AppKey__c);
    if (position >= 0) {
      const previous = existing[position];
      const added = Object.fromEntries(Object.entries(values).filter(([key]) => previous[key] === undefined));
      // Upgrade only the original placeholder history mapping, never tenant-customised views.
      const legacyPlaceholder = previous.RecordObject__c === 'Communication_Records__c'
        && previous.RecordFilterField__c === 'Source__c'
        && values.RecordObject__c === '' && values.RecordFilterField__c === '';
      existing[position] = runtimeRecordSchema.parse({
        ...previous, ...added,
        ...(legacyPlaceholder ? { RecordObject__c: '', RecordFilterField__c: '', RecordFilterValue__c: '' } : {}),
        // Upgrade only the shipped legacy WhatsApp probe; keep custom tenant test paths.
        ...(previous.AppKey__c === 'whatsapp' && previous.TestPath__c === '{!PhoneNumberId}'
          ? { TestPath__c: values.TestPath__c } : {})
      });
      continue;
    }
    existing.push(runtimeRecordSchema.parse({
      ...values, Id: randomUUID(), OwnerId: ownerId, RecordTypeId: 'master',
      CreatedDate: now, LastModifiedDate: now
    }));
  }
  return existing;
}
const baseObjects: ObjectMetadata[] = [
  connectorAppCatalog.object,
  { apiName: 'User', label: 'User', pluralLabel: 'Users', kind: 'Standard Object', description: 'Platform users who belong to this tenant.', fields: [
    { apiName: 'Name', label: 'Full Name', dataType: 'Text(121)', required: true, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: true, unique: true },
    { apiName: 'Username', label: 'Username', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false },
    { apiName: 'UserRoleId', label: 'User Role', dataType: 'Text(18)', required: false, unique: false }
  ] },
  { apiName: 'Account', label: 'Account', pluralLabel: 'Accounts', kind: 'Standard Object', description: 'Companies and organizations that you do business with.', fields: [
    { apiName: 'Name', label: 'Account Name', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Type', label: 'Account Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Prospect', 'Customer - Direct', 'Customer - Channel', 'Channel Partner / Reseller', 'Technology Partner', 'Other'], picklistRestricted: true },
    { apiName: 'Industry', label: 'Industry', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'], picklistRestricted: true },
    { apiName: 'AnnualRevenue', label: 'Annual Revenue', dataType: 'Currency(18, 0)', required: false, unique: false },
    { apiName: 'NumberOfEmployees', label: 'Employees', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'Website', label: 'Website', dataType: 'URL', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Account Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Accounts' } },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false }
  ] },
  { apiName: 'Contact', label: 'Contact', pluralLabel: 'Contacts', kind: 'Standard Object', description: 'People associated with your accounts.', fields: [
    { apiName: 'Name', label: 'Contact Name', dataType: 'Name', required: true, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Contacts' } },
    { apiName: 'Title', label: 'Title', dataType: 'Text(128)', required: false, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Contact Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'OwnedContacts' } }
  ], listViewButtons: ['New', 'Change Owner', 'Import', 'Add to Campaign'] },
  { apiName: 'Lead', label: 'Lead', pluralLabel: 'Leads', kind: 'Standard Object', description: 'Prospective customers and the sources that introduced them.', fields: [
    { apiName: 'FirstName', label: 'First Name', dataType: 'Text(40)', required: false, unique: false },
    { apiName: 'LastName', label: 'Last Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Company', label: 'Company', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Street', label: 'Street', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Title', label: 'Title', dataType: 'Text(128)', required: false, unique: false },
    { apiName: 'Email', label: 'Email', dataType: 'Email', required: false, unique: false },
    { apiName: 'Phone', label: 'Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', required: false, unique: false },
    { apiName: 'LeadSource', label: 'Lead Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'], picklistRestricted: true },
    { apiName: 'Status', label: 'Lead Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['New', 'Working', 'Qualified', 'Unqualified'], picklistRestricted: true, defaultValue: 'New' },
    { apiName: 'Industry', label: 'Industry', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities', 'Other'], picklistRestricted: true },
    { apiName: 'Rating', label: 'Rating', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Hot', 'Warm', 'Cold'], picklistRestricted: true },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'OwnerId', label: 'Lead Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Leads' } }
  ] },
  { apiName: 'Opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', kind: 'Standard Object', description: 'Potential revenue and deals in progress.', fields: [
    { apiName: 'Name', label: 'Opportunity Name', dataType: 'Text(120)', required: true, unique: false },
    { apiName: 'Type', label: 'Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Existing Business', 'New Business'], picklistRestricted: true },
    { apiName: 'LeadSource', label: 'Lead Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Other'], picklistRestricted: true },
    { apiName: 'Amount', label: 'Amount', dataType: 'Currency(16, 2)', required: false, unique: false },
    { apiName: 'CloseDate', label: 'Close Date', dataType: 'Date', required: true, unique: false },
    { apiName: 'NextStep', label: 'Next Step', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'StageName', label: 'Stage', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Id. Decision Makers', 'Perception Analysis', 'Proposal/Price Quote', 'Negotiation/Review', 'Closed Won', 'Closed Lost'], picklistRestricted: true },
    { apiName: 'Probability', label: 'Probability (%)', dataType: 'Percent(3, 0)', required: false, unique: false },
    { apiName: 'Fiscal', label: 'Fiscal Period', dataType: 'Text(30)', required: false, unique: false },
    { apiName: 'Age', label: 'Age', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'CreatedDate', label: 'Created Date', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Opportunities' } },
    { apiName: 'OwnerId', label: 'Opportunity Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Opportunities' } },
    { apiName: 'OwnerRole', label: 'Owner Role', dataType: 'Text(80)', required: false, unique: false }
  ] },
  { apiName: 'Case', label: 'Case', pluralLabel: 'Cases', kind: 'Standard Object', description: 'Customer questions, feedback, and product issues.', fields: [
    { apiName: 'CaseNumber', label: 'Case Number', dataType: 'Auto Number', required: true, unique: true },
    { apiName: 'Subject', label: 'Subject', dataType: 'Text(255)', required: true, unique: false },
    { apiName: 'Status', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['New', 'Working', 'Escalated', 'Closed'], picklistRestricted: true },
    { apiName: 'Priority', label: 'Case Priority', dataType: 'Picklist', required: true, unique: false, picklistValues: ['High', 'Medium', 'Low'], picklistRestricted: true },
    { apiName: 'CreatedDate', label: 'Date/Time Opened', dataType: 'DateTime', required: false, unique: false },
    { apiName: 'Age', label: 'Age', dataType: 'Number(8, 0)', required: false, unique: false },
    { apiName: 'IsOpen', label: 'Open', dataType: 'Checkbox', required: false, unique: false },
    { apiName: 'IsClosed', label: 'Closed', dataType: 'Checkbox', required: false, unique: false },
    { apiName: 'AccountId', label: 'Account Name', dataType: 'Lookup(Account)', required: false, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Cases' } },
    { apiName: 'OwnerId', label: 'Case Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'OwnedCases' } }
  ] },
  { apiName: 'Campaign', label: 'Campaign', pluralLabel: 'Campaigns', kind: 'Standard Object', description: 'Marketing initiatives and their associated contacts.', fields: [
    { apiName: 'Name', label: 'Campaign Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Type', label: 'Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Conference', 'Webinar', 'Email', 'Advertisement', 'Direct Mail', 'Other'], picklistRestricted: true },
    { apiName: 'Status', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Planned', 'In Progress', 'Completed', 'Aborted'], picklistRestricted: true, defaultValue: 'Planned' },
    { apiName: 'StartDate', label: 'Start Date', dataType: 'Date', required: false, unique: false },
    { apiName: 'EndDate', label: 'End Date', dataType: 'Date', required: false, unique: false },
    { apiName: 'IsActive', label: 'Active', dataType: 'Checkbox', required: true, unique: false, defaultValue: true },
    { apiName: 'OwnerId', label: 'Campaign Owner', dataType: 'Lookup(User)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'User', relationshipName: 'Owner', childRelationshipName: 'Campaigns' } }
  ] },
  { apiName: 'Renewal__c', label: 'Renewal', pluralLabel: 'Renewals', kind: 'Custom Object', description: 'Tracks upcoming customer contract renewals.', fields: [
    { apiName: 'Name', label: 'Renewal Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Account__c', label: 'Account', dataType: 'Lookup(Account)', required: true, unique: false, relationship: { type: 'Lookup', targetObject: 'Account', relationshipName: 'Account', childRelationshipName: 'Renewals' } },
    { apiName: 'Renewal_Date__c', label: 'Renewal Date', dataType: 'Date', required: true, unique: false },
    { apiName: 'ARR__c', label: 'Annual Recurring Revenue', dataType: 'Currency(16, 2)', required: false, unique: false }
  ] },
  { apiName: 'Communication_Records__c', label: 'Communication Records', pluralLabel: 'Communication Records', kind: 'Custom Object', description: 'Unified messages and API audit activity with metadata-driven channel filtering.', fields: [
    { apiName: 'Name', label: 'Communication ID', dataType: 'AutoNumber', required: true, unique: false },
    { apiName: 'Api_Id__c', label: 'API ID', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Url__c', label: 'URL', dataType: 'URL', required: false, unique: false },
    { apiName: 'Auth_Type__c', label: 'Authentication Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['None', 'Bearer', 'Basic', 'API Key', 'Other'], picklistRestricted: true },
    { apiName: 'Method__c', label: 'HTTP Method', dataType: 'Picklist', required: false, unique: false, picklistValues: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'], picklistRestricted: true },
    { apiName: 'Direction__c', label: 'Direction', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Incoming', 'Outgoing'], picklistRestricted: true },
    { apiName: 'Request_Body__c', label: 'Request Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Response_Body__c', label: 'Response Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Event_Type__c', label: 'Event Type', dataType: 'Picklist', required: false, unique: false, picklistValues: ['API Call', 'Message'], picklistRestricted: true },
    { apiName: 'Communication_Mode__c', label: 'Communication Mode', dataType: 'Picklist', required: false, unique: false, picklistValues: ['API', 'WhatsApp', 'SMS', 'Email', 'Other'], picklistRestricted: true },
    { apiName: 'Source__c', label: 'Source', dataType: 'Picklist', required: false, unique: false, picklistValues: ['API', 'Webhook', 'Flow', 'Other'], picklistRestricted: true },
    { apiName: 'Message_Body__c', label: 'Message Body', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'From_Number__c', label: 'From Number', dataType: 'Phone', required: false, unique: false },
    { apiName: 'To_Number__c', label: 'To Number', dataType: 'Phone', required: false, unique: false },
    { apiName: 'Conversation_Key__c', label: 'Conversation Key', dataType: 'Text(120)', required: false, unique: false },
    { apiName: 'Channel_Account__c', label: 'WhatsApp Channel Account', dataType: 'Text(120)', required: false, unique: false },
    { apiName: 'Assigned_User__c', label: 'Assigned User', dataType: 'Text(120)', required: false, unique: false },
    { apiName: 'Contact_Name__c', label: 'Contact Name', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Read_At__c', label: 'Read At', dataType: 'Date/Time', required: false, unique: false },
    { apiName: 'Media_URL__c', label: 'Media URL', dataType: 'URL', required: false, unique: false },
    { apiName: 'Media_Name__c', label: 'Media Name', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Media_Type__c', label: 'Media Type', dataType: 'Text(80)', required: false, unique: false },
    { apiName: 'Conversation_Context__c', label: 'Conversation Context', dataType: 'Text(80)', required: false, unique: false },
    { apiName: 'Status__c', label: 'Processing Status', dataType: 'Picklist', required: false, unique: false, picklistValues: ['Received', 'Pending', 'Processing', 'Sent', 'Completed', 'Failed', 'Expired'], picklistRestricted: true },
    { apiName: 'Provider_Message_Id__c', label: 'Provider Message ID', dataType: 'Text(255)', required: false, unique: false },
    { apiName: 'Status_Code__c', label: 'HTTP Status Code', dataType: 'Number(3, 0)', required: false, unique: false },
    { apiName: 'Error__c', label: 'Error', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Duration_Ms__c', label: 'Duration (ms)', dataType: 'Number(12, 0)', required: false, unique: false },
    { apiName: 'Occurred_At__c', label: 'Occurred At', dataType: 'Date/Time', required: false, unique: false }
  ], settings: {
    allowReports: true, allowActivities: false, trackFieldHistory: false, allowInChatter: false,
    deploymentStatus: 'Deployed', recordNameType: 'Auto Number', recordNameFormat: 'ONECOM-{000000000000000000000}'
  }, searchLayouts: { searchResults: ['Name', 'Api_Id__c', 'Url__c', 'Auth_Type__c', 'Method__c', 'Direction__c', 'Request_Body__c', 'Response_Body__c', 'Source__c', 'Status_Code__c', 'Error__c', 'Duration_Ms__c', 'Occurred_At__c'] },
    listViewFilter: { fieldApiName: 'Event_Type__c', value: 'API Call' } },
  { apiName: 'ConnectorProvider__c', label: 'Connector Provider', pluralLabel: 'Connector Providers', kind: 'Standard Object', description: 'Metadata definitions for external API connector providers.', fields: [
    { apiName: 'Name', label: 'Provider Name', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'ConnectorKey__c', label: 'Connector Key', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'AuthType__c', label: 'Authentication Type', dataType: 'Picklist', required: true, unique: false, picklistValues: ['NONE', 'BEARER', 'BASIC', 'API_KEY'], picklistRestricted: true },
    { apiName: 'BaseUrl__c', label: 'Base URL', dataType: 'URL', required: true, unique: false },
    { apiName: 'AuthCredential__c', label: 'Authentication Credential Field', dataType: 'Text(80)', required: false, unique: false },
    { apiName: 'CredentialsSchema__c', label: 'Credentials Schema', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Operations__c', label: 'Operations', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Test__c', label: 'Connection Test', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'TimeoutMs__c', label: 'Timeout (ms)', dataType: 'Number(9, 0)', required: true, unique: false, defaultValue: 30000 },
    { apiName: 'RetryPolicy__c', label: 'Retry Policy', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['ACTIVE', 'INACTIVE'], picklistRestricted: true, defaultValue: 'ACTIVE' }
  ] },
  { apiName: 'IntegrationConnection__c', label: 'Integration Connection', pluralLabel: 'Integration Connections', kind: 'Standard Object', description: 'Tenant-owned configured connections to external connector providers.', fields: [
    { apiName: 'Name', label: 'Connection Name', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'ConnectorKey__c', label: 'Connector Key', dataType: 'Text(80)', required: true, unique: false },
    { apiName: 'Configuration__c', label: 'Connector Configuration', dataType: 'Long Text Area', required: false, unique: false },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['ACTIVE', 'INACTIVE'], picklistRestricted: true, defaultValue: 'ACTIVE' },
    { apiName: 'TestStatus__c', label: 'Test Status', dataType: 'Text(30)', required: false, unique: false },
    { apiName: 'LastTestedAt__c', label: 'Last Tested At', dataType: 'Date/Time', required: false, unique: false }
  ] },
  { apiName: 'UneConnector__c', label: 'Une Connector', pluralLabel: 'Une Connectors', kind: 'Standard Object', description: 'Legacy connector settings records.', fields: [
    { apiName: 'Name', label: 'Connector Name', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'ConnectorType__c', label: 'Connector Type', dataType: 'Text(80)', required: true, unique: true },
    { apiName: 'Status__c', label: 'Status', dataType: 'Picklist', required: true, unique: false, picklistValues: ['Not Configured', 'Configured'], picklistRestricted: true, defaultValue: 'Not Configured' },
    { apiName: 'Configuration__c', label: 'Configuration Values', dataType: 'Long Text Area', required: false, unique: false, description: 'Connector configuration values stored as JSON metadata.' }
  ] }
];

 return { ensureConnectorAppRecords, baseObjects };
}
