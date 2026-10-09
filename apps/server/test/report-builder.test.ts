import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminEmail = 'report-builder@report-builder.test';
const adminPassword = 'Report-Builder-Test-Password-2026!';

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startApi(port: number, dataPath: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      METADRIVE_DATA_PATH: dataPath,
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'report-test-key': Buffer.alloc(32, 7).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'report-test-key',
      METADRIVE_SMTP_TEST_MODE: 'true',
      METADRIVE_BOOTSTRAP_TENANT_ID: 'report-builder-test',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Report Builder Test',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: adminPassword
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  const healthUrl = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test API exited during startup:\n${logs}`);
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`Test API did not become ready:\n${logs}`);
}

async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);
}

test('Trailhead report defaults and grouped Leads by Lead Source dashboard source execute', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-report-builder-'));
  const port = await availablePort();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, path.join(dataDirectory, 'state.json'));
    const root = `http://127.0.0.1:${port}/api`;
    const send = async (pathName: string, token?: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${root}${pathName}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) as Record<string, any> : {} };
    };
    const login = await send('/auth/login', undefined, 'POST', { email: adminEmail, password: adminPassword });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = login.data.access_token as string;

    const opportunity = await send('/records/Opportunity', token, 'POST', {
      Name: 'Trailhead Default Columns Opportunity',
      Type: 'New Business',
      LeadSource: 'Web',
      Amount: 125000,
      CloseDate: '2026-12-31',
      NextStep: 'Prepare proposal',
      StageName: 'Prospecting',
      Probability: 50
    });
    assert.equal(opportunity.status, 201, JSON.stringify(opportunity.data));

    const fields = [
      'Name', 'Type', 'LeadSource', 'Amount', 'CloseDate', 'NextStep', 'StageName',
      'Probability', 'Fiscal', 'Age', 'CreatedDate', 'OwnerId', 'OwnerRole', 'AccountId'
    ];
    const saved = await send('/metadata/reports/Trailhead_Opportunity', token, 'PUT', {
      label: 'Trailhead Opportunity',
      description: '',
      objectApiName: 'Opportunity',
      fieldApiNames: fields,
      groupByFieldApiNames: [],
      filters: [],
      standardFilters: {
        showMe: 'All',
        dateFieldApiName: 'CreatedDate',
        dateRange: 'All Time',
        statusFieldApiName: 'StageName',
        statusSelection: 'Open'
      },
      rowLimit: { limit: 5001, sortFieldApiName: 'Name', sortDirection: 'Ascending' }
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.report.standardFilters.dateFieldApiName, 'CreatedDate');
    assert.equal(saved.data.report.reportType, 'Standard');
    assert.equal(saved.data.report.rowLimit.limit, 5001, 'tabular row limits are not capped at an undocumented maximum');
    const unsavedPreview = await send('/reports/preview', token, 'POST', {
      report: { ...saved.data.report, label: 'Unsaved Opportunity Preview', description: 'Preview-only edit' }
    });
    assert.equal(unsavedPreview.status, 200, JSON.stringify(unsavedPreview.data));
    assert.equal(unsavedPreview.data.report.label, 'Unsaved Opportunity Preview');
    assert.ok(unsavedPreview.data.rows.some((item: { Name: string }) =>
      item.Name === 'Trailhead Default Columns Opportunity'));
    const persistedReports = await send('/metadata/reports', token);
    assert.equal(persistedReports.data.reports.find((item: { apiName: string }) =>
      item.apiName === 'Trailhead_Opportunity')?.label, 'Trailhead Opportunity',
    'preview-only edits must not change the persisted report definition');
    const invalidPreview = await send('/reports/preview', token, 'POST', {
      report: { ...saved.data.report, fieldApiNames: ['Missing_Report_Field'] }
    });
    assert.equal(invalidPreview.status, 400, 'preview rejects stale fields with an explicit validation error');
    for (const reportType of ['Joined', 'Historical Trend']) {
      const unsupportedSource = await send(`/metadata/reports/Unsupported_${reportType.replaceAll(' ', '_')}`, token, 'PUT', {
        ...saved.data.report,
        reportType
      });
      assert.equal(unsupportedSource.status, 400,
        `${reportType} reports must not be saved as dashboard source reports`);
    }
    const run = await send('/reports/Trailhead_Opportunity/run', token, 'POST', { limit: 5000 });
    assert.equal(run.status, 200, JSON.stringify(run.data));
    const row = run.data.rows.find((item: { Name: string }) => item.Name === 'Trailhead Default Columns Opportunity');
    assert.ok(row, 'Created Date and Open status filters retain the newly created opportunity');
    assert.equal(row.Fiscal, 'FY2026 Q4');
    assert.equal(typeof row.Age, 'number');
    assert.ok(Number.isFinite(Date.parse(row.CreatedDate)));
    assert.equal(row.OwnerId, login.data.user.name);
    assert.equal(typeof row.OwnerRole, 'string');

    const directCustomer = await send('/records/Account', token, 'POST', {
      Name: 'Trailhead Direct Customer Account',
      Type: 'Customer - Direct'
    });
    assert.equal(directCustomer.status, 201, JSON.stringify(directCustomer.data));
    const closedCustomer = await send('/records/Account', token, 'POST', {
      Name: 'Trailhead Closed Opportunity Account',
      Type: 'Prospect'
    });
    assert.equal(closedCustomer.status, 201, JSON.stringify(closedCustomer.data));
    const noOpportunityAccount = await send('/records/Account', token, 'POST', {
      Name: 'Trailhead Account Without Opportunities',
      Type: 'Prospect'
    });
    assert.equal(noOpportunityAccount.status, 201, JSON.stringify(noOpportunityAccount.data));
    const earlyStageOpportunity = await send('/records/Opportunity', token, 'POST', {
      Name: 'Trailhead Early Stage Opportunity',
      AccountId: directCustomer.data.record.Id,
      StageName: 'Prospecting',
      Amount: 100000,
      CloseDate: '2026-12-31'
    });
    assert.equal(earlyStageOpportunity.status, 201, JSON.stringify(earlyStageOpportunity.data));
    const wonOpportunity = await send('/records/Opportunity', token, 'POST', {
      Name: 'Trailhead Closed Won Opportunity',
      AccountId: closedCustomer.data.record.Id,
      StageName: 'Closed Won',
      Amount: 200000,
      CloseDate: '2026-12-31'
    });
    assert.equal(wonOpportunity.status, 201, JSON.stringify(wonOpportunity.data));
    const directCustomerReport = await send('/metadata/reports/Trailhead_Direct_Customer_Accounts', token, 'PUT', {
      label: 'Direct Customer Accounts',
      description: 'Direct customers for the current report owner.',
      objectApiName: 'Account',
      fieldApiNames: ['Name', 'Type'],
      groupByFieldApiNames: [],
      filters: [{ id: 'direct-customer', fieldApiName: 'Type', operator: 'Equals', value: 'Customer - Direct' }],
      standardFilters: {
        showMe: 'My',
        dateFieldApiName: 'CreatedDate',
        dateRange: 'All Time',
        statusFieldApiName: null,
        statusSelection: 'All'
      },
      folderName: 'Public Reports'
    });
    assert.equal(directCustomerReport.status, 200, JSON.stringify(directCustomerReport.data));
    const directCustomerRun = await send('/reports/Trailhead_Direct_Customer_Accounts/run', token, 'POST', { limit: 100 });
    assert.equal(directCustomerRun.status, 200, JSON.stringify(directCustomerRun.data));
    assert.deepEqual(directCustomerRun.data.rows.map((item: { Name: string }) => item.Name),
      ['Trailhead Direct Customer Account']);

    const earlyStageAccountsReport = await send('/metadata/reports/Trailhead_Early_Stage_Accounts', token, 'PUT', {
      label: 'Accounts with Early Stage Opportunities',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name'],
      groupByFieldApiNames: [],
      filters: [],
      crossFilters: [{
        id: 'early-stage-opportunities',
        childObjectApiName: 'Opportunity',
        mode: 'With',
        filters: [{
          id: 'early-stage-values',
          fieldApiName: 'StageName',
          operator: 'Equals',
          value: '',
          values: ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition'],
          locked: false
        }]
      }]
    });
    assert.equal(earlyStageAccountsReport.status, 200, JSON.stringify(earlyStageAccountsReport.data));
    const earlyStageAccountsRun = await send('/reports/Trailhead_Early_Stage_Accounts/run', token, 'POST', { limit: 100 });
    assert.equal(earlyStageAccountsRun.status, 200, JSON.stringify(earlyStageAccountsRun.data));
    assert.deepEqual(earlyStageAccountsRun.data.rows.map((item: { Name: string }) => item.Name),
      ['Trailhead Direct Customer Account'],
    'Accounts with Opportunities cross-filters apply the multi-value child Stage filter to real Opportunity relationships');

    const accountsWithoutOpportunitiesReport = await send('/metadata/reports/Trailhead_Accounts_Without_Opportunities', token, 'PUT', {
      label: 'Accounts without Opportunities',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name'],
      groupByFieldApiNames: [],
      filters: [],
      crossFilters: [{
        id: 'without-opportunities',
        childObjectApiName: 'Opportunity',
        mode: 'Without',
        filters: []
      }]
    });
    assert.equal(accountsWithoutOpportunitiesReport.status, 200, JSON.stringify(accountsWithoutOpportunitiesReport.data));
    const accountsWithoutOpportunitiesRun = await send('/reports/Trailhead_Accounts_Without_Opportunities/run', token, 'POST', { limit: 100 });
    assert.equal(accountsWithoutOpportunitiesRun.status, 200, JSON.stringify(accountsWithoutOpportunitiesRun.data));
    assert.deepEqual(accountsWithoutOpportunitiesRun.data.rows.map((item: { Name: string }) => item.Name),
      ['Trailhead Account Without Opportunities']);

    const reorderedFieldApiNames = [...fields].reverse();
    const reorderedReport = await send('/metadata/reports/Trailhead_Reordered_Columns', token, 'PUT', {
      ...saved.data.report,
      fieldApiNames: reorderedFieldApiNames
    });
    assert.equal(reorderedReport.status, 200, JSON.stringify(reorderedReport.data));
    assert.deepEqual(reorderedReport.data.report.fieldApiNames, reorderedFieldApiNames,
      'saved report definitions retain the configured column order');
    const reorderedRun = await send('/reports/Trailhead_Reordered_Columns/run', token, 'POST', { limit: 10 });
    assert.equal(reorderedRun.status, 200, JSON.stringify(reorderedRun.data));
    assert.deepEqual(reorderedRun.data.report.fieldApiNames, reorderedFieldApiNames,
      'run results preserve the configured column order');

    for (const [name, type, closeDate, amount] of [
      ['Trailhead Matrix March', 'New Business', '2026-03-31', 100000],
      ['Trailhead Matrix April', 'Existing Business', '2026-04-30', 200000]
    ] as const) {
      const matrixOpportunity = await send('/records/Opportunity', token, 'POST', {
        Name: name,
        Type: type,
        Amount: amount,
        CloseDate: closeDate,
        StageName: 'Closed Won',
        Probability: 100
      });
      assert.equal(matrixOpportunity.status, 201, JSON.stringify(matrixOpportunity.data));
    }
    const opportunityMatrixReport = await send('/metadata/reports/Trailhead_Opportunity_Matrix', token, 'PUT', {
      label: 'Opportunities by Sum of Amount',
      description: '',
      objectApiName: 'Opportunity',
      fieldApiNames: ['Name', 'Type', 'Amount', 'CloseDate', 'StageName'],
      groupByFieldApiNames: ['CloseDate'],
      format: 'Matrix',
      columnGroupByFieldApiName: 'Type',
      filters: [{
        id: 'matrix-example-records',
        fieldApiName: 'Name',
        operator: 'Contains',
        value: 'Trailhead Matrix',
        values: [],
        locked: false
      }],
      standardFilters: {
        showMe: 'All',
        dateFieldApiName: 'CloseDate',
        dateRange: 'All Time',
        statusFieldApiName: 'StageName',
        statusSelection: 'Closed Won'
      },
      summaryOperations: { Amount: ['Sum'] },
      dateGroupings: { CloseDate: 'Month' },
      showDetails: false
    });
    assert.equal(opportunityMatrixReport.status, 200, JSON.stringify(opportunityMatrixReport.data));
    const opportunityMatrixRun = await send('/reports/Trailhead_Opportunity_Matrix/run', token, 'POST', { limit: 5000 });
    assert.equal(opportunityMatrixRun.status, 200, JSON.stringify(opportunityMatrixRun.data));
    assert.equal(opportunityMatrixRun.data.rows.length, 0, 'the demonstrated matrix workflow can hide detail rows');
    assert.equal(opportunityMatrixRun.data.summaryTotals.rowCount, 2);
    assert.equal(opportunityMatrixRun.data.summaryRows.length, 2);
    assert.equal(opportunityMatrixRun.data.summaryRows.find((group: {
      groupValues: Record<string, unknown>;
    }) => group.groupValues.CloseDate === '2026-03'
      && group.groupValues.Type === 'New Business')?.sums.Amount, 100000);
    assert.equal(opportunityMatrixRun.data.summaryRows.find((group: {
      groupValues: Record<string, unknown>;
    }) => group.groupValues.CloseDate === '2026-04'
      && group.groupValues.Type === 'Existing Business')?.sums.Amount, 200000);

    const uncappedFilters = Array.from({ length: 21 }, (_, index) => ({
      id: `uncapped-field-filter-${index + 1}`,
      fieldApiName: 'Name',
      operator: 'Equals',
      value: String(index + 1),
      values: [],
      locked: false
    }));
    const uncappedCrossFilters = Array.from({ length: 4 }, (_, index) => ({
      id: `uncapped-cross-filter-${index + 1}`,
      childObjectApiName: 'Opportunity',
      mode: 'With',
      filters: []
    }));
    const uncappedReport = await send('/metadata/reports/Trailhead_Uncapped_Filters', token, 'PUT', {
      label: 'Report with More Filters',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name'],
      groupByFieldApiNames: [],
      format: 'Tabular',
      filters: uncappedFilters,
      crossFilters: uncappedCrossFilters
    });
    assert.equal(uncappedReport.status, 200, JSON.stringify(uncappedReport.data));
    assert.equal(uncappedReport.data.report.filters.length, 21);
    assert.equal(uncappedReport.data.report.crossFilters.length, 4);
    const uncappedRun = await send('/reports/Trailhead_Uncapped_Filters/run', token, 'POST', {
      limit: 100,
      reportFilterOverrides: uncappedFilters.map((filter, index) => ({
        id: filter.id,
        value: String(index + 1)
      }))
    });
    assert.equal(uncappedRun.status, 200, JSON.stringify(uncappedRun.data));

    for (const [lastName, company, leadSource] of [
      ['Partner Lead One', 'Trailhead Partner One', 'Partner Referral'],
      ['Partner Lead Two', 'Trailhead Partner Two', 'Partner Referral'],
      ['Web Lead', 'Trailhead Web', 'Web']
    ] as const) {
      const lead = await send('/records/Lead', token, 'POST', {
        FirstName: 'Trailhead',
        LastName: lastName,
        Company: company,
        Title: 'Sales Representative',
        Rating: 'Warm',
        Street: '1 Market Street',
        Email: `${lastName.replaceAll(' ', '.').toLowerCase()}@example.test`,
        LeadSource: leadSource,
        Status: 'New'
      });
      assert.equal(lead.status, 201, JSON.stringify(lead.data));
    }
    const leadReport = await send('/metadata/reports/Trailhead_Leads_by_Source', token, 'PUT', {
      label: 'Leads by Lead Source',
      description: '',
      objectApiName: 'Lead',
      fieldApiNames: ['OwnerId', 'FirstName', 'LastName', 'Title', 'Company', 'Rating', 'Street', 'Email', 'LeadSource', 'CreatedDate'],
      groupByFieldApiNames: ['LeadSource'],
      format: 'Summary',
      filters: [],
      standardFilters: {
        showMe: 'All',
        dateFieldApiName: 'CreatedDate',
        dateRange: 'All Time',
        statusFieldApiName: 'Status',
        statusSelection: 'All'
      },
      showChart: true,
      chartType: 'Donut'
    });
    assert.equal(leadReport.status, 200, JSON.stringify(leadReport.data));
    const leadReportRun = await send('/reports/Trailhead_Leads_by_Source/run', token, 'POST', { limit: 5000 });
    assert.equal(leadReportRun.status, 200, JSON.stringify(leadReportRun.data));
    assert.equal(leadReportRun.data.summaryTotals.rowCount, 3);
    assert.ok(leadReportRun.data.summaryRows.some((group: { groupValues: Record<string, unknown>; rowCount: number }) =>
      group.groupValues.LeadSource === 'Partner Referral' && group.rowCount === 2));
    assert.ok(leadReportRun.data.summaryRows.some((group: { groupValues: Record<string, unknown>; rowCount: number }) =>
      group.groupValues.LeadSource === 'Web' && group.rowCount === 1));
    const trailheadLeadRow = leadReportRun.data.rows.find((item: { LastName: string }) => item.LastName === 'Partner Lead One');
    assert.equal(trailheadLeadRow.Title, 'Sales Representative');
    assert.equal(trailheadLeadRow.Rating, 'Warm');
    assert.equal(trailheadLeadRow.Street, '1 Market Street');
    assert.equal(trailheadLeadRow.Email, 'partner.lead.one@example.test');

    const dashboard = await send('/metadata/dashboards/Trailhead_Leads_by_Source', token, 'PUT', {
      label: 'Leads by Lead Source Dashboard',
      description: '',
      folderName: 'Private Reports',
      visibility: 'Private',
      status: 'Deployed',
      filters: [],
      filterLogic: 'All',
      components: [{
        id: 'leads-by-source',
        title: 'Leads by Lead Source',
        type: 'Chart',
        reportApiName: 'Trailhead_Leads_by_Source',
        properties: {},
        objectApiName: 'Lead',
        aggregation: 'Count',
        measureFieldApiName: null,
        groupByFieldApiName: 'LeadSource',
        chartType: 'Donut',
        displayFieldApiNames: []
      }]
    });
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.data));
    const dashboardSnapshot = await send(
      '/metadata/dashboards/Trailhead_Leads_by_Source/snapshots',
      token,
      'POST',
      { label: 'Leads by source verification' }
    );
    assert.equal(dashboardSnapshot.status, 201, JSON.stringify(dashboardSnapshot.data));
    const leadChart = dashboardSnapshot.data.snapshot.components[0];
    assert.equal(leadChart.totalRows, 3);
    assert.ok(leadChart.buckets.some((bucket: { label: string; value: number }) =>
      bucket.label === 'Partner Referral' && bucket.value === 2));
    assert.ok(leadChart.buckets.some((bucket: { label: string; value: number }) =>
      bucket.label === 'Web' && bucket.value === 1));
    const invalidDashboardSourceEdit = await send('/metadata/reports/Trailhead_Leads_by_Source', token, 'PUT', {
      ...leadReport.data.report,
      groupByFieldApiNames: []
    });
    assert.equal(invalidDashboardSourceEdit.status, 409, JSON.stringify(invalidDashboardSourceEdit.data));
    assert.match(String(invalidDashboardSourceEdit.data.error), /dashboard component/i);
    assert.deepEqual((await send('/metadata/reports', token)).data.reports.find((report: { apiName: string }) =>
      report.apiName === 'Trailhead_Leads_by_Source').groupByFieldApiNames, ['LeadSource'],
    'rejecting an invalid source edit must preserve the original report definition');
    assert.equal((await send('/metadata/reports/Trailhead_Leads_by_Source', token, 'DELETE')).status, 409,
      'a source report cannot be deleted while a dashboard still references it');

    const uncappedDashboard = await send('/metadata/dashboards/Uncapped_Dashboard_Metadata', token, 'PUT', {
      label: 'Uncapped Dashboard Metadata',
      description: '',
      folderName: 'Private Reports',
      visibility: 'Private',
      status: 'Draft',
      filterLogic: 'All',
      filters: Array.from({ length: 21 }, (_, index) => ({
        id: `dashboard-filter-${index}`,
        objectApiName: 'Lead',
        fieldApiName: 'LastName',
        operator: 'Contains',
        value: String(index)
      })),
      components: Array.from({ length: 25 }, (_, index) => ({
        id: `dashboard-component-${index}`,
        title: `Dashboard Metric ${index}`,
        type: 'Metric',
        properties: {},
        objectApiName: 'Lead',
        aggregation: 'Count',
        measureFieldApiName: null,
        groupByFieldApiName: null,
        chartType: 'Bar',
        displayFieldApiNames: []
      }))
    });
    assert.equal(uncappedDashboard.status, 200, JSON.stringify(uncappedDashboard.data));
    assert.equal(uncappedDashboard.data.dashboard.components.length, 25,
      'dashboard component metadata must not impose an undocumented count limit');
    assert.equal(uncappedDashboard.data.dashboard.filters.length, 21,
      'dashboard filter metadata must not impose an undocumented count limit');

    for (let index = 1; index <= 13; index += 1) {
      const lead = await send('/records/Lead', token, 'POST', {
        FirstName: 'Dashboard',
        LastName: `Chart Category ${index}`,
        Company: `Dashboard Chart Category ${index}`,
        LeadSource: 'Web',
        Status: 'New'
      });
      assert.equal(lead.status, 201, JSON.stringify(lead.data));
    }
    const categoryReport = await send('/metadata/reports/Trailhead_Dashboard_Chart_Categories', token, 'PUT', {
      label: 'Dashboard Chart Categories',
      description: '',
      objectApiName: 'Lead',
      fieldApiNames: ['Company', 'LeadSource'],
      groupByFieldApiNames: ['Company'],
      format: 'Summary',
      filters: [{
        id: 'category-leads-only',
        fieldApiName: 'Company',
        operator: 'Starts With',
        value: 'Dashboard Chart Category '
      }]
    });
    assert.equal(categoryReport.status, 200, JSON.stringify(categoryReport.data));
    const categoryDashboard = await send('/metadata/dashboards/Trailhead_Dashboard_Chart_Categories', token, 'PUT', {
      label: 'Dashboard Chart Categories',
      description: '',
      folderName: 'Private Reports',
      visibility: 'Private',
      status: 'Deployed',
      filterLogic: 'All',
      filters: [],
      components: [{
        id: 'all-chart-categories',
        title: 'All Chart Categories',
        type: 'Chart',
        reportApiName: 'Trailhead_Dashboard_Chart_Categories',
        properties: {},
        objectApiName: 'Lead',
        aggregation: 'Count',
        measureFieldApiName: null,
        groupByFieldApiName: 'Company',
        chartType: 'Donut',
        chartLimit: 20,
        displayFieldApiNames: []
      }]
    });
    assert.equal(categoryDashboard.status, 200, JSON.stringify(categoryDashboard.data));
    const categorySnapshot = await send(
      '/metadata/dashboards/Trailhead_Dashboard_Chart_Categories/snapshots',
      token,
      'POST',
      { label: 'All chart categories' }
    );
    assert.equal(categorySnapshot.status, 201, JSON.stringify(categorySnapshot.data));
    assert.equal(categorySnapshot.data.snapshot.components[0].buckets.length, 13,
      'dashboard chart settings and snapshots must preserve more than twelve source categories');
    const crossFilterSnapshot = await send(
      '/metadata/dashboards/Trailhead_Dashboard_Chart_Categories/snapshots',
      token,
      'POST',
      {
        label: 'More than ten cross-filters',
        crossFilters: Array.from({ length: 11 }, (_, index) => ({
          id: `cross-filter-${index}`,
          objectApiName: 'Lead',
          fieldApiName: 'Company',
          operator: 'Equals',
          value: `No matching company ${index}`
        }))
      }
    );
    assert.equal(crossFilterSnapshot.status, 201, JSON.stringify(crossFilterSnapshot.data));
    assert.equal(crossFilterSnapshot.data.snapshot.crossFilters.length, 11,
      'dashboard snapshots must preserve active cross-filters without an undocumented count limit');

    const closedCase = await send('/records/Case', token, 'POST', {
      Subject: 'Trailhead Closed Case',
      Status: 'Closed',
      Priority: 'High'
    });
    assert.equal(closedCase.status, 201, JSON.stringify(closedCase.data));
    for (const priority of ['Medium', 'Low']) {
      const caseRecord = await send('/records/Case', token, 'POST', {
        Subject: `Trailhead ${priority} Closed Case`,
        Status: 'Closed',
        Priority: priority
      });
      assert.equal(caseRecord.status, 201, JSON.stringify(caseRecord.data));
    }
    const caseFields = ['OwnerId', 'Subject', 'CreatedDate', 'Age', 'IsOpen', 'IsClosed', 'AccountId'];
    const savedCaseReport = await send('/metadata/reports/Trailhead_Closed_Cases', token, 'PUT', {
      label: 'Closed Cases for All Time',
      description: '',
      objectApiName: 'Case',
      fieldApiNames: caseFields,
      groupByFieldApiNames: ['Priority'],
      format: 'Summary',
      filters: [{ id: 'closed-only', fieldApiName: 'IsClosed', operator: 'Equals', value: 'true' }],
      standardFilters: {
        showMe: 'All',
        dateFieldApiName: 'CreatedDate',
        dateRange: 'All Time',
        statusFieldApiName: 'Status',
        statusSelection: 'All'
      },
      showDetails: true,
      folderName: 'Public Reports'
    });
    assert.equal(savedCaseReport.status, 200, JSON.stringify(savedCaseReport.data));
    assert.equal(savedCaseReport.data.report.folderName, 'Public Reports');
    assert.equal(savedCaseReport.data.report.format, 'Summary');
    const caseRun = await send('/reports/Trailhead_Closed_Cases/run', token, 'POST', { limit: 5000 });
    assert.equal(caseRun.status, 200, JSON.stringify(caseRun.data));
    const caseRow = caseRun.data.rows.find((item: { Subject: string }) => item.Subject === 'Trailhead Closed Case');
    assert.ok(caseRow, 'Closed Case report field filter includes the closed case');
    assert.equal(caseRow.IsOpen, false);
    assert.equal(caseRow.IsClosed, true);
    assert.equal(typeof caseRow.Age, 'number');
    assert.ok(Number.isFinite(Date.parse(caseRow.CreatedDate)));
    assert.equal(caseRun.data.summaryTotals.rowCount, 3);
    for (const priority of ['High', 'Medium', 'Low']) {
      assert.ok(caseRun.data.summaryRows.some((group: { groupValues: Record<string, unknown>; rowCount: number }) =>
        group.groupValues.Priority === priority && group.rowCount === 1),
      `the demonstrated Closed Cases report groups one case under ${priority} priority`);
    }
    assert.equal((await send(`/records/Case/${closedCase.data.record.Id}`, token, 'PUT', { Age: 99 })).status, 422,
      'computed report fields cannot be written as record data');

    for (const [name, industry, type, revenue] of [
      ['Subtotal Manufacturing Direct', 'Manufacturing', 'Customer - Direct', 100],
      ['Subtotal Manufacturing Prospect', 'Manufacturing', 'Prospect', 200],
      ['Subtotal Technology Prospect', 'Technology', 'Prospect', 300],
      ['Subtotal Manufacturing Blank Type', 'Manufacturing', undefined, 50]
    ] as const) {
      const account = await send('/records/Account', token, 'POST', {
        Name: name,
        Industry: industry,
        AnnualRevenue: revenue,
        ...(type ? { Type: type } : {})
      });
      assert.equal(account.status, 201, JSON.stringify(account.data));
    }
    const subtotalReport = await send('/metadata/reports/Trailhead_Group_Subtotals', token, 'PUT', {
      label: 'Trailhead Group Subtotals',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name', 'Industry', 'Type', 'AnnualRevenue'],
      groupByFieldApiNames: ['Industry', 'Type'],
      format: 'Summary',
      filters: [{ id: 'subtotal-records', fieldApiName: 'Name', operator: 'Starts With', value: 'Subtotal ' }],
      summaryOperations: { AnnualRevenue: ['Sum'] }
    });
    assert.equal(subtotalReport.status, 200, JSON.stringify(subtotalReport.data));
    const subtotalRun = await send('/reports/Trailhead_Group_Subtotals/run', token, 'POST', { limit: 5000 });
    assert.equal(subtotalRun.status, 200, JSON.stringify(subtotalRun.data));
    const manufacturingSubtotal = subtotalRun.data.subtotalRows.find((item: {
      groupLevel: number;
      groupValues: Record<string, unknown>;
    }) => item.groupLevel === 1 && item.groupValues.Industry === 'Manufacturing');
    assert.ok(manufacturingSubtotal, 'multi-level grouped reports return the parent-level subtotal');
    assert.equal(manufacturingSubtotal.rowCount, 3);
    assert.equal(manufacturingSubtotal.sums.AnnualRevenue, 350);
    assert.equal(subtotalRun.data.subtotalRows.some((item: {
      groupLevel: number;
      groupValues: Record<string, unknown>;
    }) => item.groupLevel === 1 && item.groupValues.Industry === 'Technology'), true);
    const threeLevelReport = await send('/metadata/reports/Trailhead_Three_Level_Subtotals', token, 'PUT', {
      label: 'Trailhead Three-Level Subtotals',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name', 'Industry', 'Type', 'CreatedDate', 'AnnualRevenue'],
      groupByFieldApiNames: ['Industry', 'Type', 'CreatedDate'],
      format: 'Summary',
      filters: [{ id: 'three-level-records', fieldApiName: 'Name', operator: 'Starts With', value: 'Subtotal ' }],
      dateGroupings: { CreatedDate: 'Month' },
      summaryOperations: { AnnualRevenue: ['Sum'] },
      showDetails: false,
      showChart: true
    });
    assert.equal(threeLevelReport.status, 200, JSON.stringify(threeLevelReport.data));
    const threeLevelRun = await send('/reports/Trailhead_Three_Level_Subtotals/run', token, 'POST', { limit: 5000 });
    assert.equal(threeLevelRun.status, 200, JSON.stringify(threeLevelRun.data));
    assert.equal(threeLevelRun.data.rows.length, 0, 'hidden details do not suppress group subtotal data');
    const threeLevelManufacturingSubtotal = threeLevelRun.data.subtotalRows.find((item: {
      groupLevel: number;
      groupValues: Record<string, unknown>;
    }) => item.groupLevel === 1 && item.groupValues.Industry === 'Manufacturing');
    assert.equal(threeLevelManufacturingSubtotal.rowCount, 3);
    assert.equal(threeLevelManufacturingSubtotal.sums.AnnualRevenue, 350);
    const blankTypeSubtotal = threeLevelRun.data.subtotalRows.find((item: {
      groupLevel: number;
      groupValues: Record<string, unknown>;
    }) => item.groupLevel === 2
      && item.groupValues.Industry === 'Manufacturing'
      && item.groupValues.Type === null);
    assert.equal(blankTypeSubtotal.rowCount, 1, 'null group values retain their own intermediate subtotal');
    assert.ok(threeLevelRun.data.summaryRows.some((item: {
      groupValues: Record<string, unknown>;
    }) => item.groupValues.Industry === 'Manufacturing'
      && item.groupValues.Type === null
      && /^\d{4}-\d{2}$/.test(String(item.groupValues.CreatedDate))),
    'date groupings normalize grouped DateTime values to their configured month');

    const matrixSubtotalReport = await send('/metadata/reports/Trailhead_Matrix_Subtotals', token, 'PUT', {
      label: 'Trailhead Matrix Subtotals',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name', 'Industry', 'Type', 'CreatedDate', 'AnnualRevenue'],
      groupByFieldApiNames: ['Industry', 'Type'],
      format: 'Matrix',
      columnGroupByFieldApiName: 'CreatedDate',
      filters: [{ id: 'matrix-subtotal-records', fieldApiName: 'Name', operator: 'Starts With', value: 'Subtotal ' }],
      dateGroupings: { CreatedDate: 'Month' },
      summaryOperations: { AnnualRevenue: ['Sum'] }
    });
    assert.equal(matrixSubtotalReport.status, 200, JSON.stringify(matrixSubtotalReport.data));
    const matrixSubtotalRun = await send('/reports/Trailhead_Matrix_Subtotals/run', token, 'POST', { limit: 5000 });
    assert.equal(matrixSubtotalRun.status, 200, JSON.stringify(matrixSubtotalRun.data));
    const matrixManufacturingSubtotal = matrixSubtotalRun.data.subtotalRows.find((item: {
      groupLevel: number;
      groupValues: Record<string, unknown>;
    }) => item.groupLevel === 1
      && item.groupValues.Industry === 'Manufacturing'
      && typeof item.groupValues.CreatedDate === 'string');
    assert.equal(matrixManufacturingSubtotal.rowCount, 3,
      'matrix subtotals are kept separate for each column group');
    assert.equal(matrixManufacturingSubtotal.sums.AnnualRevenue, 350);

    const invalidFilter = await send('/metadata/reports/Invalid_Report_Filter', token, 'PUT', {
      label: 'Invalid Report Filter',
      description: '',
      objectApiName: 'Opportunity',
      fieldApiNames: ['Name'],
      groupByFieldApiNames: [],
      filters: [{ id: 'wrong-operator', fieldApiName: 'Name', operator: 'Greater Than', value: 'A' }]
    });
    assert.equal(invalidFilter.status, 422);

    const statePath = path.join(dataDirectory, 'state.json');
    await stopApi(child);
    child = undefined;
    const legacyState = JSON.parse(await readFile(statePath, 'utf8')) as {
      tenants: Record<string, { objects: Array<{ apiName: string; fields: Array<{ apiName: string }> }> }>;
    };
    const legacyLead = legacyState.tenants['report-builder-test'].objects.find((object) => object.apiName === 'Lead');
    assert.ok(legacyLead, 'the persisted test tenant includes its standard Lead object');
    legacyLead.fields = legacyLead.fields.filter((field) => field.apiName !== 'Street');
    await writeFile(statePath, JSON.stringify(legacyState), 'utf8');
    child = await startApi(port, statePath);
    const migratedLogin = await send('/auth/login', undefined, 'POST', {
      email: adminEmail,
      password: adminPassword
    });
    assert.equal(migratedLogin.status, 200, JSON.stringify(migratedLogin.data));
    const migratedLeadMetadata = await send('/metadata/objects/Lead', migratedLogin.data.access_token, 'GET');
    assert.equal(migratedLeadMetadata.status, 200, JSON.stringify(migratedLeadMetadata.data));
    assert.ok(migratedLeadMetadata.data.object.fields.some((field: { apiName: string }) => field.apiName === 'Street'),
      'startup migration restores the standard Lead Street field to existing tenant metadata');
  } finally {
    if (child) await stopApi(child);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
