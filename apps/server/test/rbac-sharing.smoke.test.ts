import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/auth.js';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminEmail = 'admin@rbac-sharing-smoke.test';
const userPassword = 'RBAC-Smoke-Password-2026!';
const tenantId = 'rbac-sharing-smoke';
let apiLogs = '';

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startSmtpRelay(): Promise<{ server: Server; port: number; messages: string[] }> {
  const messages: string[] = [];
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 localhost ESMTP test relay\r\n');
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') throw error;
    });
    let buffer = '';
    let message = '';
    let receivingData = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      while (true) {
        if (receivingData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          message += buffer.slice(0, end + 2);
          buffer = buffer.slice(end + 5);
          messages.push(message);
          message = '';
          receivingData = false;
          socket.write('250 message accepted\r\n');
          continue;
        }
        const end = buffer.indexOf('\r\n');
        if (end < 0) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (/^EHLO /i.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n');
        else if (/^(HELO|MAIL FROM:|RCPT TO:|RSET)/i.test(line)) socket.write('250 accepted\r\n');
        else if (/^DATA$/i.test(line)) {
          receivingData = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (/^QUIT$/i.test(line)) {
          socket.write('221 closing connection\r\n');
          socket.end();
        } else socket.write('500 unsupported command\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start the SMTP test relay');
  return { server, port: address.port, messages };
}

async function startApi(port: number, dataPath: string, bootstrap = false): Promise<ChildProcess> {
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      METADRIVE_DATA_PATH: dataPath,
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 7).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key',
      METADRIVE_SMTP_TEST_MODE: 'true',
      ...(bootstrap ? {
        METADRIVE_BOOTSTRAP_TENANT_ID: tenantId,
        METADRIVE_BOOTSTRAP_TENANT_NAME: 'RBAC Sharing Smoke',
        METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
        METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: userPassword
      } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  apiLogs = '';
  child.stdout?.on('data', (chunk: Buffer) => { apiLogs += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { apiLogs += chunk.toString(); });
  child.on('exit', (code, signal) => { apiLogs += `\nTest API exited with code ${code} and signal ${signal}`; });
  const healthUrl = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test API exited during startup:\n${apiLogs}`);
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`Test API did not become ready:\n${apiLogs}`);
}

async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);
}

test('dashboard rich text and image widgets persist safely through snapshots and scheduled delivery', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-dashboard-content-'));
  const dataPath = path.join(dataDirectory, 'platform-state.json');
  const port = await availablePort();
  const smtpRelay = await startSmtpRelay();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, dataPath, true);
    const api = client(port);
    const adminToken = await api.login(adminEmail);
    const credential = await api.send('/named-credentials', adminToken, 'POST', {
      name: 'Dashboard_Content_SMTP',
      label: 'Dashboard Content SMTP',
      protocol: 'SMTP',
      baseUrl: `smtp://127.0.0.1:${smtpRelay.port}`,
      authType: 'None'
    });
    assert.equal(credential.status, 201, JSON.stringify(credential.data));
    const adminUserId = (await api.send('/auth/me', adminToken)).data.user.id as string;
    const richTextContent = '<h2>Dashboard note</h2><script>alert(1)</script><p>Safe <strong>formatting</strong><img src="https://example.test/evil.png" onerror="alert(1)"></p>';
    const dashboard = await api.send('/metadata/dashboards/Content_Widgets_E2E', adminToken, 'PUT', {
      label: 'Content Widgets E2E',
      description: '',
      folderName: 'Private Reports',
      visibility: 'Private',
      filterLogic: 'All',
      status: 'Deployed',
      filters: [],
      components: [
        {
          id: 'rich-text-widget',
          title: 'Rich Text Widget',
          type: 'Rich Text',
          objectApiName: 'Account',
          aggregation: 'Count',
          measureFieldApiName: null,
          groupByFieldApiName: null,
          chartType: 'Bar',
          displayFieldApiNames: [],
          richTextContent
        },
        {
          id: 'image-widget',
          title: 'Image Widget',
          type: 'Image',
          objectApiName: 'Account',
          aggregation: 'Count',
          measureFieldApiName: null,
          groupByFieldApiName: null,
          chartType: 'Bar',
          displayFieldApiNames: [],
          imageUrl: 'https://example.test/dashboard.png',
          imageAltText: 'Sales performance'
        },
        {
          id: 'gauge-widget',
          title: 'Pipeline Gauge',
          type: 'Chart',
          objectApiName: 'Account',
          aggregation: 'Count',
          measureFieldApiName: null,
          groupByFieldApiName: null,
          chartType: 'Gauge',
          displayFieldApiNames: [],
          subtitle: 'Pipeline attainment',
          footer: '<nightly update>',
          gaugeMin: 0,
          gaugeMax: 100,
          gaugeRange1EndPercent: 25,
          gaugeRange2EndPercent: 75,
          chartColorPalette: 'Colorblind Safe'
        }
      ]
    });
    assert.equal(dashboard.status, 200, JSON.stringify(dashboard.data));
    assert.equal(dashboard.data.dashboard.components[2].subtitle, 'Pipeline attainment');
    assert.equal(dashboard.data.dashboard.components[2].footer, '<nightly update>');
    assert.match(dashboard.data.dashboard.components[0].richTextContent, /<strong>formatting<\/strong>/);
    assert.doesNotMatch(dashboard.data.dashboard.components[0].richTextContent, /<script|<img|onerror/i);
    assert.equal((await api.send('/metadata/dashboards/Content_Widgets_E2E', adminToken, 'PUT', {
      ...dashboard.data.dashboard,
      components: dashboard.data.dashboard.components.map((component: Record<string, unknown>) => ({
        ...component,
        ...(component.type === 'Image' ? { imageUrl: 'javascript:alert(1)' } : {})
      }))
    })).status, 400, 'image widgets must reject non-HTTPS sources');
    const snapshot = await api.send('/metadata/dashboards/Content_Widgets_E2E/snapshots', adminToken, 'POST', {
      label: 'Content widget snapshot'
    });
    assert.equal(snapshot.status, 201, JSON.stringify(snapshot.data));
    assert.equal(snapshot.data.snapshot.components[0].richTextContent, dashboard.data.dashboard.components[0].richTextContent);
    assert.equal(snapshot.data.snapshot.components[1].imageUrl, 'https://example.test/dashboard.png');
    assert.equal(snapshot.data.snapshot.components[2].gaugeRange1EndPercent, 25);
    assert.equal(snapshot.data.snapshot.components[2].gaugeRange2EndPercent, 75);
    assert.equal(snapshot.data.snapshot.components[2].chartColorPalette, 'Colorblind Safe');
    assert.equal(snapshot.data.snapshot.components[2].subtitle, 'Pipeline attainment');
    assert.equal(snapshot.data.snapshot.components[2].footer, '<nightly update>');
    const subscription = await api.send('/metadata/dashboards/Content_Widgets_E2E/subscriptions', adminToken, 'POST', {
      label: 'Content widget delivery',
      frequency: 'Daily',
      dayOfWeek: null,
      localTime: '09:00',
      timeZone: 'Europe/London',
      recipientUserIds: [adminUserId],
      namedCredentialId: credential.data.credential.id,
      fromEmail: 'dashboards@example.net',
      active: true,
      saveSnapshots: true
    });
    assert.equal(subscription.status, 201, JSON.stringify(subscription.data));
    const delivery = await api.send(
      `/metadata/dashboards/Content_Widgets_E2E/subscriptions/${subscription.data.subscription.id}/run`,
      adminToken, 'POST', {}
    );
    assert.equal(delivery.status, 200, JSON.stringify(delivery.data));
    assert.equal(smtpRelay.messages.length, 1);
    assert.match(smtpRelay.messages[0], /Content-Type: text\/html/i);
    assert.match(smtpRelay.messages[0], /Dashboard note/);
    assert.match(smtpRelay.messages[0], /Sales performance/);
    assert.match(smtpRelay.messages[0], /Pipeline attainment/);
    assert.match(smtpRelay.messages[0], /&lt;nightly/);
    assert.doesNotMatch(smtpRelay.messages[0], /<nightly update>/);
    assert.match(smtpRelay.messages[0], /https:\/\/example\.test\/dashboard\.png/);
    assert.match(smtpRelay.messages[0], /#c23934/);
    assert.match(smtpRelay.messages[0], /#fe9339/);
    assert.match(smtpRelay.messages[0], /#2e844a/);
    assert.match(smtpRelay.messages[0], /25%/);
    assert.match(smtpRelay.messages[0], /75%/);
    assert.match(smtpRelay.messages[0], /position:absolute/);
    assert.match(smtpRelay.messages[0], /left:calc\(0%/,
      'scheduled gauge output must mark the current value without obscuring its range colors');
    assert.doesNotMatch(smtpRelay.messages[0], /<script|onerror=/i);
    const snapshots = (await api.send('/metadata/dashboards/Content_Widgets_E2E/snapshots', adminToken)).data.snapshots;
    assert.ok(snapshots.some((item: { subscriptionId?: string; components: Array<{ type: string; chartColorPalette?: string }> }) =>
      item.subscriptionId === subscription.data.subscription.id
      && item.components.map((component) => component.type).join(',') === 'Rich Text,Image,Chart'
      && item.components[2].chartColorPalette === 'Colorblind Safe'));
    const dynamicDashboard = await api.send('/metadata/dashboards/Content_Widgets_E2E', adminToken, 'PUT', {
      ...dashboard.data.dashboard,
      allowViewerToSelectRunningUser: true,
      runningUserId: null
    });
    assert.equal(dynamicDashboard.status, 200, JSON.stringify(dynamicDashboard.data));
    const selectedRecords = await api.send(
      `/metadata/dashboards/Content_Widgets_E2E/data/Account?runningUserId=${adminUserId}`,
      adminToken
    );
    assert.equal(selectedRecords.status, 200, JSON.stringify(selectedRecords.data));
    const dynamicSnapshot = await api.send('/metadata/dashboards/Content_Widgets_E2E/snapshots', adminToken, 'POST', {
      label: 'Dynamic running identity',
      runningUserId: adminUserId
    });
    assert.equal(dynamicSnapshot.status, 201, JSON.stringify(dynamicSnapshot.data));
    assert.equal(dynamicSnapshot.data.snapshot.createdBy, adminUserId);
    assert.equal(dynamicSnapshot.data.snapshot.runningUserId, adminUserId);
    assert.equal((await api.send('/metadata/dashboards/Content_Widgets_E2E/data/Account?runningUserId=inactive-or-other-tenant', adminToken)).status, 403,
      'dynamic dashboard data must reject identities that are inactive or outside the tenant');
    assert.equal((await api.send('/metadata/dashboards/Content_Widgets_E2E', adminToken, 'PUT', {
      ...dynamicDashboard.data.dashboard,
      allowViewerToSelectRunningUser: false,
      runningUserId: null
    })).status, 200);
    assert.equal((await api.send('/metadata/dashboards/Content_Widgets_E2E/snapshots', adminToken, 'POST', {
      label: 'Disabled run-as selection',
      runningUserId: 'inactive-or-other-tenant'
    })).status, 403, 'dashboards without dynamic selection must reject explicit running-user IDs');
  } finally {
    if (child) await stopApi(child);
    await new Promise<void>((resolve, reject) => smtpRelay.server.close((error) => error ? reject(error) : resolve()));
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('dashboard Includes and Excludes filters match configured multi-select values', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-dashboard-multiselect-'));
  const dataPath = path.join(dataDirectory, 'platform-state.json');
  const port = await availablePort();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, dataPath, true);
    const api = client(port);
    const adminToken = await api.login(adminEmail);
    const contactObject = (await api.send('/metadata/objects/Contact', adminToken)).data.object;
    contactObject.fields.push({
      apiName: 'Topics__c',
      label: 'Topics',
      dataType: 'Multi-Select Picklist',
      required: false,
      unique: false,
      picklistValues: ['Product', 'Events', 'Training'],
      picklistRestricted: true
    });
    const savedObject = await api.send('/metadata/objects/Contact', adminToken, 'PUT', contactObject);
    assert.equal(savedObject.status, 200, JSON.stringify(savedObject.data));
    for (const [name, topics] of [
      ['Dashboard Multi Select Product', 'Product;Events'],
      ['Dashboard Multi Select Training', 'Training'],
      ['Dashboard Multi Select Events', 'Events']
    ]) {
      const record = await api.send('/records/Contact', adminToken, 'POST', { Name: name, Topics__c: topics });
      assert.equal(record.status, 201, JSON.stringify(record.data));
    }
    const dashboard = {
      apiName: 'Multi_Select_Dashboard_E2E',
      label: 'Multi Select Dashboard E2E',
      description: '',
      folderName: 'Private Reports',
      visibility: 'Private',
      sharedUserIds: [],
      sharedPermissionSetGroupIds: [],
      filterLogic: 'All',
      status: 'Deployed',
      components: [{
        id: 'contact-count',
        title: 'Matching Contacts',
        type: 'Metric',
        objectApiName: 'Contact',
        width: 'ThreeQuarter',
        height: 'Tall',
        aggregation: 'Count',
        measureFieldApiName: null,
        groupByFieldApiName: null,
        chartType: 'Bar',
        displayFieldApiNames: []
      }, {
        id: 'bounded-gauge',
        title: 'Bounded Gauge',
        type: 'Chart',
        objectApiName: 'Contact',
        width: 'Half',
        height: 'Medium',
        aggregation: 'Count',
        measureFieldApiName: null,
        groupByFieldApiName: null,
        chartType: 'Gauge',
        displayFieldApiNames: [],
        gaugeMin: -10,
        gaugeMax: 10
      }],
      filters: [
        { id: 'topics', objectApiName: 'Contact', fieldApiName: 'Topics__c', operator: 'Includes', value: 'Product;Training' },
        { id: 'name', objectApiName: 'Contact', fieldApiName: 'Name', operator: 'Starts With', value: 'Dashboard Multi Select' }
      ]
    };
    const savedDashboard = await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', dashboard);
    assert.equal(savedDashboard.status, 200, JSON.stringify(savedDashboard.data));
    assert.equal(savedDashboard.data.dashboard.components[1].gaugeMin, -10);
    const includes = await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E/snapshots', adminToken, 'POST', {
      label: 'Includes selected values'
    });
    assert.equal(includes.status, 201, JSON.stringify(includes.data));
    assert.equal(includes.data.snapshot.components[0].metricValue, 2,
      'Includes must match records containing any of the selected values');
    assert.equal(includes.data.snapshot.components[1].gaugeMin, -10,
      'gauge minimum and maximum must persist into dashboard snapshots');
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', {
      ...dashboard,
      components: dashboard.components.map((component) => component.id === 'bounded-gauge'
        ? { ...component, gaugeMin: 10 }
        : component)
    })).status, 400, 'gauge minimum must be less than the configured maximum');
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', {
      ...dashboard,
      components: dashboard.components.map((component) => component.id === 'bounded-gauge'
        ? { ...component, gaugeRange1EndPercent: 80, gaugeRange2EndPercent: 20 }
        : component)
    })).status, 400, 'gauge range boundaries must be in increasing order');
    const negativeGauge = await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', {
      ...dashboard,
      components: dashboard.components.map((component) => component.id === 'bounded-gauge'
        ? { ...component, gaugeMin: -20, gaugeMax: -10 }
        : component)
    });
    assert.equal(negativeGauge.status, 200, JSON.stringify(negativeGauge.data));
    assert.equal(negativeGauge.data.dashboard.components[1].gaugeMax, -10,
      'gauge endpoints may be negative when the maximum remains greater than the minimum');
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', {
      ...dashboard,
      components: dashboard.components.map((component) => component.id === 'bounded-gauge'
        ? { ...component, chartColorPalette: 'Untrusted Palette' }
        : component)
    })).status, 400, 'chart palettes must be selected from the supported values');
    const excludesDashboard = {
      ...dashboard,
      filters: dashboard.filters.map((filter) => filter.id === 'topics'
        ? { ...filter, operator: 'Excludes' }
        : filter)
    };
    const savedExcludesDashboard = await api.send(
      '/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', excludesDashboard
    );
    assert.equal(savedExcludesDashboard.status, 200, JSON.stringify(savedExcludesDashboard.data));
    const excludes = await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E/snapshots', adminToken, 'POST', {
      label: 'Excludes selected values'
    });
    assert.equal(excludes.status, 201, JSON.stringify(excludes.data));
    assert.equal(excludes.data.snapshot.components[0].metricValue, 1,
      'Excludes must omit records containing any of the selected values');
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', {
      ...dashboard,
      filters: [{ ...dashboard.filters[0], fieldApiName: 'Name' }]
    })).status, 422, 'multi-select operators must only be available for multi-select fields');
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard_E2E', adminToken, 'PUT', {
      ...dashboard,
      filters: [{ ...dashboard.filters[0], value: 'Unknown' }]
    })).status, 422, 'multi-select filters must reject unconfigured values');
  } finally {
    if (child) await stopApi(child);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

function client(port: number) {
  const root = `http://127.0.0.1:${port}/api`;
  const send = async (pathName: string, token?: string, method = 'GET', body?: unknown, requestSource?: 'web-app') => {
    let response: Response;
    try {
      response = await fetch(`${root}${pathName}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(requestSource ? { 'x-metadrive-request-source': requestSource } : {}),
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      throw new Error(`API ${method} ${pathName} could not complete: ${error instanceof Error ? error.message : String(error)}\n${apiLogs}`);
    }
    const text = await response.text();
    if (response.status >= 500) console.error(`API ${method} ${pathName} returned ${response.status}:\n${apiLogs}`);
    return { status: response.status, data: text ? JSON.parse(text) as Record<string, any> : {} };
  };
  const login = async (email: string) => {
    const response = await send('/auth/login', undefined, 'POST', { email, password: userPassword });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response.data.access_token as string;
  };
  return { send, login };
}

test('new Lightning Pages can change API name before their first save', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-page-first-save-'));
  const dataPath = path.join(dataDirectory, 'platform-state.json');
  const port = await availablePort();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, dataPath, true);
    const api = client(port);
    const adminToken = await api.login(adminEmail);
    const pageCatalog = (await api.send('/metadata/pages', adminToken)).data.pages as Array<{
      pageType: string;
      targetObject: string;
      apiName: string;
      label: string;
    }>;
    const sourcePage = pageCatalog.find((page) => page.pageType === 'Record Page' && page.targetObject === 'Account');
    assert.ok(sourcePage, 'bootstrap metadata must include a Record Page for Account');
    const firstSave = await api.send('/metadata/pages/Draft_Page_Identity', adminToken, 'PUT', {
      ...sourcePage,
      apiName: 'Renamed_Before_First_Save',
      label: 'Renamed Before First Save',
      status: 'Draft',
      activationAssignments: []
    });
    assert.equal(firstSave.status, 200, JSON.stringify(firstSave.data));
    assert.equal(firstSave.data.page.apiName, 'Renamed_Before_First_Save');
    const savedPages = (await api.send('/metadata/pages', adminToken)).data.pages as Array<{ apiName: string }>;
    assert.ok(savedPages.some((page) => page.apiName === 'Renamed_Before_First_Save'));
    assert.ok(!savedPages.some((page) => page.apiName === 'Draft_Page_Identity'));
  } finally {
    if (child) await stopApi(child);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('deactivated Lightning Record Pages no longer resolve for runtime records', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-page-lifecycle-'));
  const dataPath = path.join(dataDirectory, 'platform-state.json');
  const port = await availablePort();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, dataPath, true);
    const api = client(port);
    const adminToken = await api.login(adminEmail);
    const pageCatalog = (await api.send('/metadata/pages', adminToken)).data.pages as Array<{
      pageType: string;
      targetObject: string;
      apiName: string;
      label: string;
    }>;
    const sourcePage = pageCatalog.find((page) => page.pageType === 'Record Page' && page.targetObject === 'Account');
    assert.ok(sourcePage, 'bootstrap metadata must include a Record Page for Account');
    const assignedPage = {
      ...sourcePage,
      apiName: 'Lifecycle_Record_Page',
      label: 'Lifecycle Record Page',
      status: 'Active' as const,
      activationAssignments: [{
        id: 'lifecycle-org-desktop',
        scope: 'Org Default' as const,
        appId: null,
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop' as const]
      }]
    };
    const activated = await api.send(`/metadata/pages/${assignedPage.apiName}`, adminToken, 'PUT', assignedPage);
    assert.equal(activated.status, 200, JSON.stringify(activated.data));
    const createdRecord = await api.send('/records/Account', adminToken, 'POST', { Name: 'Page Lifecycle Test' });
    assert.equal(createdRecord.status, 201, JSON.stringify(createdRecord.data));
    const recordId = (createdRecord.data.record as { Id: string }).Id;
    const activeRuntimePage = (await api.send(`/records/Account/${recordId}?appId=Records&formFactor=Desktop`, adminToken))
      .data.lightningPage;
    assert.equal(activeRuntimePage.apiName, assignedPage.apiName);
    const deactivated = await api.send(`/metadata/pages/${assignedPage.apiName}`, adminToken, 'PUT', {
      ...activated.data.page,
      status: 'Draft'
    });
    assert.equal(deactivated.status, 200, JSON.stringify(deactivated.data));
    assert.equal(deactivated.data.page.status, 'Draft');
    const draftRuntimePage = (await api.send(`/records/Account/${recordId}?appId=Records&formFactor=Desktop`, adminToken))
      .data.lightningPage;
    assert.notEqual(draftRuntimePage?.apiName, assignedPage.apiName);
  } finally {
    if (child) await stopApi(child);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test('record sharing smoke: OWD, hierarchy, shares, CRUD boundaries, reports, roles, and tenant validation', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-rbac-sharing-'));
  const dataPath = path.join(dataDirectory, 'platform-state.json');
  const port = await availablePort();
  const smtpRelay = await startSmtpRelay();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, dataPath, true);
    await stopApi(child);
    child = undefined;

    const state = JSON.parse(await readFile(dataPath, 'utf8')) as {
      users: Array<Record<string, unknown>>;
      tenants: Record<string, {
        objects: Array<{
          apiName: string;
          fields: Array<Record<string, unknown>>;
          recordTypes?: Array<Record<string, unknown>>;
          pageLayouts?: Array<{ id: string }>;
          pageLayoutAssignments?: Array<Record<string, unknown>>;
          listViewButtons?: string[];
        }>;
        accessControl: {
          roles: Array<{ id: string; name: string; apiName: string; parentRoleId: string | null }>;
          users: Array<Record<string, unknown>>;
          profiles: Array<{
            id: string;
            systemPermissions: string[];
            objectPermissions: Record<string, Record<string, boolean>>;
            recordTypePermissions: Record<string, boolean>;
            fieldPermissions: Record<string, { read: boolean; edit: boolean }>;
          }>;
          permissionSets: Array<{
            id: string;
            objectPermissions: Record<string, Record<string, boolean>>;
            fieldPermissions: Record<string, { read: boolean; edit: boolean }>;
          }>;
        };
      }>;
    };
    const tenant = state.tenants[tenantId];
    const accountObject = tenant.objects.find((object) => object.apiName === 'Account')!;
    accountObject.fields.push({
      apiName: 'Report_Date__c', label: 'Report Date', dataType: 'Date', required: false, unique: false
    });
    accountObject.recordTypes = [
      { id: 'master', label: 'Master', developerName: 'Master', active: true, isDefault: true },
      { id: 'smoke-secondary', label: 'Secondary', developerName: 'Secondary', active: true, isDefault: false }
    ];
    const contactObject = tenant.objects.find((object) => object.apiName === 'Contact')!;
    contactObject.fields.push({
      apiName: 'Source__c', label: 'Source', dataType: 'Picklist', required: false, unique: false,
      picklistValues: ['Web', 'Referral'], picklistRestricted: true
    });
    contactObject.fields.push({
      apiName: 'Rating__c', label: 'Rating', dataType: 'Picklist', required: false, unique: false,
      picklistValues: ['Hot', 'Cold'], picklistRestricted: true,
      controllerFieldApiName: 'Source__c', valueSettings: { Web: ['Cold'], Referral: ['Hot'] }
    });
    contactObject.fields.push({
      apiName: 'Topics__c', label: 'Topics', dataType: 'Multi-Select Picklist', required: false, unique: false,
      picklistValues: ['Product', 'Events', 'Training'], picklistRestricted: true
    });
    contactObject.fields.push({
      apiName: 'Campaign_Topics__c', label: 'Campaign Topics', dataType: 'Multi-Select Picklist', required: false, unique: false,
      picklistValues: ['Product', 'Events', 'Training'], picklistRestricted: true,
      controllerFieldApiName: 'Source__c', valueSettings: { Web: ['Product', 'Training'], Referral: ['Events'] }
    });
    contactObject.fields.push({
      apiName: 'Notes__c', label: 'Notes', dataType: 'Long Text Area', required: false, unique: false
    });
    const contactLayoutId = contactObject.pageLayouts?.[0]?.id ?? 'Contact-default';
    const contactLayout = contactObject.pageLayouts?.find((layout) => layout.id === contactLayoutId);
    if (contactLayout?.sections[0]) contactLayout.sections[0].fieldApiNames.push('Topics__c', 'Campaign_Topics__c', 'Notes__c');
    contactObject.recordTypes = [
      { id: 'contact-retail', label: 'Retail', developerName: 'Retail', active: true, isDefault: true, picklistValues: { Source__c: ['Web'], Topics__c: ['Product', 'Training'] } },
      { id: 'contact-partner', label: 'Partner', developerName: 'Partner', active: true, isDefault: false, picklistValues: { Source__c: ['Referral'], Topics__c: ['Events'] } }
    ];
    contactObject.pageLayoutAssignments = [
      { profileId: '*', recordTypeId: 'contact-retail', pageLayoutId: contactLayoutId },
      { profileId: '*', recordTypeId: 'contact-partner', pageLayoutId: contactLayoutId }
    ];
    const contactCompactLayoutId = contactObject.compactLayouts?.[0]?.id ?? 'Contact-compact-default';
    contactObject.compactLayoutAssignments = [
      { profileId: '*', recordTypeId: 'contact-retail', compactLayoutId: contactCompactLayoutId },
      { profileId: '*', recordTypeId: 'contact-partner', compactLayoutId: contactCompactLayoutId }
    ];
    tenant.objects.push({
      apiName: 'Contact_Note__c',
      label: 'Contact Note',
      pluralLabel: 'Contact Notes',
      kind: 'Custom Object',
      description: 'Smoke-test object for multi-hop dashboard cross-filters.',
      fields: [
        { apiName: 'Name', label: 'Note Name', dataType: 'Text(80)', required: true, unique: false },
        {
          apiName: 'Contact__c', label: 'Contact', dataType: 'Lookup(Contact)', required: true, unique: false,
          relationship: { type: 'Lookup', targetObject: 'Contact', relationshipName: 'Contact', childRelationshipName: 'ContactNotes' }
        },
        {
          apiName: 'Sentiment__c', label: 'Sentiment', dataType: 'Picklist', required: true, unique: false,
          picklistValues: ['Positive', 'Neutral'], picklistRestricted: true
        }
      ]
    });
    tenant.objects.push({
      apiName: 'Development_Only__c',
      label: 'Development Only',
      pluralLabel: 'Development Only Records',
      kind: 'Custom Object',
      description: 'Smoke-test object for deployment status access.',
      fields: [{ apiName: 'Name', label: 'Name', dataType: 'Text(80)', required: true, unique: false }],
      settings: {
        allowReports: true, allowActivities: false, trackFieldHistory: false, allowInChatter: false,
        deploymentStatus: 'In Development', recordNameType: 'Text', recordNameFormat: ''
      }
    });
    const admin = state.users.find((user) => user.email === adminEmail)!;
    const managerId = randomUUID();
    const ownerId = randomUUID();
    const outsiderId = randomUUID();
    const managerRoleId = 'smoke-manager-role';
    const ownerRoleId = 'smoke-owner-role';
    const outsiderRoleId = 'smoke-outsider-role';
    tenant.accessControl.roles.push(
      { id: managerRoleId, name: 'Smoke Manager', apiName: 'Smoke_Manager', parentRoleId: 'role-executive' },
      { id: ownerRoleId, name: 'Smoke Owner', apiName: 'Smoke_Owner', parentRoleId: managerRoleId },
      { id: outsiderRoleId, name: 'Smoke Outsider', apiName: 'Smoke_Outsider', parentRoleId: 'role-support-agent' }
    );
    const users = [
      { id: managerId, name: 'Sharing Smoke Manager', email: 'manager@rbac-sharing-smoke.test', role: 'Smoke Manager', roleId: managerRoleId },
      { id: ownerId, name: 'Sharing Smoke Owner', email: 'owner@rbac-sharing-smoke.test', role: 'Smoke Owner', roleId: ownerRoleId },
      { id: outsiderId, name: 'Sharing Smoke Outsider', email: 'outsider@rbac-sharing-smoke.test', role: 'Smoke Outsider', roleId: outsiderRoleId }
    ];
    const objectPermissions = { read: true, create: true, edit: true, delete: true, viewAll: false, modifyAll: false };
    const standardProfile = tenant.accessControl.profiles.find((profile) => profile.id === 'standard-user')!;
    standardProfile.objectPermissions.Account = objectPermissions;
    standardProfile.objectPermissions.Contact = objectPermissions;
    standardProfile.objectPermissions.Contact_Note__c = objectPermissions;
    standardProfile.recordTypePermissions['Account.master'] = true;
    standardProfile.recordTypePermissions['Account.smoke-secondary'] = false;
    standardProfile.systemPermissions = ['metadata:read', 'metadata:write', 'flows:run'];
    standardProfile.fieldPermissions['Account.Phone'] = { read: true, edit: true };
    standardProfile.fieldPermissions['Contact.Source__c'] = { read: true, edit: true };
    standardProfile.fieldPermissions['Contact_Note__c.Contact__c'] = { read: true, edit: true };
    standardProfile.fieldPermissions['Contact_Note__c.Sentiment__c'] = { read: true, edit: true };
    const developmentReaderId = randomUUID();
    tenant.accessControl.profiles.push({
      id: 'development-reader',
      label: 'Development Reader',
      apiName: 'Development_Reader',
      license: 'MetaDrive',
      description: 'Can read and create the deployment-status smoke object without object customization rights.',
      isStandard: false,
      systemPermissions: ['metadata:read'],
      objectPermissions: {
        Development_Only__c: { read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true }
      },
      recordTypePermissions: {},
      fieldPermissions: {
        'Development_Only__c.Name': { read: true, edit: true }
      }
    });
    const administratorProfile = tenant.accessControl.profiles.find((profile) => profile.id === 'system-administrator')!;
    administratorProfile.objectPermissions.Development_Only__c = {
      read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true
    };
    administratorProfile.fieldPermissions['Development_Only__c.Name'] = { read: true, edit: true };
    const administratorSet = tenant.accessControl.permissionSets.find((set) => set.id === 'system-administrator')!;
    administratorSet.objectPermissions.Contact_Note__c = objectPermissions;
    administratorSet.fieldPermissions['Contact_Note__c.Contact__c'] = { read: true, edit: true };
    administratorSet.fieldPermissions['Contact_Note__c.Sentiment__c'] = { read: true, edit: true };
    const salesPermissionSet = tenant.accessControl.permissionSets.find((set) => set.id === 'sales-user')!;
    salesPermissionSet.systemPermissions = [...new Set([...salesPermissionSet.systemPermissions, 'dashboards:viewTeam'])];
    for (const user of users) {
      const email = user.email;
      const credentials = await hashPassword(userPassword);
      const permissionSetIds = user.id === managerId ? [salesPermissionSet.id] : [];
      state.users.push({
        id: user.id, tenantId, name: user.name, email,
        passwordSalt: credentials.salt, passwordHash: credentials.hash,
        role: user.role, permissionSetIds, permissionSetGroupIds: [],
        disabled: false, createdAt: new Date().toISOString()
      });
      tenant.accessControl.users.push({
        id: user.id, name: user.name, username: email, role: user.role,
        roleId: user.roleId, profileId: 'standard-user',
        permissionSetIds, permissionSetGroupIds: []
      });
    }
    const developmentReaderCredentials = await hashPassword(userPassword);
    state.users.push({
      id: developmentReaderId, tenantId, name: 'Development Reader',
      email: 'development-reader@rbac-sharing-smoke.test',
      passwordSalt: developmentReaderCredentials.salt, passwordHash: developmentReaderCredentials.hash,
      role: 'Smoke Outsider', permissionSetIds: [], permissionSetGroupIds: [],
      disabled: false, createdAt: new Date().toISOString()
    });
    tenant.accessControl.users.push({
      id: developmentReaderId, name: 'Development Reader',
      username: 'development-reader@rbac-sharing-smoke.test',
      role: 'Smoke Outsider', roleId: outsiderRoleId, profileId: 'development-reader',
      permissionSetIds: [], permissionSetGroupIds: []
    });
    await writeFile(dataPath, JSON.stringify(state, null, 2));

    child = await startApi(port, dataPath);
    const api = client(port);
    const adminToken = await api.login(adminEmail);
    const lifecycleAdminUserId = (await api.send('/auth/me', adminToken)).data.user.id as string;
    const developmentReaderToken = await api.login('development-reader@rbac-sharing-smoke.test');
    const runPermissionFlow = await api.send('/metadata/flows/Flow_Run_Permission_Smoke', adminToken, 'PUT', {
      apiName: 'Flow_Run_Permission_Smoke',
      label: 'Flow Run Permission Smoke',
      flowType: 'Autolaunched Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {},
      elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
      connectors: [],
      resources: [],
      versions: []
    });
    assert.equal(runPermissionFlow.status, 200, JSON.stringify(runPermissionFlow.data));
    assert.equal((await api.send('/flows/Flow_Run_Permission_Smoke/execute', adminToken, 'POST', {})).status, 200,
      'users with the Run Flows system permission can invoke active autolaunched flows');
    assert.equal((await api.send('/flows/Flow_Run_Permission_Smoke/execute', developmentReaderToken, 'POST', {})).status, 403,
      'metadata readers without Run Flows cannot invoke flows');
    assert.equal((await api.send('/flows/Flow_Run_Permission_Smoke/debug', developmentReaderToken, 'POST', {})).status, 403,
      'metadata readers without Run Flows cannot debug flows');
    const runPermissionScreenFlow = await api.send('/metadata/flows/Flow_Interview_Permission_Smoke', adminToken, 'PUT', {
      apiName: 'Flow_Interview_Permission_Smoke',
      label: 'Flow Interview Permission Smoke',
      flowType: 'Screen Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Screen', label: 'Input', config: { fields: [
          { label: 'Answer', apiName: 'Answer', type: 'Text', required: true }
        ] } }
      ],
      connectors: [{ id: 'start-screen', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(runPermissionScreenFlow.status, 200, JSON.stringify(runPermissionScreenFlow.data));
    const runPermissionInterview = await api.send('/flows/Flow_Interview_Permission_Smoke/execute', adminToken, 'POST', {});
    assert.equal(runPermissionInterview.status, 202, JSON.stringify(runPermissionInterview.data));
    assert.equal((await api.send(`/flow-interviews/${runPermissionInterview.data.interviewId}/next`, developmentReaderToken, 'POST', {
      values: { Answer: 'Denied' }
    })).status, 403, 'screen interview continuation also requires Run Flows');
    assert.equal((await api.send(`/flow-interviews/${runPermissionInterview.data.interviewId}/next`, adminToken, 'POST', {
      values: { Answer: 'Authorized' }
    })).status, 200, 'an authorized user can continue a screen interview');
    const interviewManagementTarget = await api.send('/flows/Flow_Interview_Permission_Smoke/execute', adminToken, 'POST', {});
    assert.equal(interviewManagementTarget.status, 202, JSON.stringify(interviewManagementTarget.data));
    assert.equal((await api.send(`/metadata/flow-interviews/${interviewManagementTarget.data.interviewId}`, developmentReaderToken, 'DELETE')).status, 403,
      'metadata readers without metadata write or Flow management cannot cancel interviews');
    assert.equal((await api.send(`/metadata/flow-interviews/${interviewManagementTarget.data.interviewId}`, adminToken, 'DELETE')).status, 204,
      'authorized metadata writers can cancel pending interviews');
    const lifecycleObjectApiName = 'Object_Manager_Lifecycle__c';
    const createdLifecycleObject = await api.send('/metadata/objects', adminToken, 'POST', {
      apiName: lifecycleObjectApiName,
      label: 'Lifecycle Item',
      pluralLabel: 'Lifecycle Items',
      kind: 'Custom Object',
      description: 'Object Manager lifecycle integration fixture',
      fields: [{ apiName: 'Name', label: 'Lifecycle Item Name', dataType: 'Text(80)', required: true, unique: false }],
      settings: {
        allowReports: true,
        allowActivities: true,
        trackFieldHistory: false,
        allowInChatter: false,
        deploymentStatus: 'Deployed',
        recordNameType: 'Text',
        recordNameFormat: ''
      }
    });
    assert.equal(createdLifecycleObject.status, 201, JSON.stringify(createdLifecycleObject.data));
    const lifecycleNavigationApp = await api.send('/metadata/apps', adminToken, 'POST', {
      apiName: 'LifecycleNavigationApp',
      label: 'Lifecycle Navigation',
      description: '',
      navigationItems: [lifecycleObjectApiName],
      navigationPageApiNames: [],
      navigationOrder: [{ type: 'Object', apiName: lifecycleObjectApiName }],
      brandColor: '#0176d3',
      utilityItems: []
    });
    assert.equal(lifecycleNavigationApp.status, 201, JSON.stringify(lifecycleNavigationApp.data));
    const lifecycleObjectDependencies = await api.send(`/metadata/objects/${lifecycleObjectApiName}/dependencies`, adminToken);
    assert.equal(lifecycleObjectDependencies.status, 200, JSON.stringify(lifecycleObjectDependencies.data));
    assert.ok(lifecycleObjectDependencies.data.dependencies.includes('Lightning app Lifecycle Navigation navigation'),
      'object dependency inspection must report app navigation references');
    const blockedLifecycleObjectDelete = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'DELETE');
    assert.equal(blockedLifecycleObjectDelete.status, 409, 'object deletion must be blocked by Lightning app navigation');
    assert.match(String(blockedLifecycleObjectDelete.data.error), /Lifecycle Navigation/,
      'object deletion errors must identify the blocking app');
    assert.equal((await api.send('/metadata/apps/LifecycleNavigationApp', adminToken, 'DELETE')).status, 204,
      'the blocking app reference must be removable before object deletion');
    const hierarchicalUserField = await api.send('/metadata/objects/User/fields', adminToken, 'POST', {
      apiName: 'Reports_To__c',
      label: 'Reports To',
      dataType: 'Lookup(User)',
      required: false,
      unique: false,
      relationship: {
        type: 'Hierarchical',
        targetObject: 'User',
        relationshipName: 'ReportsTo',
        childRelationshipName: 'DirectReports'
      }
    });
    assert.equal(hierarchicalUserField.status, 201, JSON.stringify(hierarchicalUserField.data));
    assert.equal((await api.send('/metadata/objects/User/fields', adminToken, 'POST', {
      apiName: 'Second_Manager__c',
      label: 'Second Manager',
      dataType: 'Lookup(User)',
      required: false,
      unique: false,
      relationship: {
        type: 'Hierarchical',
        targetObject: 'User',
        relationshipName: 'SecondManager',
        childRelationshipName: 'SecondDirectReports'
      }
    })).status, 400, 'the User object must only allow one hierarchical relationship');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
      apiName: 'Invalid_Hierarchy__c',
      label: 'Invalid Hierarchy',
      dataType: 'Lookup(User)',
      required: false,
      unique: false,
      relationship: {
        type: 'Hierarchical',
        targetObject: 'User',
        relationshipName: 'InvalidHierarchy',
        childRelationshipName: 'InvalidHierarchies'
      }
    })).status, 400, 'hierarchical relationships must only be created on the User object');
    assert.equal((await api.send('/metadata/objects', adminToken, 'POST', {
      apiName: 'Invalid_Object_Manager_Lifecycle__c',
      label: 'Invalid Lifecycle Item',
      pluralLabel: 'Invalid Lifecycle Items',
      kind: 'Custom Object',
      description: '',
      fields: [],
      settings: {
        allowReports: true,
        allowActivities: true,
        trackFieldHistory: false,
        allowInChatter: false,
        deploymentStatus: 'Deployed',
        recordNameType: 'Text',
        recordNameFormat: ''
      }
    })).status, 400, 'custom objects without a required Name field must be rejected');
    assert.equal((await api.send('/metadata/objects', adminToken, 'POST', {
      ...createdLifecycleObject.data.object,
      label: 'Duplicate Lifecycle Item'
    })).status, 409, 'duplicate object API names must be rejected case-insensitively');
    const lifecycleRelationship = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
      apiName: 'Parent_Account__c',
      label: 'Parent Account',
      dataType: 'Lookup(Account)',
      required: false,
      unique: false,
      relationship: {
        type: 'Lookup',
        targetObject: 'Account',
        relationshipName: 'LifecycleItem',
        childRelationshipName: 'LifecycleItems'
      }
    });
    assert.equal(lifecycleRelationship.status, 201, JSON.stringify(lifecycleRelationship.data));
    const uniqueLookup = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
      apiName: 'Unique_Account__c',
      label: 'Unique Account',
      dataType: 'Lookup(Account)',
      required: false,
      unique: true,
      relationship: {
        type: 'Lookup',
        targetObject: 'Account',
        relationshipName: 'UniqueAccount',
        childRelationshipName: 'UniqueLifecycleItems'
      }
    });
    assert.equal(uniqueLookup.status, 201, JSON.stringify(uniqueLookup.data));
    const lifecycleParentObject = (await api.send('/metadata/objects/Account', adminToken)).data.object;
    assert.equal((await api.send('/metadata/objects/Account', adminToken, 'PUT', {
      ...lifecycleParentObject,
      pageLayouts: lifecycleParentObject.pageLayouts.map((layout: Record<string, unknown>) => ({
        ...layout,
        relatedLists: [...layout.relatedLists as string[], 'LifecycleItems']
      }))
    })).status, 200, 'parent page layouts must accept the configured child relationship list');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/Parent_Account__c`, adminToken, 'DELETE')).status, 409,
      'a relationship field must not be deleted while its parent page layout uses the related list');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'DELETE')).status, 409,
      'an object must not be deleted while a parent page layout uses its related list');
    assert.equal((await api.send('/metadata/objects/Account', adminToken, 'PUT', lifecycleParentObject)).status, 200,
      'related-list references must be removable before deleting their relationship');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/Parent_Account__c`, adminToken, 'DELETE')).status, 200,
      'unreferenced relationship fields must be deletable');
    const currentLifecycleMetadata = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const lifecycleLinkUpdate = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...currentLifecycleMetadata,
      description: 'Updated lifecycle fixture',
      pageLayouts: currentLifecycleMetadata.pageLayouts.map((layout: Record<string, any>, index: number) => index === 0
        ? { ...layout, customLinks: [{ id: 'external-lifecycle-record', label: 'Open External Record', url: 'https://example.test/records/{!Record.Id}', openInNewWindow: true }] }
        : layout)
    });
    assert.equal(lifecycleLinkUpdate.status, 200, JSON.stringify(lifecycleLinkUpdate.data));
    assert.equal(lifecycleLinkUpdate.data.object.pageLayouts[0].customLinks[0].url, 'https://example.test/records/{!Record.Id}',
      'page layout custom links must persist with record merge fields');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleLinkUpdate.data.object,
      pageLayouts: lifecycleLinkUpdate.data.object.pageLayouts.map((layout: Record<string, any>, index: number) => index === 0
        ? { ...layout, customLinks: layout.customLinks.map((link: Record<string, any>) => ({ ...link, url: 'javascript:alert(1)' })) }
        : layout)
    })).status, 400, 'page layout custom links must reject executable URL schemes');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleLinkUpdate.data.object,
      pageLayouts: lifecycleLinkUpdate.data.object.pageLayouts.map((layout: Record<string, any>, index: number) => index === 0
        ? { ...layout, customLinks: layout.customLinks.map((link: Record<string, any>) => ({ ...link, url: 'https://example.test/{!Record.Missing__c}' })) }
        : layout)
    })).status, 400, 'page layout custom links must reject unknown record merge fields');
    const baseCompactLayout = lifecycleLinkUpdate.data.object.compactLayouts[0];
    const compactLayoutUpdate = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleLinkUpdate.data.object,
      compactLayouts: [
        baseCompactLayout,
        { id: 'lifecycle-secondary-compact', label: 'Lifecycle Secondary', fieldApiNames: ['Name'] }
      ],
      compactLayoutAssignments: [
        { profileId: '*', recordTypeId: 'master', compactLayoutId: baseCompactLayout.id },
        { profileId: 'standard-user', recordTypeId: 'master', compactLayoutId: 'lifecycle-secondary-compact' }
      ]
    });
    assert.equal(compactLayoutUpdate.status, 200, JSON.stringify(compactLayoutUpdate.data));
    assert.equal(compactLayoutUpdate.data.object.compactLayoutAssignments[1].compactLayoutId, 'lifecycle-secondary-compact',
      'compact layout assignments must persist by profile and record type');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...compactLayoutUpdate.data.object,
      compactLayoutAssignments: [
        ...compactLayoutUpdate.data.object.compactLayoutAssignments,
        { profileId: 'unknown-profile', recordTypeId: 'master', compactLayoutId: baseCompactLayout.id }
      ]
    })).status, 400, 'compact layout assignments must reference an existing profile');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...compactLayoutUpdate.data.object,
      compactLayoutAssignments: [
        ...compactLayoutUpdate.data.object.compactLayoutAssignments,
        { profileId: 'standard-user', recordTypeId: 'master', compactLayoutId: baseCompactLayout.id }
      ]
    })).status, 400, 'each profile and record type pair must have one compact layout assignment');
    const lifecycleTabUpdate = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...(await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object,
      customTab: { style: 'Teal' }
    });
    assert.equal(lifecycleTabUpdate.status, 200, JSON.stringify(lifecycleTabUpdate.data));
    assert.deepEqual(
      (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object.customTab,
      { style: 'Teal' },
      'custom tab style must persist when object metadata is reloaded'
    );
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleTabUpdate.data.object,
      customTab: { style: 'NotAStyle' }
    })).status, 400, 'unsupported custom tab styles must be rejected');
    const lifecycleLayoutId = createdLifecycleObject.data.object.pageLayouts[0].id as string;
    const rejectedFieldLayout = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
      field: {
        apiName: 'Rejected_Layout_Field__c', label: 'Rejected Layout Field', dataType: 'Text(40)',
        required: false, unique: false
      },
      pageLayoutIds: ['unknown-layout']
    });
    assert.equal(rejectedFieldLayout.status, 400, 'field creation must reject unknown layout targets');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object.fields
      .some((field: { apiName: string }) => field.apiName === 'Rejected_Layout_Field__c'), false,
    'invalid layout placement must not partially create its field');
    const createdLifecyclePicklist = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
      field: {
        apiName: 'Lifecycle_Status__c',
        label: 'Status',
        dataType: 'Picklist',
        required: false,
        unique: false,
        helpText: 'A concise status explanation for users.',
        picklistValues: ['Open', 'Closed'],
        picklistRestricted: true,
        defaultValue: 'Open'
      },
      pageLayoutIds: [lifecycleLayoutId]
    });
    assert.equal(createdLifecyclePicklist.status, 201, JSON.stringify(createdLifecyclePicklist.data));
    assert.ok(createdLifecyclePicklist.data.object.pageLayouts[0].sections[0].fieldApiNames.includes('Lifecycle_Status__c'),
      'new field placement must be committed with the field metadata');
    assert.ok((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object.pageLayouts[0]
      .sections[0].fieldApiNames.includes('Lifecycle_Status__c'),
    'field layout placement must persist after metadata reload');
    assert.equal(createdLifecyclePicklist.data.field.helpText, 'A concise status explanation for users.',
      'field help text must be saved and returned by the metadata API');
    const lifecycleFieldDependencies = await api.send(`/metadata/objects/${lifecycleObjectApiName}/field-dependencies`, adminToken);
    assert.equal(lifecycleFieldDependencies.status, 200, JSON.stringify(lifecycleFieldDependencies.data));
    assert.ok(lifecycleFieldDependencies.data.fields.find((field: { fieldApiName: string }) =>
      field.fieldApiName === 'Lifecycle_Status__c')?.dependencies.includes('a page layout'),
    'field dependencies must be derived from persisted layout metadata');
    const lifecycleRecordTypeMetadata = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const lifecycleSecondaryRecordType = {
      id: 'lifecycle-secondary',
      label: 'Secondary',
      developerName: 'Secondary',
      description: 'A separate supported record process.',
      active: true,
      isDefault: false,
      picklistValues: { Lifecycle_Status__c: ['Closed'] }
    };
    const incompatibleRecordTypeDefault = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleRecordTypeMetadata,
      recordTypes: [...lifecycleRecordTypeMetadata.recordTypes, lifecycleSecondaryRecordType]
    });
    assert.equal(incompatibleRecordTypeDefault.status, 400,
      'record-type picklist configuration must include a configured field default');
    const compatibleRecordTypeMetadata = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleRecordTypeMetadata,
      recordTypes: [...lifecycleRecordTypeMetadata.recordTypes, {
        ...lifecycleSecondaryRecordType,
        picklistValues: { Lifecycle_Status__c: ['Open'] }
      }]
    });
    assert.equal(compatibleRecordTypeMetadata.status, 200, JSON.stringify(compatibleRecordTypeMetadata.data));
    const secondaryLifecycleRecord = await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'Secondary Lifecycle Record',
      RecordTypeId: 'lifecycle-secondary'
    });
    assert.equal(secondaryLifecycleRecord.status, 201, JSON.stringify(secondaryLifecycleRecord.data));
    assert.equal(secondaryLifecycleRecord.data.record.Lifecycle_Status__c, 'Open',
      'record-type-specific picklist defaults must be applied at runtime');
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}/${secondaryLifecycleRecord.data.record.Id}`, adminToken, 'DELETE')).status, 204);
    const lifecycleRecordTypeFlow = await api.send('/metadata/flows/Object_Manager_Lifecycle_Record_Type_Flow', adminToken, 'PUT', {
      label: 'Lifecycle Record Type Flow',
      description: '',
      flowType: 'Autolaunched Flow',
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: { objectApiName: lifecycleObjectApiName, recordTypeId: 'lifecycle-secondary' },
      elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
      connectors: [],
      resources: [],
      versions: []
    });
    assert.equal(lifecycleRecordTypeFlow.status, 200, JSON.stringify(lifecycleRecordTypeFlow.data));
    const lifecycleWithoutSecondary = {
      ...compatibleRecordTypeMetadata.data.object,
      recordTypes: compatibleRecordTypeMetadata.data.object.recordTypes.filter((recordType: { id: string }) => recordType.id !== 'lifecycle-secondary')
    };
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', lifecycleWithoutSecondary)).status, 409,
      'record types referenced by flows cannot be silently removed');
    assert.equal((await api.send('/metadata/flows/Object_Manager_Lifecycle_Record_Type_Flow', adminToken, 'DELETE')).status, 204);
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', lifecycleWithoutSecondary)).status, 200,
      'record types can be removed after their metadata consumers are deleted');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/Lifecycle_Status__c`, adminToken, 'PUT', {
      ...createdLifecyclePicklist.data.field,
      helpText: 'Updated status guidance.'
    })).status, 200, 'field help text must be editable');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object.fields
      .find((field: { apiName: string }) => field.apiName === 'Lifecycle_Status__c').helpText, 'Updated status guidance.',
    'edited field help text must persist when object metadata is reloaded');
    const createdLifecycleCode = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
      apiName: 'External_Code__c',
      label: 'External Code',
      dataType: 'Text(12)',
      required: true,
      unique: true
    });
    assert.equal(createdLifecycleCode.status, 201, JSON.stringify(createdLifecycleCode.data));
    const lifecycleActionMetadata = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const lifecycleActionUpdate = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleActionMetadata,
      actions: [...lifecycleActionMetadata.actions, {
        id: 'set-external-code',
        label: 'Set External Code',
        type: 'Custom',
        enabled: true,
        behavior: 'Set Field Value',
        fieldApiName: 'External_Code__c',
        value: 'ACTION'
      }]
    });
    assert.equal(lifecycleActionUpdate.status, 200, JSON.stringify(lifecycleActionUpdate.data));
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/External_Code__c`, adminToken, 'DELETE')).status, 409,
      'custom object actions must prevent deletion of their target fields');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleActionUpdate.data.object,
      actions: lifecycleActionMetadata.actions
    })).status, 200, 'custom action references must be removable before deleting their target field');
    const lifecycleFlowDependency = await api.send('/metadata/flows/Object_Manager_Lifecycle_Flow_Dependency', adminToken, 'PUT', {
      label: 'Lifecycle Flow Dependency',
      description: '',
      flowType: 'Autolaunched Flow',
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {
        objectApiName: lifecycleObjectApiName,
        fieldApiName: 'External_Code__c'
      },
      elements: [{
        id: 1,
        type: 'Start',
        label: 'Start',
        config: {}
      }, {
        id: 2,
        type: 'Get Records',
        label: 'Get lifecycle record',
        config: {
          objectApiName: lifecycleObjectApiName,
          fieldApiName: 'External_Code__c'
        }
      }],
      connectors: [],
      resources: [{
        name: 'Lifecycle_Record',
        label: 'Lifecycle Record',
        type: 'Record',
        dataType: lifecycleObjectApiName,
        isCollection: false,
        availableForInput: false,
        availableForOutput: false,
        value: '{!External_Code__c}'
      }],
      versions: []
    });
    assert.equal(lifecycleFlowDependency.status, 200, JSON.stringify(lifecycleFlowDependency.data));
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/External_Code__c`, adminToken, 'DELETE')).status, 409,
      'flow objectApiName and record resources must prevent deletion of referenced fields');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'DELETE')).status, 409,
      'flow objectApiName and record resources must prevent deletion of referenced objects');
    const flowGuardedObject = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    assert.ok(flowGuardedObject.fields.some((field: { apiName: string }) => field.apiName === 'External_Code__c'),
      'rejected flow-dependent field deletion must leave object metadata unchanged');
    assert.equal((await api.send('/metadata/flows/Object_Manager_Lifecycle_Flow_Dependency', adminToken, 'DELETE')).status, 204,
      'flow references must be removable before deleting their metadata dependencies');
    const lifecycleDependencyDashboard = await api.send('/metadata/dashboards/Object_Manager_Lifecycle_Dependencies', adminToken, 'PUT', {
      label: 'Lifecycle Dependency Dashboard',
      description: '',
      folderName: 'Smoke Tests',
      visibility: 'Private',
      sharedUserIds: [],
      sharedPermissionSetGroupIds: [],
      filterLogic: 'All',
      status: 'Draft',
      components: [],
      filters: [{
        id: 'lifecycle-code-filter',
        objectApiName: lifecycleObjectApiName,
        fieldApiName: 'External_Code__c',
        operator: 'Equals',
        value: 'LIFE-001'
      }]
    });
    assert.equal(lifecycleDependencyDashboard.status, 200, JSON.stringify(lifecycleDependencyDashboard.data));
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/External_Code__c`, adminToken, 'DELETE')).status, 409,
      'dashboard filters must prevent deletion of the fields they reference');
    const dashboardFeatureObject = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const dashboardFeatureDisableAttempt = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...dashboardFeatureObject,
      settings: { ...dashboardFeatureObject.settings, allowReports: false }
    });
    assert.equal(dashboardFeatureDisableAttempt.status, 409,
      'reports must not be disabled while saved dashboards reference the object');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'DELETE')).status, 409,
      'dashboard filters must prevent deletion of the objects they reference');
    assert.equal((await api.send('/metadata/dashboards/Object_Manager_Lifecycle_Dependencies', adminToken, 'PUT', {
      ...lifecycleDependencyDashboard.data.dashboard,
      filters: []
    })).status, 200, 'dashboard references must be removable before deleting their metadata dependencies');
    const lifecycleDependencyReport = await api.send('/metadata/reports/Object_Manager_Lifecycle_Dependencies', adminToken, 'PUT', {
      label: 'Lifecycle Dependency Report',
      description: '',
      objectApiName: lifecycleObjectApiName,
      fieldApiNames: ['External_Code__c'],
      groupByFieldApiNames: [],
      filters: []
    });
    assert.equal(lifecycleDependencyReport.status, 200, JSON.stringify(lifecycleDependencyReport.data));
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/External_Code__c`, adminToken, 'DELETE')).status, 409,
      'saved report columns must prevent deletion of the fields they reference');
    const reportFeatureObject = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const reportFeatureDisableAttempt = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...reportFeatureObject,
      settings: { ...reportFeatureObject.settings, allowReports: false }
    });
    assert.equal(reportFeatureDisableAttempt.status, 409,
      'reports must not be disabled while saved reports reference the object');
    const reportRun = await api.send('/reports/Object_Manager_Lifecycle_Dependencies/run', adminToken, 'POST', {
      offset: 0,
      limit: 100
    });
    assert.equal(reportRun.status, 200,
      `saved reports must remain runnable while their object reporting feature is enabled: ${JSON.stringify(reportRun.data)}`);
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'DELETE')).status, 409,
      'saved reports must prevent deletion of the objects they reference');
    assert.equal((await api.send('/metadata/reports/Object_Manager_Lifecycle_Dependencies', adminToken, 'DELETE')).status, 204,
      'report references must be removable before deleting their metadata dependencies');
    const reportsDisabledMetadata = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const reportsDisabled = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...reportsDisabledMetadata,
      settings: { ...reportsDisabledMetadata.settings, allowReports: false }
    });
    assert.equal(reportsDisabled.status, 200, JSON.stringify(reportsDisabled.data));
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...reportsDisabled.data.object,
      settings: { ...reportsDisabled.data.object.settings, allowReports: true }
    })).status, 200, 'reporting must be re-enabled after consumers are removed');
    const createdLifecycleFormula = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
      apiName: 'Name_Length__c',
      label: 'Name Length',
      dataType: 'Formula(Text)',
      required: false,
      unique: false,
      formula: { expression: 'Name', returnType: 'Text' }
    });
    assert.equal(createdLifecycleFormula.status, 201, JSON.stringify(createdLifecycleFormula.data));
    assert.deepEqual((await api.send(`/metadata/objects/${lifecycleObjectApiName}/formulas/validate`, adminToken, 'POST', {
      expression: 'Name & " suffix"',
      returnType: 'Text'
    })).data, { valid: true }, 'formula validation must accept supported syntax and known field references');
    const invalidFormulaSyntax = await api.send(`/metadata/objects/${lifecycleObjectApiName}/formulas/validate`, adminToken, 'POST', {
      expression: 'Name +',
      returnType: 'Text'
    });
    assert.equal(invalidFormulaSyntax.status, 422);
    assert.equal(invalidFormulaSyntax.data.valid, false, 'formula validation must return the syntax error without saving metadata');
    const unknownFormulaField = await api.send(`/metadata/objects/${lifecycleObjectApiName}/formulas/validate`, adminToken, 'POST', {
      expression: 'Missing_Field__c',
      returnType: 'Text'
    });
    assert.equal(unknownFormulaField.status, 422);
    assert.match(String(unknownFormulaField.data.error), /does not exist/,
      'formula validation must reject references to fields outside the selected object');
    const lifecycleMetadata = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const lifecycleHistoryMetadata = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleMetadata,
      settings: { ...lifecycleMetadata.settings, trackFieldHistory: true },
      fields: lifecycleMetadata.fields.map((field) => field.apiName === 'External_Code__c'
        ? { ...field, trackHistory: true }
        : field)
    });
    assert.equal(lifecycleHistoryMetadata.status, 200, JSON.stringify(lifecycleHistoryMetadata.data));
    for (let index = 1; index <= 20; index += 1) {
      const fieldApiName = `Tracked_History_${String(index).padStart(2, '0')}__c`;
      const trackedField = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields`, adminToken, 'POST', {
        apiName: fieldApiName,
        label: `Tracked History ${index}`,
        dataType: 'Text(80)',
        required: false,
        unique: false,
        trackHistory: true
      });
      assert.equal(trackedField.status, 201, `objects must allow more than 20 tracked fields: ${JSON.stringify(trackedField.data)}`);
    }
    const lifecycleTrackedMetadata = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    const lifecycleFieldSet = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleTrackedMetadata,
      fieldSets: [{ apiName: 'LifecycleSummary', label: 'Lifecycle Summary', fieldApiNames: ['Name', 'External_Code__c'] }]
    });
    assert.equal(lifecycleFieldSet.status, 200, JSON.stringify(lifecycleFieldSet.data));
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'Invalid Missing Code'
    })).status, 422, 'required custom fields must be enforced by record creation');
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'Invalid Picklist',
      External_Code__c: 'LIFE-INVALID',
      Lifecycle_Status__c: 'Unknown'
    })).status, 422, 'restricted picklist values must be enforced at runtime');
    const lifecycleRecord = await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'Lifecycle Record',
      External_Code__c: 'LIFE-001'
    });
    assert.equal(lifecycleRecord.status, 201, JSON.stringify(lifecycleRecord.data));
    assert.equal(lifecycleRecord.data.record.CreatedById, lifecycleAdminUserId,
      'record creation must stamp the creating user');
    assert.equal(lifecycleRecord.data.record.LastModifiedById, lifecycleAdminUserId,
      'record creation must stamp the last modifying user');
    assert.ok(Number.isFinite(Date.parse(lifecycleRecord.data.record.SystemModstamp)),
      'record creation must stamp a valid system modification timestamp');
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'Spoofed Audit Fields',
      External_Code__c: 'LIFE-SPOOF',
      CreatedById: 'attacker',
      SystemModstamp: new Date().toISOString()
    })).status, 422, 'clients must not set read-only audit system fields');
    assert.equal(lifecycleRecord.data.record.Lifecycle_Status__c, 'Open',
      'custom field defaults must be applied when the record is created');
    assert.equal(lifecycleRecord.data.record.Name_Length__c, 'Lifecycle Record',
      'formula fields must calculate from the saved record values');
    const uniqueLookupParent = await api.send('/records/Account', adminToken, 'POST', {
      Name: 'Unique Lookup Parent'
    });
    assert.equal(uniqueLookupParent.status, 201, JSON.stringify(uniqueLookupParent.data));
    const firstUniqueLookupRecord = await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'First Unique Lookup',
      External_Code__c: 'LU-001',
      Unique_Account__c: uniqueLookupParent.data.record.Id
    });
    assert.equal(firstUniqueLookupRecord.status, 201, JSON.stringify(firstUniqueLookupRecord.data));
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'Duplicate Unique Lookup',
      External_Code__c: 'LU-002',
      Unique_Account__c: uniqueLookupParent.data.record.Id
    })).status, 422, 'unique lookup fields must enforce one-to-one cardinality');
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}/${firstUniqueLookupRecord.data.record.Id}`, adminToken, 'DELETE')).status, 204,
      'the uniqueness fixture record must be cleaned up after cardinality is verified');
    assert.equal((await api.send(`/records/Account/${uniqueLookupParent.data.record.Id}`, adminToken, 'DELETE')).status, 204,
      'the uniqueness fixture parent must be cleaned up after cardinality is verified');
    const trackedLifecycleUpdate = await api.send(`/records/${lifecycleObjectApiName}/${lifecycleRecord.data.record.Id}`, adminToken, 'PUT', {
      External_Code__c: 'LIFE-002'
    });
    assert.equal(trackedLifecycleUpdate.status, 200, JSON.stringify(trackedLifecycleUpdate.data));
    assert.equal(trackedLifecycleUpdate.data.record.CreatedById, lifecycleAdminUserId,
      'record updates must preserve the original creating user');
    assert.equal(trackedLifecycleUpdate.data.record.LastModifiedById, lifecycleAdminUserId,
      'record updates must stamp the modifying user');
    assert.ok(Number.isFinite(Date.parse(trackedLifecycleUpdate.data.record.SystemModstamp)),
      'record updates must refresh the system modification timestamp');
    const lifecycleHistory = await api.send(`/records/${lifecycleObjectApiName}/${lifecycleRecord.data.record.Id}/history`, adminToken);
    assert.equal(lifecycleHistory.status, 200, JSON.stringify(lifecycleHistory.data));
    assert.equal(lifecycleHistory.data.history.length, 1, 'enabled field history must record tracked field changes');
    assert.equal(lifecycleHistory.data.history[0].fieldApiName, 'External_Code__c');
    assert.equal(lifecycleHistory.data.history[0].oldValue, 'LIFE-001');
    assert.equal(lifecycleHistory.data.history[0].newValue, 'LIFE-002');
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}`, adminToken, 'POST', {
      Name: 'Duplicate Lifecycle Record',
      External_Code__c: 'LIFE-002'
    })).status, 422, 'unique custom fields must reject duplicate runtime values');
    const lifecycleCodeUpdate = await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/External_Code__c`, adminToken, 'PUT', {
      ...createdLifecycleCode.data.field,
      label: 'External Reference'
    });
    assert.equal(lifecycleCodeUpdate.status, 200, JSON.stringify(lifecycleCodeUpdate.data));
    const lifecycleBeforeStatusDelete = (await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken)).data.object;
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'PUT', {
      ...lifecycleBeforeStatusDelete,
      pageLayouts: lifecycleBeforeStatusDelete.pageLayouts.map((layout: Record<string, any>) => ({
        ...layout,
        sections: layout.sections.map((section: Record<string, any>) => ({
          ...section,
          fieldApiNames: section.fieldApiNames.filter((name: string) => name !== 'Lifecycle_Status__c')
        }))
      }))
    })).status, 200, 'field placements must be removable before deleting their field');
    const lifecyclePermissions = (await api.send('/metadata/permissions', adminToken)).data;
    lifecyclePermissions.profiles.find((profile: { id: string }) => profile.id === 'system-administrator')
      .fieldPermissions[`${lifecycleObjectApiName}.Lifecycle_Status__c`] = { read: true, edit: true };
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', lifecyclePermissions)).status, 200,
      'the lifecycle field access fixture must be saved');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}/fields/Lifecycle_Status__c`, adminToken, 'DELETE')).status, 200,
      'unreferenced custom fields must be deletable');
    const cleanedLifecyclePermissions = (await api.send('/metadata/permissions', adminToken)).data;
    assert.equal(Object.hasOwn(cleanedLifecyclePermissions.profiles.find((profile: { id: string }) =>
      profile.id === 'system-administrator').fieldPermissions, `${lifecycleObjectApiName}.Lifecycle_Status__c`), false,
    'permitted field deletion must remove stale profile field access metadata');
    const lifecycleRecordAfterFieldDelete = await api.send(`/records/${lifecycleObjectApiName}/${lifecycleRecord.data.record.Id}`, adminToken);
    assert.equal(lifecycleRecordAfterFieldDelete.status, 200, JSON.stringify(lifecycleRecordAfterFieldDelete.data));
    assert.equal(Object.hasOwn(lifecycleRecordAfterFieldDelete.data.record, 'Lifecycle_Status__c'), false,
      'deleting a custom field must remove that value from existing records');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, adminToken, 'DELETE')).status, 409,
      'custom objects with records must not be deleted');
    const autoNumberObjectApiName = 'Auto_Number_Lifecycle__c';
    const autoNumberObject = await api.send('/metadata/objects', adminToken, 'POST', {
      apiName: autoNumberObjectApiName,
      label: 'Auto Number Lifecycle',
      pluralLabel: 'Auto Number Lifecycles',
      kind: 'Custom Object',
      description: '',
      fields: [{ apiName: 'Name', label: 'Lifecycle Number', dataType: 'AutoNumber', required: true, unique: false }],
      settings: {
        allowReports: true,
        allowActivities: true,
        trackFieldHistory: false,
        allowInChatter: false,
        deploymentStatus: 'Deployed',
        recordNameType: 'Auto Number',
        recordNameFormat: 'LIFE-{0000}'
      }
    });
    assert.equal(autoNumberObject.status, 201, JSON.stringify(autoNumberObject.data));
    const originalAutoNumberMetadata = autoNumberObject.data.object as Record<string, any>;
    assert.equal((await api.send(`/metadata/objects/${autoNumberObjectApiName}`, adminToken, 'PUT', {
      ...originalAutoNumberMetadata,
      apiName: 'Renamed_Auto_Number_Lifecycle__c'
    })).status, 400, 'object API names must remain immutable after creation');
    assert.equal((await api.send(`/metadata/objects/${autoNumberObjectApiName}/fields/Name`, adminToken, 'PUT', {
      ...originalAutoNumberMetadata.fields.find((field: { apiName: string }) => field.apiName === 'Name'),
      apiName: 'Renamed_Name'
    })).status, 400, 'field API names must remain immutable after creation');
    assert.equal((await api.send(`/metadata/objects/${autoNumberObjectApiName}`, adminToken, 'PUT', {
      ...originalAutoNumberMetadata,
      settings: { ...originalAutoNumberMetadata.settings, recordNameFormat: 'LIFE-no-sequence' }
    })).status, 400, 'auto-number formats must include exactly one numeric token');
    const updatedAutoNumberMetadata = {
      ...originalAutoNumberMetadata,
      label: 'Updated Auto Number Lifecycle',
      pluralLabel: 'Updated Auto Number Lifecycles',
      description: 'Updated object metadata must persist.',
      settings: {
        ...originalAutoNumberMetadata.settings,
        allowReports: false,
        allowActivities: true,
        trackFieldHistory: true,
        allowInChatter: true
      }
    };
    const savedAutoNumberMetadata = await api.send(`/metadata/objects/${autoNumberObjectApiName}`, adminToken, 'PUT', updatedAutoNumberMetadata);
    assert.equal(savedAutoNumberMetadata.status, 200, JSON.stringify(savedAutoNumberMetadata.data));
    const firstAutoNumberRecord = await api.send(`/records/${autoNumberObjectApiName}`, adminToken, 'POST', {});
    const secondAutoNumberRecord = await api.send(`/records/${autoNumberObjectApiName}`, adminToken, 'POST', {});
    assert.equal(firstAutoNumberRecord.status, 201, JSON.stringify(firstAutoNumberRecord.data));
    assert.equal(secondAutoNumberRecord.status, 201, JSON.stringify(secondAutoNumberRecord.data));
    assert.deepEqual([firstAutoNumberRecord.data.record.Name, secondAutoNumberRecord.data.record.Name],
      ['LIFE-0001', 'LIFE-0002'], 'custom object auto-number record names must follow the configured display format');
    assert.equal((await api.send(`/records/${autoNumberObjectApiName}/${firstAutoNumberRecord.data.record.Id}`, adminToken, 'DELETE')).status, 204);
    const thirdAutoNumberRecord = await api.send(`/records/${autoNumberObjectApiName}`, adminToken, 'POST', {});
    assert.equal(thirdAutoNumberRecord.status, 201, JSON.stringify(thirdAutoNumberRecord.data));
    assert.equal(thirdAutoNumberRecord.data.record.Name, 'LIFE-0003',
      'auto-number sequences must not reuse numbers after deleting records');
    const objectMetadata = (await api.send('/metadata/objects', adminToken)).data.objects as Array<{ apiName: string; pluralLabel: string }>;
    const developmentOnlyObject = objectMetadata.find((object) => object.apiName === 'Development_Only__c');
    assert.ok(developmentOnlyObject, 'the deployment-status test object must be registered');
    const developmentOnlyMetadata = (await api.send('/metadata/objects/Development_Only__c', adminToken)).data.object as Record<string, any>;
    const metadataWithFieldSet = {
      ...developmentOnlyMetadata,
      fieldSets: [{ apiName: 'Summary', label: 'Summary', fieldApiNames: ['Name'] }]
    };
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', metadataWithFieldSet)).status, 200,
      'valid field sets must be saved');
    const editedFieldSetMetadata = {
      ...metadataWithFieldSet,
      fieldSets: [{ ...metadataWithFieldSet.fieldSets[0], apiName: 'SummaryDetails', label: 'Summary Details' }]
    };
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', editedFieldSetMetadata)).status, 200,
      'field set API names and labels must be editable');
    assert.deepEqual((await api.send('/metadata/objects/Development_Only__c', adminToken)).data.object.fieldSets,
      editedFieldSetMetadata.fieldSets, 'edited field set names and saved field order must persist');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithFieldSet,
      fieldSets: [
        ...metadataWithFieldSet.fieldSets,
        { apiName: 'SummaryOther', label: 'summary', fieldApiNames: ['Name'] }
      ]
    })).status, 400, 'field set labels must be unique without regard to case');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithFieldSet,
      listViewButtons: ['New', 'Printable View']
    })).status, 200, 'supported list view buttons must be saved');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithFieldSet,
      listViewButtons: ['New', 'Future Button']
    })).status, 400, 'list view buttons must use the supported Object Manager options');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithFieldSet,
      listViewButtons: ['New', 'New']
    })).status, 400, 'list view button selections must be unique');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithFieldSet,
      fieldSets: [...metadataWithFieldSet.fieldSets, { apiName: 'summary', label: 'Duplicate Name', fieldApiNames: ['Name'] }]
    })).status, 400, 'field set API names must be unique without regard to case');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithFieldSet,
      fieldSets: [{ apiName: '123Summary', label: 'Invalid Name', fieldApiNames: ['Name'] }]
    })).status, 400, 'field set API names must follow the identifier format');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithFieldSet,
      fieldSets: [{ apiName: 'RepeatedFields', label: 'Repeated Fields', fieldApiNames: ['Name', 'Name'] }]
    })).status, 400, 'field sets cannot contain the same field more than once');
    const metadataWithSearchLayouts = {
      ...metadataWithFieldSet,
      searchLayouts: { searchResults: ['Name'], lookupDialog: ['Name'], lookupPhoneDialog: [] }
    };
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', metadataWithSearchLayouts)).status, 200,
      'supported search layouts must save');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithSearchLayouts,
      searchLayouts: { ...metadataWithSearchLayouts.searchLayouts, lookupMobileDialog: ['Name'] }
    })).status, 400, 'unsupported search layout keys must be rejected rather than silently ignored');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithSearchLayouts,
      searchLayouts: { ...metadataWithSearchLayouts.searchLayouts, lookupDialog: ['Name', 'Name'] }
    })).status, 400, 'search layouts cannot contain duplicate fields');
    const developmentLayout = metadataWithSearchLayouts.pageLayouts[0];
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithSearchLayouts,
      pageLayouts: [{
        ...developmentLayout,
        sections: [...developmentLayout.sections, {
          id: 'duplicate-name-field',
          label: 'Duplicate',
          columns: 1,
          fieldApiNames: ['Name']
        }]
      }]
    })).status, 400, 'a field cannot be placed multiple times in the same page layout');
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', {
      ...metadataWithSearchLayouts,
      pageLayouts: metadataWithSearchLayouts.pageLayouts.map((layout: Record<string, any>) => ({
        ...layout,
        relatedLists: ['Contacts', 'contacts']
      }))
    })).status, 400, 'page layouts cannot configure the same related list more than once');
    const developmentOnlyRecord = await api.send('/records/Development_Only__c', adminToken, 'POST', { Name: 'Deployment Gate' });
    assert.equal(developmentOnlyRecord.status, 201, JSON.stringify(developmentOnlyRecord.data));
    assert.equal((await api.send('/records/Development_Only__c', developmentReaderToken)).status, 403,
      'users without object customization rights cannot read records on an in-development object');
    assert.equal((await api.send('/records/Development_Only__c', developmentReaderToken, 'POST', { Name: 'Blocked Create' })).status, 403,
      'users without object customization rights cannot create records on an in-development object');
    const developmentMetadata = (await api.send('/metadata/objects/Development_Only__c', adminToken)).data.object;
    const deployedMetadata = {
      ...developmentMetadata,
      settings: { ...developmentMetadata.settings, deploymentStatus: 'Deployed' }
    };
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', deployedMetadata)).status, 200,
      'administrators can deploy the object');
    assert.equal((await api.send('/records/Development_Only__c', developmentReaderToken)).status, 200,
      'deployed objects honor the user’s configured object permissions');
    const restoredDevelopmentMetadata = {
      ...deployedMetadata,
      settings: { ...deployedMetadata.settings, deploymentStatus: 'In Development' }
    };
    assert.equal((await api.send('/metadata/objects/Development_Only__c', adminToken, 'PUT', restoredDevelopmentMetadata)).status, 200,
      'administrators can return the object to development status');
    assert.equal((await api.send('/records/Development_Only__c', developmentReaderToken)).status, 403,
      'returning an object to development status immediately restricts runtime access');
    assert.ok(objectMetadata.some((object) => object.apiName === 'UneConnector__c' && object.pluralLabel === 'Une Connectors'),
      'Une Connectors must be available in Object Manager metadata');
    assert.ok(objectMetadata.some((object) => object.apiName === 'ConnectorProvider__c' && object.pluralLabel === 'Connector Providers'),
      'connector provider definitions must be available as object records');
    assert.ok(objectMetadata.some((object) => object.apiName === 'IntegrationConnection__c' && object.pluralLabel === 'Integration Connections'),
      'tenant Integration Connections must be available as object records');
    assert.ok(objectMetadata.some((object) => object.apiName === 'Communication_Records__c'),
      'Communication Records must be available in Object Manager metadata');
    assert.equal((await api.send('/connector-providers', adminToken, 'GET', undefined, 'web-app')).status, 200,
      'web app requests must continue to work when marked as internal');
    const communicationRecordsResponse = await api.send('/records/Communication_Records__c', adminToken, 'GET', undefined, 'web-app');
    assert.equal(communicationRecordsResponse.status, 200, 'Communication Records must be readable through the standard Records API');
    const communicationRecords = communicationRecordsResponse.data.records as Array<Record<string, unknown>>;
    assert.ok(communicationRecords.some((record) => record.Api_Id__c === 'GET /api/metadata/objects'
      && record.Direction__c === 'Incoming'
      && record.Method__c === 'GET'
      && record.Auth_Type__c === 'Bearer'
      && typeof record.Response_Body__c === 'string'
      && record.Response_Body__c.includes('Communication_Records__c')),
    'authenticated incoming API requests must be recorded with method, auth type, and response body');
    assert.ok(!communicationRecords.some((record) => record.Api_Id__c === 'GET /api/connector-providers'),
      'web app API requests must not be recorded as external incoming API requests');
    const connectorRecordsResponse = await api.send('/records/UneConnector__c', adminToken);
    assert.equal(connectorRecordsResponse.status, 200, 'connector records must use the standard Records API');
    assert.deepEqual((connectorRecordsResponse.data.records as Array<Record<string, unknown>>).map((record) => record.Name),
      ['WhatsApp', 'Email', 'SMS', 'Uber', 'Deliveroo']);
    const providerRecords = (await api.send('/records/ConnectorProvider__c', adminToken)).data.records as Array<Record<string, unknown>>;
    assert.equal(providerRecords.length, 5, 'standard connector provider records must be seeded');
    const providersResponse = await api.send('/connector-providers', adminToken);
    assert.equal(providersResponse.status, 200, `provider definitions must be available as tenant metadata: ${JSON.stringify(providersResponse.data)}\n${apiLogs}`);
    const providers = providersResponse.data.providers as Array<Record<string, any>>;
    assert.equal(providers[0].connectorKey, 'META_WHATSAPP');
    assert.deepEqual(providers[0].operations.send_message, { method: 'POST', path: '/{phone_number_id}/messages' });
    const secret = 'integration-smoke-secret';
    const createConnection = await api.send('/integration-connections', adminToken, 'POST', {
      connectorKey: 'META_WHATSAPP',
      name: 'WhatsApp Production',
      configuration: { phone_number_id: 'phone-123', waba_id: 'waba-456' },
      credentials: { access_token: secret },
      status: 'ACTIVE'
    });
    assert.equal(createConnection.status, 201, `Integration Connections must be creatable: ${JSON.stringify(createConnection.data)}\n${apiLogs}`);
    const savedConnection = createConnection.data.connection as Record<string, any>;
    assert.equal(savedConnection.hasCredentials, true);
    assert.equal(savedConnection.credentialFields.find((field: Record<string, unknown>) => field.name === 'access_token').configured, true);
    assert.equal(JSON.stringify(createConnection.data).includes(secret), false, 'encrypted credentials must never be returned to clients');
    const connectionRecords = (await api.send('/records/IntegrationConnection__c', adminToken)).data.records as Array<Record<string, unknown>>;
    assert.equal(connectionRecords[0].Name, 'WhatsApp Production');
    assert.equal(JSON.stringify(connectionRecords).includes(secret), false, 'standard Records must not expose encrypted connector credentials');
    const persistedState = await readFile(dataPath, 'utf8');
    assert.equal(persistedState.includes(secret), false, 'connector secrets must not be persisted in plaintext');
    const updatedConnection = await api.send(`/integration-connections/${savedConnection.id}`, adminToken, 'PUT', {
      connectorKey: 'META_WHATSAPP',
      name: 'WhatsApp Production',
      configuration: { phone_number_id: 'phone-123', waba_id: 'waba-456' },
      credentials: {},
      status: 'ACTIVE'
    });
    assert.equal(updatedConnection.status, 200, 'blank secret edits must preserve encrypted credentials');
    assert.equal(updatedConnection.data.connection.hasCredentials, true);
    const connectorSettingsResponse = await api.send('/connector-settings', adminToken);
    assert.equal(connectorSettingsResponse.status, 200, `connector settings must be readable as tenant metadata: ${JSON.stringify(connectorSettingsResponse.data)}\n${apiLogs}`);
    const connectors = connectorSettingsResponse.data.connectors as Array<{
      apiName: string; label: string; fields: Array<{ apiName: string; label: string; value: string }>
    }>;
    assert.deepEqual(connectors.map((connector) => connector.label), ['WhatsApp', 'Email', 'SMS', 'Uber', 'Deliveroo']);
    const whatsappSettings = connectors[0];
    const updatedWhatsapp = {
      ...whatsappSettings,
      fields: whatsappSettings.fields.map((field) => field.apiName === 'ApiBaseUrl'
        ? { ...field, value: 'https://api.example.test' }
        : field)
    };
    assert.equal((await api.send(`/connector-settings/${whatsappSettings.apiName}`, adminToken, 'PUT', updatedWhatsapp)).status, 200,
      'connector setting values must be saved');
    const reloadedConnectors = (await api.send('/connector-settings', adminToken)).data.connectors as typeof connectors;
    assert.equal(reloadedConnectors[0].fields.find((field) => field.apiName === 'ApiBaseUrl')?.value, 'https://api.example.test',
      'saved connector settings must be returned from the connector records');
    const newConnector = await api.send('/records/UneConnector__c', adminToken, 'POST', {
      Name: 'Slack', ConnectorType__c: 'Slack', Configuration__c: JSON.stringify({ ApiBaseUrl: 'https://slack.example.test' })
    });
    assert.equal(newConnector.status, 201, 'connector records must be creatable from the standard Records API');
    const connectorAfterCreate = (await api.send('/connector-settings', adminToken)).data.connectors as typeof connectors;
    assert.ok(connectorAfterCreate.some((connector) =>
      connector.apiName === 'Slack' && connector.fields.some((field) => field.apiName === 'ApiBaseUrl' && field.value === 'https://slack.example.test')),
    'records added from Records must appear in connector setup with their configuration values');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Budget__c', label: 'Budget', dataType: 'Currency(5, 2)', required: false, unique: false
    })).status, 201, 'custom numeric field definitions must persist precision and scale');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Short_Code__c', label: 'Short Code', dataType: 'Text(10)', required: false, unique: false
    })).status, 201, 'custom text field definitions must persist the configured length');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Invalid_Number__c', label: 'Invalid Number', dataType: 'Number(19, 2)', required: false, unique: false
    })).status, 400, 'numeric precision must not exceed platform limits');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Invalid_Text__c', label: 'Invalid Text', dataType: 'Text(256)', required: false, unique: false
    })).status, 400, 'text length must not exceed platform limits');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Oversized_Text_Default__c', label: 'Oversized Text Default', dataType: 'Text(3)',
      required: false, unique: false, defaultValue: 'four'
    })).status, 400, 'text defaults must fit the configured field length');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Invalid_Default__c', label: 'Invalid Default', dataType: 'Picklist',
      required: false, unique: false, picklistValues: ['Ready', 'Done'], picklistRestricted: true, defaultValue: 'Unknown'
    })).status, 400, 'restricted picklist defaults must come from the configured value set');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Unsupported_Type__c', label: 'Unsupported Type', dataType: 'Unsupported',
      required: false, unique: false
    })).status, 400, 'the metadata API must reject field types that are not exposed by the field builder');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Invalid_Email_Default__c', label: 'Invalid Email Default', dataType: 'Email',
      required: false, unique: false, defaultValue: 'not-an-email'
    })).status, 400, 'email field defaults must be validated before metadata is saved');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Invalid_DateTime_Default__c', label: 'Invalid DateTime Default', dataType: 'Date/Time',
      required: false, unique: false, defaultValue: '2026-02-30T10:00:00Z'
    })).status, 400, 'date/time defaults must reject impossible calendar dates');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Unconfigured_Formula__c', label: 'Unconfigured Formula', dataType: 'Formula(Number)',
      required: false, unique: false
    })).status, 400, 'formula data types must include a formula definition');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Invalid_Multi_Default__c', label: 'Invalid Multi Default', dataType: 'Multi-Select Picklist',
      required: false, unique: false, picklistValues: ['Product', 'Events'], picklistRestricted: true, defaultValue: 'Product;Unknown'
    })).status, 400, 'every multi-select picklist default must come from the configured value set');
    assert.equal((await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Unique_Multi__c', label: 'Unique Multi', dataType: 'Multi-Select Picklist',
      required: false, unique: true, picklistValues: ['Product', 'Events']
    })).status, 400, 'multi-select fields must reject unsupported unique constraints');
    const emailField = await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Validated_Email__c', label: 'Validated Email', dataType: 'Email',
      required: false, unique: false, defaultValue: 'default@example.test'
    });
    assert.equal(emailField.status, 201, JSON.stringify(emailField.data));
    const dateTimeField = await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Validated_DateTime__c', label: 'Validated Date Time', dataType: 'Date/Time',
      required: false, unique: false
    });
    assert.equal(dateTimeField.status, 201, JSON.stringify(dateTimeField.data));
    const precisionValid = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Precision Valid Contact', Budget__c: 999.99, Short_Code__c: '1234567890'
    });
    assert.equal(precisionValid.status, 201, JSON.stringify(precisionValid.data));
    assert.equal(precisionValid.data.record.Validated_Email__c, 'default@example.test',
      'valid field defaults must be applied consistently on record creation');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Invalid Runtime Email Contact', Validated_Email__c: 'not-an-email'
    })).status, 422, 'email validation must run on API record writes');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Invalid Runtime Date Contact', Validated_DateTime__c: '2026-02-30T10:00:00Z'
    })).status, 422, 'date/time validation must reject impossible dates on API record writes');
    const validDateTimeContact = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Valid Runtime Date Contact', Validated_DateTime__c: '2026-03-01T10:00:00Z'
    });
    assert.equal(validDateTimeContact.status, 201, JSON.stringify(validDateTimeContact.data));
    const fieldMetadata = (await api.send('/metadata/objects/Contact', adminToken)).data.object.fields as Array<Record<string, unknown>>;
    const budgetField = fieldMetadata.find((field) => field.apiName === 'Budget__c')!;
    const shortCodeField = fieldMetadata.find((field) => field.apiName === 'Short_Code__c')!;
    const expandedBudgetField = await api.send('/metadata/objects/Contact/fields/Budget__c', adminToken, 'PUT', {
      ...budgetField, dataType: 'Currency(6, 2)'
    });
    assert.equal(expandedBudgetField.status, 200, JSON.stringify(expandedBudgetField.data));
    const expandedShortCodeField = await api.send('/metadata/objects/Contact/fields/Short_Code__c', adminToken, 'PUT', {
      ...shortCodeField, dataType: 'Text(12)'
    });
    assert.equal(expandedShortCodeField.status, 200, JSON.stringify(expandedShortCodeField.data));
    assert.equal((await api.send('/metadata/objects/Contact/fields/Budget__c', adminToken, 'PUT', {
      ...expandedBudgetField.data.field, dataType: 'Currency(4, 2)'
    })).status, 409, 'numeric precision cannot be reduced below existing saved values');
    assert.equal((await api.send('/metadata/objects/Contact/fields/Budget__c', adminToken, 'PUT', {
      ...expandedBudgetField.data.field, dataType: 'Currency(5, 1)'
    })).status, 409, 'numeric scale cannot be reduced below existing saved values');
    assert.equal((await api.send('/metadata/objects/Contact/fields/Short_Code__c', adminToken, 'PUT', {
      ...expandedShortCodeField.data.field, dataType: 'Text(9)'
    })).status, 409, 'text length cannot be reduced below existing saved values');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Precision Overflow Contact', Budget__c: 10000
    })).status, 422, 'numeric precision must be enforced on record values');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Text Length Boundary Contact', Short_Code__c: '123456789012'
    })).status, 201, 'text field values at the configured length must be accepted');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Scale Overflow Contact', Budget__c: 1.239
    })).status, 422, 'numeric scale must be enforced on record values');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Text Length Overflow Contact', Short_Code__c: '1234567890123'
    })).status, 422, 'configured text lengths must be enforced on record values');
    const accountMetadataForLists = (await api.send('/metadata/objects/Account', adminToken)).data.object;
    assert.equal((await api.send('/metadata/objects/Account', adminToken, 'PUT', {
      ...accountMetadataForLists,
      pageLayouts: accountMetadataForLists.pageLayouts.map((layout: Record<string, any>) => ({ ...layout, relatedLists: ['Unknown Relationship'] }))
    })).status, 400, 'page layouts must reject related lists without a relationship to the object');
    const accountWithRelatedList = await api.send('/metadata/objects/Account', adminToken, 'PUT', {
      ...accountMetadataForLists,
      pageLayouts: accountMetadataForLists.pageLayouts.map((layout: Record<string, any>) => ({ ...layout, relatedLists: ['Contacts'] }))
    });
    assert.equal(accountWithRelatedList.status, 200, JSON.stringify(accountWithRelatedList.data));
    assert.equal((await api.send('/metadata/objects/Account', adminToken, 'PUT', accountMetadataForLists)).status, 200,
      'related-list metadata must be restored before subsequent smoke checks');
    const lookupContactMetadata = (await api.send('/metadata/objects/Contact', adminToken)).data.object;
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      relatedLookupFilters: [{
        id: 'invalid-lookup-target',
        fieldApiName: 'AccountId',
        relatedObject: 'Contact',
        relatedFieldApiName: 'Name',
        operator: 'Equals',
        value: 'x',
        required: true
      }]
    })).status, 400, 'lookup filters must target the object referenced by their relationship field');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      relatedLookupFilters: [{
        id: 'invalid-lookup-related-field',
        fieldApiName: 'AccountId',
        relatedObject: 'Account',
        relatedFieldApiName: 'Does_Not_Exist__c',
        operator: 'Equals',
        value: 'x',
        required: true
      }]
    })).status, 400, 'lookup filters must reference an existing field on the related object');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      relatedLookupFilters: [{
        id: 'invalid-lookup-source-field',
        fieldApiName: 'AccountId',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Equals',
        value: '',
        valueFieldApiName: 'Does_Not_Exist__c',
        required: true
      }]
    })).status, 400, 'lookup filters must reference an existing comparison field on the source object');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      relatedLookupFilters: [{
        id: 'invalid-lookup-operator-type',
        fieldApiName: 'AccountId',
        relatedObject: 'Account',
        relatedFieldApiName: 'AnnualRevenue',
        operator: 'Contains',
        value: '100',
        required: true
      }]
    })).status, 400, 'lookup filters must reject text operators on numeric target fields');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      relatedLookupFilters: [{
        id: 'invalid-lookup-comparison-type',
        fieldApiName: 'AccountId',
        relatedObject: 'Account',
        relatedFieldApiName: 'AnnualRevenue',
        operator: 'Equals',
        value: '',
        valueFieldApiName: 'Name',
        required: true
      }]
    })).status, 400, 'field-to-field lookup filters must reject incompatible comparison types');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      relatedLookupFilters: [{
        id: 'invalid-lookup-source-field',
        fieldApiName: 'Name',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Equals',
        value: 'x',
        required: true
      }]
    })).status, 400, 'lookup filters must be attached to a relationship field');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      actions: [...lookupContactMetadata.actions, { id: 'custom-delete-alias', label: 'delete', type: 'Custom', enabled: true }]
    })).status, 400, 'custom object actions must not shadow standard record actions');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      actions: [...lookupContactMetadata.actions, {
        id: 'custom-invalid-target', label: 'Invalid Action', type: 'Custom', enabled: true,
        behavior: 'Set Field Value', fieldApiName: 'AccountId', value: 'not-an-account-id'
      }]
    })).status, 400, 'custom field-update actions cannot target relationship fields');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      pageLayouts: lookupContactMetadata.pageLayouts.map((layout: Record<string, any>) => ({ ...layout, actions: ['Unsupported Action'] }))
    })).status, 400, 'page layouts must reject actions without runtime behavior');
    const withoutNewAction = await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      pageLayouts: lookupContactMetadata.pageLayouts.map((layout: Record<string, any>) => ({ ...layout, actions: layout.actions.filter((action: string) => action !== 'New') }))
    });
    assert.equal(withoutNewAction.status, 200, JSON.stringify(withoutNewAction.data));
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', { Name: 'Disabled New Action Contact' })).status, 403,
      'disabling New in page layouts must prevent record creation on the server');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...withoutNewAction.data.object,
      pageLayouts: lookupContactMetadata.pageLayouts
    })).status, 200, 'page-layout actions must be restored before other smoke checks');
    const lookupFilterUpdate = await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupContactMetadata,
      actions: [...lookupContactMetadata.actions, {
        id: 'custom-set-email', label: 'Set Automation Email', type: 'Custom', enabled: true,
        behavior: 'Set Field Value', fieldApiName: 'Email', value: 'automation@example.test'
      }],
      relatedLookupFilters: [
        { id: 'account-name-prefix', fieldApiName: 'AccountId', relatedObject: 'Account', relatedFieldApiName: 'Name', operator: 'Starts With', value: 'Good', required: true },
        { id: 'account-website-empty', fieldApiName: 'AccountId', relatedObject: 'Account', relatedFieldApiName: 'Website', operator: 'Is Null', value: '', required: true }
      ]
    });
    assert.equal(lookupFilterUpdate.status, 200, JSON.stringify(lookupFilterUpdate.data));
    const matchingAccount = await api.send('/records/Account', adminToken, 'POST', { Name: 'Good Lookup Account' });
    assert.equal(matchingAccount.status, 201, JSON.stringify(matchingAccount.data));
    const matchingContact = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Matching Lookup Contact', AccountId: matchingAccount.data.record.Id
    });
    assert.equal(matchingContact.status, 201, JSON.stringify(matchingContact.data));
    const customActionUpdate = await api.send(`/records/Contact/${matchingContact.data.record.Id}`, adminToken, 'PUT', { Email: 'automation@example.test' });
    assert.equal(customActionUpdate.status, 200, 'configured custom actions use the standard permission-checked record update');
    assert.equal(customActionUpdate.data.record.Email, 'automation@example.test');
    const nonMatchingAccount = await api.send('/records/Account', adminToken, 'POST', { Name: 'Bad Lookup Account' });
    assert.equal(nonMatchingAccount.status, 201, JSON.stringify(nonMatchingAccount.data));
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Non-Matching Lookup Contact', AccountId: nonMatchingAccount.data.record.Id
    })).status, 422, 'Starts With lookup filters must reject nonmatching related records');
    const anyLookupFilterUpdate = await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupFilterUpdate.data.object,
      relatedLookupFilterLogic: { AccountId: 'Any' }
    });
    assert.equal(anyLookupFilterUpdate.status, 200, JSON.stringify(anyLookupFilterUpdate.data));
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Any Lookup Filter Contact', AccountId: nonMatchingAccount.data.record.Id
    })).status, 201, 'Any logic must accept a related record matching at least one required criterion');
    const anyLogicRejectAccount = await api.send('/records/Account', adminToken, 'POST', {
      Name: 'Bad Lookup Account With Website',
      Website: 'https://example.test'
    });
    assert.equal(anyLogicRejectAccount.status, 201, JSON.stringify(anyLogicRejectAccount.data));
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Any Logic Non-Matching Contact', AccountId: anyLogicRejectAccount.data.record.Id
    })).status, 422, 'Any logic must reject a related record matching none of the required criteria');
    const optionalLookupFilterUpdate = await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupFilterUpdate.data.object,
      relatedLookupFilters: [{
        id: 'optional-account-name-prefix',
        fieldApiName: 'AccountId',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Starts With',
        value: 'Good',
        required: false
      }]
    });
    assert.equal(optionalLookupFilterUpdate.status, 200, JSON.stringify(optionalLookupFilterUpdate.data));
    const optionalFilterContact = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Optional Lookup Filter Contact', AccountId: nonMatchingAccount.data.record.Id
    });
    assert.equal(optionalFilterContact.status, 201, 'optional lookup filters must not block saving a nonmatching related record');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', lookupFilterUpdate.data.object)).status, 200,
      'required lookup filter metadata must be restored before update and import checks');
    const rejectedLookupUpdate = await api.send(`/records/Contact/${matchingContact.data.record.Id}`, adminToken, 'PUT', {
      AccountId: nonMatchingAccount.data.record.Id
    });
    assert.equal(rejectedLookupUpdate.status, 422, 'record updates must enforce required lookup filters');
    const unchangedLookupContact = await api.send(`/records/Contact/${matchingContact.data.record.Id}`, adminToken);
    assert.equal(unchangedLookupContact.data.record.AccountId, matchingAccount.data.record.Id,
      'a rejected lookup-filter update must leave the stored relationship unchanged');
    const contactsBeforeRejectedLookupImport = (await api.send('/records/Contact', adminToken)).data.records.length as number;
    const rejectedLookupImport = await api.send('/records/Contact/import', adminToken, 'POST', {
      records: [
        { Name: 'Valid Lookup Import Row', AccountId: matchingAccount.data.record.Id },
        { Name: 'Invalid Lookup Import Row', AccountId: nonMatchingAccount.data.record.Id }
      ]
    });
    assert.equal(rejectedLookupImport.status, 422, 'record imports must enforce required lookup filters');
    assert.equal((await api.send('/records/Contact', adminToken)).data.records.length, contactsBeforeRejectedLookupImport,
      'a rejected lookup-filter import must not persist a partial batch');
    const invalidLookupCreateFlow = await api.send('/metadata/flows/Lookup_Filter_Create_Smoke', adminToken, 'PUT', {
      apiName: 'Lookup_Filter_Create_Smoke',
      label: 'Lookup Filter Create Smoke',
      flowType: 'Autolaunched Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create Invalid Contact', config: {
          object: 'Contact',
          fieldValues: [
            { field: 'Name', value: 'Flow Invalid Lookup Contact' },
            { field: 'AccountId', value: nonMatchingAccount.data.record.Id }
          ]
        } }
      ],
      connectors: [{ id: 'start-create-contact', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(invalidLookupCreateFlow.status, 200, JSON.stringify(invalidLookupCreateFlow.data));
    const contactsBeforeInvalidLookupFlow = (await api.send('/records/Contact', adminToken)).data.records.length as number;
    assert.equal((await api.send('/flows/Lookup_Filter_Create_Smoke/execute', adminToken, 'POST', {})).status, 422,
      'Flow Create Records must enforce required lookup filters');
    assert.equal((await api.send('/records/Contact', adminToken)).data.records.length, contactsBeforeInvalidLookupFlow,
      'a Flow create rejected by a required lookup filter must not persist a record');
    const invalidLookupUpdateFlow = await api.send('/metadata/flows/Lookup_Filter_Update_Smoke', adminToken, 'PUT', {
      apiName: 'Lookup_Filter_Update_Smoke',
      label: 'Lookup Filter Update Smoke',
      flowType: 'Autolaunched Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Update Records', label: 'Update Invalid Contact', config: {
          object: 'Contact',
          conditionLogic: 'All',
          conditions: [{ field: 'Name', operator: 'Equals', value: 'Matching Lookup Contact' }],
          fieldValues: [{ field: 'AccountId', value: nonMatchingAccount.data.record.Id }]
        } }
      ],
      connectors: [{ id: 'start-update-contact', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(invalidLookupUpdateFlow.status, 200, JSON.stringify(invalidLookupUpdateFlow.data));
    assert.equal((await api.send('/flows/Lookup_Filter_Update_Smoke/execute', adminToken, 'POST', {})).status, 422,
      'Flow Update Records must enforce required lookup filters');
    const unchangedFlowUpdatedContact = await api.send(`/records/Contact/${matchingContact.data.record.Id}`, adminToken);
    assert.equal(unchangedFlowUpdatedContact.data.record.AccountId, matchingAccount.data.record.Id,
      'a Flow update rejected by a required lookup filter must leave the relationship unchanged');
    const websiteAccount = await api.send('/records/Account', adminToken, 'POST', {
      Name: 'Good Website Account', Website: 'https://example.test'
    });
    assert.equal(websiteAccount.status, 201, JSON.stringify(websiteAccount.data));
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Non-Null Lookup Contact', AccountId: websiteAccount.data.record.Id
    })).status, 422, 'Is Null lookup filters must reject related records with a value');
    const fieldComparisonFilterUpdate = await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...lookupFilterUpdate.data.object,
      relatedLookupFilters: [{
        id: 'account-name-matches-contact-name',
        fieldApiName: 'AccountId',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Equals',
        value: '',
        valueFieldApiName: 'Name',
        required: true
      }]
    });
    assert.equal(fieldComparisonFilterUpdate.status, 200, JSON.stringify(fieldComparisonFilterUpdate.data));
    const fieldMatchAccount = await api.send('/records/Account', adminToken, 'POST', { Name: 'Field Comparison Match' });
    assert.equal(fieldMatchAccount.status, 201, JSON.stringify(fieldMatchAccount.data));
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Field Comparison Match', AccountId: fieldMatchAccount.data.record.Id
    })).status, 201, 'required lookup filters must compare related values to source-record fields');
    const fieldMismatchAccount = await api.send('/records/Account', adminToken, 'POST', { Name: 'Field Comparison Target' });
    assert.equal(fieldMismatchAccount.status, 201, JSON.stringify(fieldMismatchAccount.data));
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Different Source Value', AccountId: fieldMismatchAccount.data.record.Id
    })).status, 422, 'required field-to-field lookup filters must reject nonmatching related records');
    assert.equal((await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...fieldComparisonFilterUpdate.data.object,
      relatedLookupFilters: lookupContactMetadata.relatedLookupFilters
    })).status, 200, 'lookup-filter smoke metadata must be restored before unrelated record tests');
    const inlineLookupField = await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      field: {
        apiName: 'Field_Matched_Account__c',
        label: 'Field Matched Account',
        dataType: 'Lookup(Account)',
        required: false,
        unique: false,
        relationship: {
          type: 'Lookup',
          targetObject: 'Account',
          relationshipName: 'Field_Matched_Account',
          childRelationshipName: 'FieldMatchedContacts'
        }
      },
      relatedLookupFilters: [{
        id: 'field-matched-account-name',
        fieldApiName: 'Field_Matched_Account__c',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Equals',
        value: '',
        valueFieldApiName: 'Name',
        required: true
      }, {
        id: 'field-matched-account-name-not-null',
        fieldApiName: 'Field_Matched_Account__c',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Is Not Null',
        value: '',
        required: false
      }],
      relatedLookupFilterLogic: { Field_Matched_Account__c: 'Any' }
    });
    assert.equal(inlineLookupField.status, 201, JSON.stringify(inlineLookupField.data));
    assert.deepEqual(
      inlineLookupField.data.object.relatedLookupFilters.filter((filter: { fieldApiName: string }) => filter.fieldApiName === 'Field_Matched_Account__c'),
      [{
        id: 'field-matched-account-name',
        fieldApiName: 'Field_Matched_Account__c',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Equals',
        value: '',
        valueFieldApiName: 'Name',
        required: true
      }, {
        id: 'field-matched-account-name-not-null',
        fieldApiName: 'Field_Matched_Account__c',
        relatedObject: 'Account',
        relatedFieldApiName: 'Name',
        operator: 'Is Not Null',
        value: '',
        required: false
      }],
      'relationship creation must persist all inline lookup criteria atomically'
    );
    assert.equal(inlineLookupField.data.object.relatedLookupFilterLogic.Field_Matched_Account__c, 'Any',
      'relationship creation must persist its filter combination logic atomically');
    const clearInlineFilter = await api.send('/metadata/objects/Contact', adminToken, 'PUT', {
      ...inlineLookupField.data.object,
      relatedLookupFilters: lookupContactMetadata.relatedLookupFilters,
      relatedLookupFilterLogic: lookupContactMetadata.relatedLookupFilterLogic ?? {}
    });
    assert.equal(clearInlineFilter.status, 200, JSON.stringify(clearInlineFilter.data));
    assert.equal((await api.send('/metadata/objects/Contact/fields/Field_Matched_Account__c', adminToken, 'DELETE')).status, 200,
      'relationship creation smoke field must be removable after its filter is cleared');
    const managerToken = await api.login('manager@rbac-sharing-smoke.test');
    const ownerToken = await api.login('owner@rbac-sharing-smoke.test');
    const outsiderToken = await api.login('outsider@rbac-sharing-smoke.test');
    assert.equal((await api.send('/component-library')).status, 401, 'component library metadata must require authentication');
    const componentLibrary = await api.send('/component-library', adminToken);
    assert.equal(componentLibrary.status, 200, 'authenticated metadata readers can load the component library');
    const bundledKioskCard = componentLibrary.data.components.find((component: { apiName: string }) => component.apiName === 'KioskCard');
    assert.ok(bundledKioskCard, 'reading the shared library registers bundled custom components');
    assert.ok(bundledKioskCard.surfaces.includes('flow'), 'bundled components are available in Flow Builder screens');
    assert.deepEqual(bundledKioskCard.resize, { defaultWidth: 320, defaultHeight: 180, minWidth: 120, minHeight: 60 },
      'bundled component resize metadata is preserved in the shared library');
    let permissions = (await api.send('/metadata/permissions', adminToken)).data;

    const dashboardComponent = {
      id: 'dashboard-metric',
      title: 'Account Count',
      type: 'Metric',
      objectApiName: 'Account',
      width: 'ThreeQuarter',
      height: 'Tall',
      aggregation: 'Count',
      measureFieldApiName: null,
      groupByFieldApiName: null,
      chartType: 'Bar',
      displayFieldApiNames: []
    };
    const dashboard = {
      apiName: 'Owner_Dashboard',
      label: 'Owner Dashboard',
      description: '',
      folderName: 'Private Reports',
      visibility: 'Private',
      sharedUserIds: [],
      sharedPermissionSetGroupIds: [],
      filterLogic: 'All',
      status: 'Draft',
      components: [dashboardComponent],
      filters: []
    };
    for (const [name, recordTypeId, topics] of [
      ['Dashboard Multi Select Product', 'contact-retail', 'Product;Training'],
      ['Dashboard Multi Select Training', 'contact-retail', 'Training'],
      ['Dashboard Multi Select Events', 'contact-partner', 'Events']
    ]) {
      const createdContact = await api.send('/records/Contact', adminToken, 'POST', {
        Name: name, RecordTypeId: recordTypeId, Topics__c: topics
      });
      assert.equal(createdContact.status, 201, JSON.stringify(createdContact.data));
    }
    const multiSelectDashboard = {
      ...dashboard,
      apiName: 'Multi_Select_Dashboard',
      label: 'Multi Select Dashboard',
      status: 'Deployed',
      components: [{
        ...dashboardComponent,
        id: 'multi-select-contact-count',
        title: 'Matching Contacts',
        objectApiName: 'Contact'
      }],
      filters: [
        { id: 'topics-includes', objectApiName: 'Contact', fieldApiName: 'Topics__c', operator: 'Includes', value: 'Product;Training' },
        { id: 'contact-prefix', objectApiName: 'Contact', fieldApiName: 'Name', operator: 'Starts With', value: 'Dashboard Multi Select' }
      ]
    };
    const savedMultiSelectDashboard = await api.send('/metadata/dashboards/Multi_Select_Dashboard', adminToken, 'PUT', multiSelectDashboard);
    assert.equal(savedMultiSelectDashboard.status, 200, JSON.stringify(savedMultiSelectDashboard.data));
    const includesSnapshot = await api.send('/metadata/dashboards/Multi_Select_Dashboard/snapshots', adminToken, 'POST', {
      label: 'Multi-select includes'
    });
    assert.equal(includesSnapshot.status, 201, JSON.stringify(includesSnapshot.data));
    assert.equal(includesSnapshot.data.snapshot.components[0].metricValue, 2,
      'dashboard Includes filters must match records containing any selected multi-select value');
    const excludesDashboard = {
      ...multiSelectDashboard,
      filters: multiSelectDashboard.filters.map((filter) => filter.id === 'topics-includes'
        ? { ...filter, operator: 'Excludes' }
        : filter)
    };
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard', adminToken, 'PUT', excludesDashboard)).status, 200);
    const excludesSnapshot = await api.send('/metadata/dashboards/Multi_Select_Dashboard/snapshots', adminToken, 'POST', {
      label: 'Multi-select excludes'
    });
    assert.equal(excludesSnapshot.status, 201, JSON.stringify(excludesSnapshot.data));
    assert.equal(excludesSnapshot.data.snapshot.components[0].metricValue, 1,
      'dashboard Excludes filters must omit records containing any selected multi-select value');
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard', adminToken, 'PUT', {
      ...multiSelectDashboard,
      filters: [{ ...multiSelectDashboard.filters[0], fieldApiName: 'Name' }]
    })).status, 422, 'Includes and Excludes operators must be restricted to multi-select picklist fields');
    assert.equal((await api.send('/metadata/dashboards/Multi_Select_Dashboard', adminToken, 'PUT', {
      ...multiSelectDashboard,
      filters: [{ ...multiSelectDashboard.filters[0], value: 'Unknown' }]
    })).status, 422, 'dashboard multi-select filters must reject values outside the configured picklist');
    assert.equal((await api.send('/metadata/dashboards', ownerToken)).data.dashboards.length, 0);
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', dashboard)).status, 200);
    const savedLayoutDashboard = (await api.send('/metadata/dashboards', ownerToken)).data.dashboards
      .find((item: { apiName: string }) => item.apiName === 'Owner_Dashboard');
    assert.equal(savedLayoutDashboard.components[0].width, 'ThreeQuarter');
    assert.equal(savedLayoutDashboard.components[0].height, 'Tall',
      'widget dimensions must persist through dashboard save and reload');
    assert.equal((await api.send('/metadata/dashboards', outsiderToken)).data.dashboards.length, 0, 'private drafts must remain hidden from other users');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', sharedUserIds: [outsiderId]
    })).status, 200);
    assert.deepEqual((await api.send('/metadata/dashboards', outsiderToken)).data.dashboards.map((item: { apiName: string }) => item.apiName), ['Owner_Dashboard']);
    const folderParentResponse = await api.send('/metadata/dashboard-folders', adminToken, 'POST', {
      label: 'Sales Analytics', parentFolderId: null,
      shares: [{ targetType: 'User', targetId: outsiderId, accessLevel: 'Viewer' }]
    });
    assert.equal(folderParentResponse.status, 201, JSON.stringify(folderParentResponse.data));
    const folderParentId = folderParentResponse.data.folder.id as string;
    const nestedFolderResponse = await api.send('/metadata/dashboard-folders', adminToken, 'POST', {
      label: 'Regional', parentFolderId: folderParentId, shares: []
    });
    assert.equal(nestedFolderResponse.status, 201, JSON.stringify(nestedFolderResponse.data));
    const nestedFolderId = nestedFolderResponse.data.folder.id as string;
    assert.equal((await api.send(`/metadata/dashboard-folders/${folderParentId}`, adminToken, 'PUT', {
      label: 'Sales Analytics', parentFolderId: nestedFolderId,
      shares: folderParentResponse.data.folder.shares
    })).status, 400, 'folder hierarchy updates must reject cycles');
    assert.equal((await api.send(`/metadata/dashboard-folders/${folderParentId}`, adminToken, 'DELETE')).status, 409,
      'a parent folder cannot be deleted while it has subfolders');
    const folderDashboard = {
      ...dashboard,
      apiName: 'Folder_Access_Dashboard',
      label: 'Folder Access Dashboard',
      ownerUserId: (await api.send('/auth/me', adminToken)).data.user.id,
      folderId: nestedFolderId,
      status: 'Deployed',
      sharedUserIds: []
    };
    assert.equal((await api.send('/metadata/dashboards/Folder_Access_Dashboard', adminToken, 'PUT', folderDashboard)).status, 200);
    const outsiderDashboards = (await api.send('/metadata/dashboards', outsiderToken)).data.dashboards as Array<{ apiName: string; folderAccessLevel: string | null }>;
    assert.ok(outsiderDashboards.some((item) => item.apiName === 'Folder_Access_Dashboard' && item.folderAccessLevel === 'Viewer'),
      'parent-folder viewer grants must be inherited by nested folder dashboards');
    const listedFolders = (await api.send('/metadata/dashboard-folders', outsiderToken)).data.folders as Array<{ id: string; accessLevel: string }>;
    assert.ok(listedFolders.some((folder) => folder.id === nestedFolderId && folder.accessLevel === 'Viewer'));
    assert.equal((await api.send(`/metadata/dashboard-folders/${folderParentId}`, adminToken, 'PUT', {
      label: 'Sales Analytics', parentFolderId: null, shares: []
    })).status, 200);
    assert.equal((await api.send('/metadata/dashboards', outsiderToken)).data.dashboards
      .some((item: { apiName: string }) => item.apiName === 'Folder_Access_Dashboard'), false,
    'revoking inherited folder access must immediately remove folder dashboards from the user');
    assert.equal((await api.send(`/metadata/dashboard-folders/${folderParentId}`, adminToken, 'PUT', {
      label: 'Sales Analytics', parentFolderId: null,
      shares: [{ targetType: 'User', targetId: outsiderId, accessLevel: 'Editor' }]
    })).status, 200);
    const folderEditorDashboard = (await api.send('/metadata/dashboards', outsiderToken)).data.dashboards
      .find((item: { apiName: string }) => item.apiName === 'Folder_Access_Dashboard');
    assert.equal(folderEditorDashboard.folderAccessLevel, 'Editor');
    const standardProfileForFolderTest = permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')!;
    const originalStandardPermissions = [...standardProfileForFolderTest.systemPermissions];
    standardProfileForFolderTest.systemPermissions = originalStandardPermissions.filter((permission: string) => permission !== 'metadata:write');
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send('/metadata/pages', outsiderToken)).status, 200,
      'metadata readers must be able to open the Lightning Page catalog');
    assert.equal((await api.send('/metadata/pages/Denied_Page_Edit', outsiderToken, 'PUT', {
      apiName: 'Denied_Page_Edit',
      label: 'Denied Page Edit',
      targetObject: 'Account',
      pageType: 'App Page',
      layoutMode: 'template',
      template: 'one-region',
      canvasWidth: 1920,
      canvasHeight: 1080,
      status: 'Draft',
      devices: ['Desktop'],
      components: [],
      activationAssignments: []
    })).status, 403, 'metadata readers without metadata:write or pages:manage must not save Lightning pages');
    assert.equal((await api.send('/metadata/dashboards/Folder_Access_Dashboard', outsiderToken, 'PUT', {
      ...folderEditorDashboard, description: 'Edited by folder editor'
    })).status, 200, 'folder Editor grants must permit dashboard content updates with metadata read permission');
    assert.equal((await api.send('/metadata/dashboards/Folder_Access_Dashboard', outsiderToken, 'PUT', {
      ...folderEditorDashboard, sharedUserIds: [ownerId]
    })).status, 403, 'folder Editors must not change dashboard-level sharing');
    assert.equal((await api.send(`/metadata/dashboard-folders/${folderParentId}`, outsiderToken, 'PUT', {
      label: 'Sales Analytics', parentFolderId: null, shares: []
    })).status, 403, 'folder Editors must not change folder grants');
    standardProfileForFolderTest.systemPermissions = originalStandardPermissions;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send('/metadata/dashboards/Folder_Access_Dashboard', adminToken, 'DELETE')).status, 204);
    assert.equal((await api.send(`/metadata/dashboard-folders/${nestedFolderId}`, adminToken, 'DELETE')).status, 204);
    assert.equal((await api.send(`/metadata/dashboard-folders/${folderParentId}`, adminToken, 'DELETE')).status, 204);
    const audiencePermissions = (await api.send('/metadata/permissions', adminToken)).data;
    const salesGroupId = randomUUID();
    audiencePermissions.permissionSetGroups.push({
      id: salesGroupId,
      label: 'Dashboard Sales',
      apiName: `Dashboard_Sales_${salesGroupId.replace(/-/g, '').slice(0, 8)}`,
      description: '',
      permissionSetIds: []
    });
    const audienceUser = audiencePermissions.users.find((user: { id: string }) => user.id === outsiderId);
    audienceUser.permissionSetGroupIds = [...new Set([...(audienceUser.permissionSetGroupIds ?? []), salesGroupId])];
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', audiencePermissions)).status, 200,
      'permission set group membership is assignable to the folder audience');
    const territoryId = randomUUID();
    const subTerritoryId = randomUUID();
    assert.equal((await api.send('/metadata/dashboard-territories', adminToken, 'PUT', [
      { id: territoryId, label: 'North Region', parentTerritoryId: null, userIds: [] },
      { id: subTerritoryId, label: 'North West', parentTerritoryId: territoryId, userIds: [outsiderId] }
    ])).status, 200, 'territory hierarchy and tenant user assignments are persisted');
    const audienceFolderResponse = await api.send('/metadata/dashboard-folders', adminToken, 'POST', {
      label: 'Audience Access', parentFolderId: null,
      shares: [
        { targetType: 'PermissionSetGroup', targetId: salesGroupId, accessLevel: 'Editor' },
        { targetType: 'Territory', targetId: territoryId, accessLevel: 'Viewer' }
      ]
    });
    assert.equal(audienceFolderResponse.status, 201, JSON.stringify(audienceFolderResponse.data));
    const audienceFolderId = audienceFolderResponse.data.folder.id as string;
    assert.equal((await api.send('/metadata/dashboards/Audience_Dashboard', adminToken, 'PUT', {
      ...dashboard,
      apiName: 'Audience_Dashboard',
      label: 'Audience Dashboard',
      folderId: audienceFolderId,
      folderName: 'Audience Access',
      status: 'Deployed'
    })).status, 200);
    let audienceDashboard = (await api.send('/metadata/dashboards', outsiderToken)).data.dashboards
      .find((item: { apiName: string }) => item.apiName === 'Audience_Dashboard');
    assert.equal(audienceDashboard.folderAccessLevel, 'Editor', 'permission-set-group folder grants resolve current user membership');
    const revokedGroupPermissions = (await api.send('/metadata/permissions', adminToken)).data;
    const revokedGroupUser = revokedGroupPermissions.users.find((user: { id: string }) => user.id === outsiderId);
    revokedGroupUser.permissionSetGroupIds = revokedGroupUser.permissionSetGroupIds.filter((id: string) => id !== salesGroupId);
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', revokedGroupPermissions)).status, 200);
    audienceDashboard = (await api.send('/metadata/dashboards', outsiderToken)).data.dashboards
      .find((item: { apiName: string }) => item.apiName === 'Audience_Dashboard');
    assert.equal(audienceDashboard.folderAccessLevel, 'Viewer', 'removing PSG membership leaves only the independent territory grant');
    assert.equal((await api.send('/metadata/dashboard-territories', adminToken, 'PUT', [
      { id: territoryId, label: 'North Region', parentTerritoryId: null, userIds: [] },
      { id: subTerritoryId, label: 'North West', parentTerritoryId: territoryId, userIds: [] }
    ])).status, 200);
    assert.equal((await api.send('/metadata/dashboards', outsiderToken)).data.dashboards
      .some((item: { apiName: string }) => item.apiName === 'Audience_Dashboard'), false,
    'removing user territory membership immediately revokes inherited dashboard visibility');
    const territoryPermissions = (await api.send('/metadata/permissions', adminToken)).data;
    const standardProfileForTerritoryTest = territoryPermissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')!;
    const originalTerritoryTestPermissions = [...standardProfileForTerritoryTest.systemPermissions];
    standardProfileForTerritoryTest.systemPermissions = originalTerritoryTestPermissions
      .filter((permission: string) => permission !== 'metadata:write');
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', territoryPermissions)).status, 200);
    const outsiderTerritoryMetadata = await api.send('/metadata/dashboard-territories', outsiderToken);
    assert.equal(outsiderTerritoryMetadata.data.canManage, false,
      'users without dashboard management or metadata-write permission cannot manage territories');
    assert.equal((await api.send('/metadata/dashboard-territories', outsiderToken, 'PUT', [])).status, 403,
      'non-administrators cannot modify dashboard territory membership');
    standardProfileForTerritoryTest.systemPermissions = originalTerritoryTestPermissions;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', territoryPermissions)).status, 200);
    assert.equal((await api.send('/metadata/dashboards/Audience_Dashboard', adminToken, 'DELETE')).status, 204);
    assert.equal((await api.send(`/metadata/dashboard-folders/${audienceFolderId}`, adminToken, 'DELETE')).status, 204);
    const dashboardSnapshot = await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken, 'POST', {
      label: 'Owner point in time'
    });
    assert.equal(dashboardSnapshot.status, 201, JSON.stringify(dashboardSnapshot.data));
    assert.equal(dashboardSnapshot.data.snapshot.components[0].metricValue, 0);
    assert.equal(dashboardSnapshot.data.snapshot.components[0].width, 'ThreeQuarter',
      'dashboard snapshots must retain the configured responsive component width');
    assert.equal(dashboardSnapshot.data.snapshot.components[0].height, 'Tall',
      'dashboard snapshots must retain the configured widget height');
    const outsiderSnapshotsAfterRunAs = (await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', outsiderToken)).data.snapshots;
    assert.equal(outsiderSnapshotsAfterRunAs.some((snapshot: { id: string }) => snapshot.id === runAsSnapshot.data.snapshot.id), false,
      'snapshots must remain private to the user whose record permissions shaped the capture');
    assert.equal((await api.send(`/metadata/dashboards/Owner_Dashboard/snapshots/${dashboardSnapshot.data.snapshot.id}`, outsiderToken, 'DELETE')).status, 404);
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken)).data.snapshots.length, 1,
      'snapshots must persist in tenant metadata');
    const contentDashboard = await api.send('/metadata/dashboards/Content_Widgets_Smoke', adminToken, 'PUT', {
      ...dashboard,
      apiName: 'Content_Widgets_Smoke',
      label: 'Content Widgets Smoke',
      status: 'Deployed',
      components: [
        {
          ...dashboardComponent,
          id: 'rich-text-smoke',
          title: 'Rich Text Smoke',
          type: 'Rich Text',
          richTextContent: '<h2>Dashboard note</h2><script>alert(1)</script><p>Safe <strong>formatting</strong><img src="https://example.test/evil.png" onerror="alert(1)"></p>'
        },
        {
          ...dashboardComponent,
          id: 'image-smoke',
          title: 'Image Smoke',
          type: 'Image',
          imageUrl: 'https://example.test/dashboard.png',
          imageAltText: 'Sales performance'
        }
      ],
      filters: []
    });
    assert.equal(contentDashboard.status, 200, JSON.stringify(contentDashboard.data));
    assert.match(contentDashboard.data.dashboard.components[0].richTextContent, /<strong>formatting<\/strong>/);
    assert.doesNotMatch(contentDashboard.data.dashboard.components[0].richTextContent, /<script|<img|onerror/i,
      'rich text widget markup must be sanitized when saved');
    assert.equal((await api.send('/metadata/dashboards/Content_Widgets_Smoke', adminToken, 'PUT', {
      ...contentDashboard.data.dashboard,
      components: contentDashboard.data.dashboard.components.map((component: Record<string, unknown>) => ({
        ...component,
        ...(component.type === 'Image' ? { imageUrl: 'javascript:alert(1)' } : {})
      }))
    })).status, 400, 'dashboard image widgets must reject non-HTTPS URLs');
    const contentSnapshot = await api.send('/metadata/dashboards/Content_Widgets_Smoke/snapshots', adminToken, 'POST', {
      label: 'Content widgets snapshot'
    });
    assert.equal(contentSnapshot.status, 201, JSON.stringify(contentSnapshot.data));
    assert.equal(contentSnapshot.data.snapshot.components[0].richTextContent, contentDashboard.data.dashboard.components[0].richTextContent);
    assert.equal(contentSnapshot.data.snapshot.components[1].imageUrl, 'https://example.test/dashboard.png');
    const customComponentSource = {
      apiName: 'Snapshot_Card',
      label: 'Snapshot Card',
      description: '',
      surfaces: ['page', 'dashboard', 'flow'],
      resize: { defaultWidth: 400, defaultHeight: 220, minWidth: 160, minHeight: 80 },
      jsxSource: 'const SnapshotCard=()=> <div><strong>Custom output</strong></div>; export default SnapshotCard;',
      cssSource: ''
    };
    const customLibraryComponent = await api.send('/component-library', adminToken, 'POST', customComponentSource);
    assert.equal(customLibraryComponent.status, 201, JSON.stringify(customLibraryComponent.data));
    assert.deepEqual(customLibraryComponent.data.component.resize, customComponentSource.resize,
      'custom component resize metadata persists on registration');
    const updatedLibraryComponent = await api.send('/component-library/Snapshot_Card', adminToken, 'PUT', {
      ...customComponentSource,
      description: 'Updated custom component version'
    });
    assert.equal(updatedLibraryComponent.status, 200, JSON.stringify(updatedLibraryComponent.data));
    assert.equal(updatedLibraryComponent.data.component.version, 2,
      'editing a registered default-export component must compile and advance its version');
    const invalidLibraryComponentUpdate = await api.send('/component-library/Snapshot_Card', adminToken, 'PUT', {
      ...customComponentSource,
      jsxSource: 'const SnapshotCard=()=> <div />;'
    });
    assert.equal(invalidLibraryComponentUpdate.status, 400,
      'editing a custom component must still reject source without a default export');
    const componentPage = {
      apiName: 'Snapshot_Card_Page_Use',
      label: 'Snapshot Card Page Use',
      targetObject: 'Account',
      pageType: 'Record Page',
      status: 'Draft',
      devices: ['Desktop', 'Phone'],
      components: [{
        id: 'snapshot-card-page-widget',
        type: 'Custom:Snapshot_Card',
        label: 'Snapshot Card',
        properties: { libraryComponentId: 'Snapshot_Card' },
        visible: true
      }],
      activationAssignments: []
    };
    for (const [type, pageName] of [
      ['Activities', 'Disabled_Activities_Page'],
      ['Chatter', 'Disabled_Chatter_Page']
    ]) {
      const disabledFeaturePage = await api.send(`/metadata/pages/${pageName}`, adminToken, 'PUT', {
        ...componentPage,
        apiName: pageName,
        label: pageName.replaceAll('_', ' '),
        targetObject: 'Development_Only__c',
        components: [{ id: type.toLocaleLowerCase(), type, label: type, properties: {}, visible: true }]
      });
      assert.equal(disabledFeaturePage.status, 422,
        `${type} page components must be rejected when the Object Manager feature is disabled`);
    }
    const savedComponentPage = await api.send('/metadata/pages/Snapshot_Card_Page_Use', adminToken, 'PUT', componentPage);
    assert.equal(savedComponentPage.status, 200, JSON.stringify(savedComponentPage.data));
    assert.equal(savedComponentPage.data.page.components[0].type, 'Custom:Snapshot_Card',
      'Lightning pages must accept custom components registered for the page-builder surface');
    assert.doesNotThrow(() => new Date(savedComponentPage.data.page.updatedAt).toISOString(),
      'saved Lightning pages must record a modification timestamp for the recent-pages picker');
    assert.equal(savedComponentPage.data.page.template, 'one-region',
      'existing page save payloads must receive the backwards-compatible default template');
    assert.equal(savedComponentPage.data.page.components[0].region, 'main',
      'existing page component payloads must receive the backwards-compatible main-region default');
    const blockedSurfaceRemoval = await api.send('/component-library/Snapshot_Card', adminToken, 'PUT', {
      ...customComponentSource,
      surfaces: ['dashboard', 'flow']
    });
    assert.equal(blockedSurfaceRemoval.status, 409,
      'a component surface must not be removed while a saved page still uses it');
    assert.match(String(blockedSurfaceRemoval.data.error), /Snapshot Card Page Use/,
      'surface-removal blockers must identify the page using the component');
    const dynamicFormsPage = {
      ...componentPage,
      apiName: 'Dynamic_Forms_Record_Page',
      label: 'Dynamic Forms Record Page',
      components: [
        {
          id: 'account-core-fields',
          type: 'Field Section',
          label: 'Account Information',
          properties: { fieldApiNames: ['Name', 'Phone'], columns: 2 },
          visible: true
        },
        {
          id: 'account-website-field',
          type: 'Record Field',
          label: 'Website',
          properties: { fieldApiName: 'Website' },
          visible: true
        }
      ]
    };
    const savedDynamicFormsPage = await api.send('/metadata/pages/Dynamic_Forms_Record_Page', adminToken, 'PUT', dynamicFormsPage);
    assert.equal(savedDynamicFormsPage.status, 200, JSON.stringify(savedDynamicFormsPage.data));
    assert.equal(savedDynamicFormsPage.data.page.components[0].type, 'Field Section');
    assert.equal(savedDynamicFormsPage.data.page.components[1].properties.fieldApiName, 'Website');
    assert.equal((await api.send('/metadata/pages/Invalid_Dynamic_Forms_Field', adminToken, 'PUT', {
      ...dynamicFormsPage,
      apiName: 'Invalid_Dynamic_Forms_Field',
      components: [{
        ...dynamicFormsPage.components[0],
        properties: { fieldApiNames: ['No_Such_Field__c'], columns: 2 }
      }]
    })).status, 400, 'Dynamic Forms metadata must reject fields that do not belong to the target object');
    const renamedDynamicFormsPage = await api.send('/metadata/pages/Dynamic_Forms_Record_Page', adminToken, 'PUT', {
      ...savedDynamicFormsPage.data.page,
      apiName: 'Dynamic_Forms_Record_Page_Renamed'
    });
    assert.equal(renamedDynamicFormsPage.status, 200, JSON.stringify(renamedDynamicFormsPage.data));
    assert.equal((await api.send('/metadata/pages', adminToken)).data.pages.some(
      (item: { apiName: string }) => item.apiName === 'Dynamic_Forms_Record_Page'
    ), false, 'renaming a page must remove the prior API identity');
    assert.equal((await api.send('/metadata/pages/Dynamic_Forms_Record_Page_Renamed', adminToken, 'PUT', {
      ...renamedDynamicFormsPage.data.page,
      apiName: 'Snapshot_Card_Page_Use'
    })).status, 409, 'page renames must reject API names already owned by another page');
    const navigationRenamePage = await api.send('/metadata/pages/Page_Rename_Navigation_Source', adminToken, 'PUT', {
      ...componentPage,
      apiName: 'Page_Rename_Navigation_Source',
      label: 'Page Rename Navigation Source',
      pageType: 'App Page',
      status: 'Active',
      components: [{ id: 'rename-page-accordion', type: 'Accordion', label: 'Overview', properties: {}, visible: true }],
      activationAssignments: []
    });
    assert.equal(navigationRenamePage.status, 200, JSON.stringify(navigationRenamePage.data));
    const navigationRenameApp = await api.send('/metadata/apps', adminToken, 'POST', {
      apiName: 'Page_Rename_Test_App',
      label: 'Page Rename Test App',
      description: '',
      navigationItems: ['Account'],
      navigationPageApiNames: ['Page_Rename_Navigation_Source'],
      navigationOrder: [
        { type: 'Object', apiName: 'Account' },
        { type: 'App Page', apiName: 'Page_Rename_Navigation_Source' }
      ],
      brandColor: '#0176d3',
      utilityItems: []
    });
    assert.equal(navigationRenameApp.status, 201, JSON.stringify(navigationRenameApp.data));
    const renamedNavigationPage = await api.send('/metadata/pages/Page_Rename_Navigation_Source', adminToken, 'PUT', {
      ...navigationRenamePage.data.page,
      apiName: 'Page_Rename_Navigation_Updated'
    });
    assert.equal(renamedNavigationPage.status, 200, JSON.stringify(renamedNavigationPage.data));
    const renamedNavigationApp = (await api.send('/metadata/apps', adminToken)).data.apps.find(
      (item: { apiName: string }) => item.apiName === 'Page_Rename_Test_App'
    );
    assert.deepEqual(renamedNavigationApp.navigationPageApiNames, ['Page_Rename_Navigation_Updated']);
    assert.deepEqual(renamedNavigationApp.navigationOrder[1], { type: 'App Page', apiName: 'Page_Rename_Navigation_Updated' });
    assert.equal((await api.send('/apps/Page_Rename_Test_App/pages/Page_Rename_Navigation_Updated', adminToken)).status, 200,
      'renamed App Pages must remain accessible through their app navigation');
    const freeCanvasPage = {
      ...componentPage,
      apiName: 'Kiosk_Free_Canvas',
      label: 'Kiosk Free Canvas',
      pageType: 'Home Page',
      layoutMode: 'free-canvas',
      canvasWidth: 1280,
      canvasHeight: 800,
      status: 'Active',
      devices: ['Desktop'],
      components: [{
        ...componentPage.components[0],
        position: { x: 100, y: 120, width: 640, height: 320 }
      }],
      activationAssignments: [{
        id: 'kiosk-free-canvas-app-default',
        scope: 'App Default',
        appId: 'Records',
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    };
    const savedFreeCanvasPage = await api.send('/metadata/pages/Kiosk_Free_Canvas', adminToken, 'PUT', freeCanvasPage);
    assert.equal(savedFreeCanvasPage.status, 200, JSON.stringify(savedFreeCanvasPage.data));
    assert.equal(savedFreeCanvasPage.data.page.layoutMode, 'free-canvas');
    assert.equal(savedFreeCanvasPage.data.page.canvasWidth, 1280);
    assert.equal(savedFreeCanvasPage.data.page.canvasHeight, 800);
    assert.deepEqual(savedFreeCanvasPage.data.page.components[0].position, { x: 100, y: 120, width: 640, height: 320 });
    const kioskHomePage = await api.send('/apps/Records/home-page?formFactor=Desktop', adminToken);
    assert.equal(kioskHomePage.status, 200, JSON.stringify(kioskHomePage.data));
    assert.equal(kioskHomePage.data.page.apiName, 'Kiosk_Free_Canvas',
      'an app-assigned Home Page Free Canvas must be resolvable for kiosk runtime');
    assert.equal((await api.send('/metadata/pages/Kiosk_Free_Canvas_Out_Of_Bounds', adminToken, 'PUT', {
      ...freeCanvasPage,
      apiName: 'Kiosk_Free_Canvas_Out_Of_Bounds',
      components: [{ ...freeCanvasPage.components[0], position: { x: 700, y: 120, width: 640, height: 320 } }]
    })).status, 400, 'Free Canvas components must remain within the configured canvas bounds');
    assert.equal((await api.send('/metadata/pages/Kiosk_Free_Canvas_Missing_Position', adminToken, 'PUT', {
      ...freeCanvasPage,
      apiName: 'Kiosk_Free_Canvas_Missing_Position',
      components: [{ ...componentPage.components[0] }]
    })).status, 400, 'Free Canvas components must store their position and size');
    for (const pageType of ['App Page', 'Home Page']) {
      const pageName = pageType === 'App Page' ? 'Snapshot_Card_App_Page' : 'Snapshot_Card_Home_Page';
      const pageResponse = await api.send(`/metadata/pages/${pageName}`, adminToken, 'PUT', {
        ...componentPage,
        apiName: pageName,
        label: pageName.replaceAll('_', ' '),
        pageType,
        template: 'header-main-sidebar',
        components: [
          { ...componentPage.components[0], region: 'sidebar' },
          {
            id: `${pageType.toLocaleLowerCase().replaceAll(' ', '-')}-summary`,
            type: 'Accordion',
            label: 'Summary',
            properties: { content: `${pageType} summary` },
            visible: true,
            region: 'header'
          },
          {
            id: `${pageType.toLocaleLowerCase().replaceAll(' ', '-')}-tabs`,
            type: 'Tabs',
            label: 'Page Tabs',
            properties: { tabs: ['Summary', 'Details'] },
            visible: false,
            region: 'main'
          }
        ]
      });
      assert.equal(pageResponse.status, 200, `${pageType} should save with template regions: ${JSON.stringify(pageResponse.data)}`);
      assert.equal(pageResponse.data.page.pageType, pageType);
      assert.equal(pageResponse.data.page.template, 'header-main-sidebar');
      assert.equal(pageResponse.data.page.components[0].region, 'sidebar');
      const persistedPage = (await api.send('/metadata/pages', adminToken)).data.pages.find((item: { apiName: string }) => item.apiName === pageName);
      assert.deepEqual(persistedPage.components, pageResponse.data.page.components,
        `${pageType} component order, visibility, properties, and regions must survive metadata reload`);
    }
    assert.equal((await api.send('/metadata/pages/Invalid_Template_Region_Page', adminToken, 'PUT', {
      ...componentPage,
      template: 'one-region',
      components: [{ ...componentPage.components[0], region: 'sidebar' }]
    })).status, 400, 'page metadata must reject regions not present in the selected template');
    assert.equal((await api.send('/metadata/pages/Invalid_App_Record_Component', adminToken, 'PUT', {
      ...componentPage,
      pageType: 'App Page',
      components: [{ id: 'record-detail-invalid', type: 'Record Detail', label: 'Record Detail', properties: {}, visible: true }]
    })).status, 400, 'App and Home pages must reject record-only standard components');
    const activatedComponentPage = await api.send('/metadata/pages/Snapshot_Card_Page_Use', adminToken, 'PUT', {
      ...componentPage,
      status: 'Active',
      activationAssignments: [
        { id: 'snapshot-card-desktop', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Desktop'] },
        { id: 'snapshot-card-phone', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Phone'] }
      ]
    });
    assert.equal(activatedComponentPage.status, 200, JSON.stringify(activatedComponentPage.data));
    assert.equal(activatedComponentPage.data.page.status, 'Active');
    const runtimeAccountResponse = await api.send('/records/Account', adminToken, 'POST', { Name: 'Lightning Activation Resolver Test' });
    assert.equal(runtimeAccountResponse.status, 201, JSON.stringify(runtimeAccountResponse.data));
    const runtimeAccount = runtimeAccountResponse.data.record as { Id: string; RecordTypeId: string };
    const activeRuntimePage = (await api.send(`/records/Account/${runtimeAccount.Id}?appId=Records&formFactor=Desktop`, adminToken))
      .data.lightningPage;
    assert.equal(activeRuntimePage.apiName, 'Snapshot_Card_Page_Use',
      'an active page assignment must resolve before deactivation');
    const deactivatedComponentPage = await api.send('/metadata/pages/Snapshot_Card_Page_Use', adminToken, 'PUT', {
      ...activatedComponentPage.data.page,
      status: 'Draft'
    });
    assert.equal(deactivatedComponentPage.status, 200, JSON.stringify(deactivatedComponentPage.data));
    assert.equal(deactivatedComponentPage.data.page.status, 'Draft');
    const resolvedAfterDeactivation = (await api.send(`/records/Account/${runtimeAccount.Id}?appId=Records&formFactor=Desktop`, adminToken))
      .data.lightningPage;
    assert.notEqual(resolvedAfterDeactivation?.apiName, 'Snapshot_Card_Page_Use',
      'a deactivated page must no longer resolve at runtime');
    const runtimeProfileId = (await api.send('/auth/me', adminToken)).data.user.profileId as string;
    const runtimeUserId = (await api.send('/auth/me', adminToken)).data.user.id as string;
    const userRecordPage = {
      ...componentPage,
      apiName: 'User_Record_Runtime_Assignment',
      label: 'User Record Runtime Assignment',
      targetObject: 'User',
      status: 'Active',
      activationAssignments: [{
        id: 'user-runtime-org-desktop',
        scope: 'Org Default',
        appId: null,
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    };
    assert.equal((await api.send('/metadata/pages/User_Record_Runtime_Assignment', adminToken, 'PUT', userRecordPage)).status, 200);
    const resolvedUserPage = (await api.send(`/records/User/${runtimeUserId}?appId=Records&formFactor=Desktop`, adminToken)).data.lightningPage;
    assert.equal(resolvedUserPage.apiName, 'User_Record_Runtime_Assignment',
      'record detail resolution must also apply to User records');
    assert.equal((await api.send(`/records/User/${runtimeUserId}?appId=Records&formFactor=Tablet`, adminToken)).status, 400,
      'unsupported form factors must be rejected for User record details too');
    const accountMetadata = (await api.send('/metadata/objects', adminToken)).data.objects
      .find((item: { apiName: string }) => item.apiName === 'Account');
    assert.equal((await api.send('/metadata/objects/Account', adminToken, 'PUT', {
      ...accountMetadata,
      settings: { ...accountMetadata.settings, allowInChatter: true }
    })).status, 200, 'Account Chatter feature must be enabled before using its page component');
    assert.equal((await api.send('/metadata/apps', adminToken, 'POST', {
      apiName: 'InteractionTestApp',
      label: 'Interaction Test',
      description: '',
      navigationItems: ['Account'],
      brandColor: '#0176d3',
      utilityItems: []
    })).status, 201, 'tenant app catalog should accept a valid Lightning app');
    assert.equal((await api.send('/metadata/apps', adminToken, 'POST', {
      apiName: 'OtherApp',
      label: 'Other',
      description: '',
      navigationItems: ['Account'],
      brandColor: '#0176d3',
      utilityItems: []
    })).status, 201);
    assert.equal((await api.send('/metadata/apps', adminToken, 'POST', {
      apiName: 'InvalidNavigationApp',
      label: 'Invalid Navigation',
      description: '',
      navigationItems: ['MissingObject'],
      brandColor: '#0176d3',
      utilityItems: []
    })).status, 400, 'app navigation must reference tenant objects');
    const appCatalog = (await api.send('/metadata/apps', adminToken)).data.apps as Array<{ apiName: string }>;
    assert.ok(appCatalog.some((app) => app.apiName === 'Records'), 'default app should be tenant metadata');
    assert.equal(appCatalog.some((app) => app.apiName === 'InvalidNavigationApp'), false,
      'rejected tenant-scoped app references must not persist partially or leave stale metadata');
    assert.equal((await api.send('/metadata/apps/OtherApp', adminToken, 'PUT', {
      label: 'Other Updated',
      description: '',
      navigationItems: ['Account', 'Contact'],
      brandColor: '#0176d3',
      utilityItems: ['Notes']
    })).status, 200, 'app navigation and utility metadata should be editable');
    const appPage = await api.send('/metadata/pages/Interaction_Landing_Page', adminToken, 'PUT', {
      ...componentPage,
      apiName: 'Interaction_Landing_Page',
      label: 'Interaction Landing Page',
      pageType: 'App Page',
      status: 'Active',
      components: [{
        id: 'landing-accordion',
        type: 'Accordion',
        label: 'Renewal Overview',
        properties: { content: 'Review renewal priorities.' },
        visible: true,
        region: 'main'
      }]
    });
    assert.equal(appPage.status, 200, JSON.stringify(appPage.data));
    for (const apiName of ['Recent_Page_First', 'Recent_Page_Second']) {
      const recentPage = await api.send(`/metadata/pages/${apiName}`, adminToken, 'PUT', {
        ...appPage.data.page,
        apiName,
        label: apiName.replaceAll('_', ' '),
        status: 'Draft'
      });
      assert.equal(recentPage.status, 200, JSON.stringify(recentPage.data));
    }
    const refreshedRecentPage = await api.send('/metadata/pages/Recent_Page_First', adminToken, 'PUT', {
      ...appPage.data.page,
      apiName: 'Recent_Page_First',
      label: 'Recently Updated Page',
      status: 'Draft'
    });
    assert.equal(refreshedRecentPage.status, 200, JSON.stringify(refreshedRecentPage.data));
    const pageOrder = (await api.send('/metadata/pages', adminToken)).data.pages as Array<{ apiName: string }>;
    assert.equal(pageOrder.at(-1)?.apiName, 'Recent_Page_First',
      'updating a page should move it to the end of the persisted recent-pages order');
    const interactionApp = (await api.send('/metadata/apps', adminToken)).data.apps
      .find((item: { apiName: string }) => item.apiName === 'InteractionTestApp');
    assert.equal((await api.send('/metadata/apps/InteractionTestApp', adminToken, 'PUT', {
      ...interactionApp,
      navigationPageApiNames: ['Interaction_Landing_Page']
    })).status, 200, 'an active App Page should be assignable to app navigation');
    const appPageRuntime = await api.send('/apps/InteractionTestApp/pages/Interaction_Landing_Page?formFactor=Desktop', adminToken);
    assert.equal(appPageRuntime.status, 200, JSON.stringify(appPageRuntime.data));
    assert.equal(appPageRuntime.data.page.apiName, 'Interaction_Landing_Page');
    assert.equal((await api.send('/metadata/pages/Interaction_Landing_Page', adminToken, 'PUT', {
      ...appPage.data.page,
      status: 'Draft'
    })).status, 409, 'an App Page in app navigation cannot be deactivated until it is removed from the app');
    const homeDefaultPage = await api.send('/metadata/pages/Interaction_Home_Default', adminToken, 'PUT', {
      ...componentPage,
      apiName: 'Interaction_Home_Default',
      label: 'Interaction Home Default',
      pageType: 'Home Page',
      status: 'Active',
      components: [{
        id: 'home-default-content',
        type: 'Accordion',
        label: 'Team Overview',
        properties: { content: 'Default home content.' },
        visible: true,
        region: 'main'
      }],
      activationAssignments: [{
        id: 'interaction-home-default',
        scope: 'App Default',
        appId: 'InteractionTestApp',
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    });
    assert.equal(homeDefaultPage.status, 200, JSON.stringify(homeDefaultPage.data));
    const homeProfilePage = await api.send('/metadata/pages/Interaction_Home_Profile', adminToken, 'PUT', {
      ...componentPage,
      apiName: 'Interaction_Home_Profile',
      label: 'Interaction Home Profile',
      pageType: 'Home Page',
      status: 'Active',
      components: [{
        id: 'home-profile-content',
        type: 'Accordion',
        label: 'Admin Overview',
        properties: { content: 'Profile-specific home content.' },
        visible: true,
        region: 'main'
      }],
      activationAssignments: [{
        id: 'interaction-home-profile',
        scope: 'App and Profile',
        appId: 'InteractionTestApp',
        profileId: runtimeProfileId,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    });
    assert.equal(homeProfilePage.status, 200, JSON.stringify(homeProfilePage.data));
    const resolvedHomePage = await api.send('/apps/InteractionTestApp/home-page?formFactor=Desktop', adminToken);
    assert.equal(resolvedHomePage.status, 200, JSON.stringify(resolvedHomePage.data));
    assert.equal(resolvedHomePage.data.page.apiName, 'Interaction_Home_Profile',
      'app/profile Home Page assignment should outrank the app default page');
    assert.equal((await api.send('/metadata/pages/Interaction_Home_Conflict', adminToken, 'PUT', {
      ...componentPage,
      apiName: 'Interaction_Home_Conflict',
      pageType: 'Home Page',
      status: 'Active',
      components: [{
        id: 'home-conflict-content',
        type: 'Accordion',
        label: 'Conflicting Home',
        properties: {},
        visible: true,
        region: 'main'
      }],
      activationAssignments: [{
        id: 'interaction-home-conflict',
        scope: 'App Default',
        appId: 'InteractionTestApp',
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    })).status, 409, 'only one active Home Page may own an app-default/form-factor assignment');
    assert.equal((await api.send('/apps/InteractionTestApp/home-page?formFactor=Phone', adminToken)).data.page, null,
      'Home Page resolution must honor assigned form factors');
    assert.equal((await api.send('/metadata/pages/Invalid_Home_Org_Assignment', adminToken, 'PUT', {
      ...componentPage,
      apiName: 'Invalid_Home_Org_Assignment',
      pageType: 'Home Page',
      activationAssignments: [{
        id: 'invalid-home-org',
        scope: 'Org Default',
        appId: null,
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    })).status, 400, 'Home Pages must use app-targeted assignments');
    assert.equal((await api.send('/metadata/pages/Invalid_Record_Assignment', adminToken, 'PUT', {
      ...componentPage,
      apiName: 'Invalid_Record_Assignment',
      activationAssignments: [{
        id: 'invalid-record-app-profile',
        scope: 'App and Profile',
        appId: 'InteractionTestApp',
        profileId: runtimeProfileId,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    })).status, 200, 'record pages may also use app/profile assignments');
    const interactionsPage = {
      ...componentPage,
      apiName: 'Account_Interactions_Runtime_Page',
      label: 'Account Interactions Runtime Page',
      status: 'Active',
      components: [
        { id: 'runtime-activities', type: 'Activities', label: 'Activity Timeline', properties: {}, visible: true, region: 'main' },
        { id: 'runtime-chatter', type: 'Chatter', label: 'Chatter Feed', properties: {}, visible: true, region: 'main' }
      ],
      activationAssignments: [{
        id: 'account-interactions-app-default',
        scope: 'App Default',
        appId: 'InteractionTestApp',
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    };
    assert.equal((await api.send('/metadata/pages/Account_Interactions_Runtime_Page', adminToken, 'PUT', interactionsPage)).status, 200,
      'Activity and Chatter components should save when their object features are enabled');
    assert.equal((await api.send('/metadata/apps/InteractionTestApp', adminToken, 'DELETE')).status, 409,
      'apps assigned to active pages cannot be deleted');
    const activityCreated = await api.send(`/records/Account/${runtimeAccount.Id}/activities`, adminToken, 'POST', {
      kind: 'Task',
      subject: 'Follow up on renewal',
      description: 'Send revised proposal',
      dueAt: null
    });
    assert.equal(activityCreated.status, 201, JSON.stringify(activityCreated.data));
    assert.equal(activityCreated.data.activity.kind, 'Task');
    const completedActivity = await api.send(
      `/records/Account/${runtimeAccount.Id}/activities/${activityCreated.data.activity.id}`,
      adminToken,
      'PATCH',
      { status: 'Completed' }
    );
    assert.equal(completedActivity.data.activity.status, 'Completed');
    assert.equal((await api.send(`/records/Account/${runtimeAccount.Id}/activities`, adminToken)).data.activities.length, 1,
      'record activity timeline should return persisted activities for that record');
    const chatterCreated = await api.send(`/records/Account/${runtimeAccount.Id}/chatter`, adminToken, 'POST', {
      body: 'Renewal team: customer requested a revised quote.'
    });
    assert.equal(chatterCreated.status, 201, JSON.stringify(chatterCreated.data));
    const chatterComment = await api.send(
      `/records/Account/${runtimeAccount.Id}/chatter/${chatterCreated.data.post.id}/comments`,
      adminToken,
      'POST',
      { body: 'I will send it this afternoon.' }
    );
    assert.equal(chatterComment.status, 201, JSON.stringify(chatterComment.data));
    assert.equal((await api.send(`/records/Account/${runtimeAccount.Id}/chatter`, adminToken)).data.posts[0].comments.length, 1,
      'Chatter record feed should return persisted posts and comments');
    const appScopedPage = {
      ...componentPage,
      apiName: 'Snapshot_Card_App_Assignment',
      label: 'Snapshot Card App Assignment',
      status: 'Active',
      activationAssignments: [{
        id: 'snapshot-card-sales-app-desktop',
        scope: 'App Default',
        appId: 'SalesApp',
        profileId: null,
        recordTypeId: null,
        formFactors: ['Desktop']
      }]
    };
    assert.equal((await api.send('/metadata/pages/Snapshot_Card_App_Assignment', adminToken, 'PUT', appScopedPage)).status, 200);
    const profileScopedPage = {
      ...componentPage,
      apiName: 'Snapshot_Card_Profile_Assignment',
      label: 'Snapshot Card Profile Assignment',
      status: 'Active',
      activationAssignments: [{
        id: 'snapshot-card-sales-record-profile-desktop',
        scope: 'App, Record Type, and Profile',
        appId: 'SalesApp',
        profileId: runtimeProfileId,
        recordTypeId: runtimeAccount.RecordTypeId,
        formFactors: ['Desktop']
      }]
    };
    assert.equal((await api.send('/metadata/pages/Snapshot_Card_Profile_Assignment', adminToken, 'PUT', profileScopedPage)).status, 200);
    assert.equal((await api.send('/metadata/pages/Duplicate_Snapshot_Card_Profile_Assignment', adminToken, 'PUT', {
      ...profileScopedPage,
      apiName: 'Duplicate_Snapshot_Card_Profile_Assignment',
      label: 'Duplicate Snapshot Card Profile Assignment'
    })).status, 409, 'two active pages cannot claim the same assignment and form factor');
    assert.equal((await api.send('/metadata/pages/Snapshot_Card_Page_Use', adminToken, 'PUT', {
      ...deactivatedComponentPage.data.page,
      status: 'Active',
      activationAssignments: activatedComponentPage.data.page.activationAssignments
    })).status, 200, 'the Org Default page must be reactivated before testing page precedence');
    const recordRoute = `/records/Account/${runtimeAccount.Id}`;
    const recordDefaultPage = (await api.send(`${recordRoute}?appId=OtherApp&formFactor=Desktop`, adminToken)).data.lightningPage;
    assert.equal(recordDefaultPage.apiName, 'Snapshot_Card_Page_Use',
      'record runtime must resolve the active org default page');
    const appDefaultPage = (await api.send(`${recordRoute}?appId=SalesApp&formFactor=Phone`, adminToken)).data.lightningPage;
    assert.equal(appDefaultPage.apiName, 'Snapshot_Card_Page_Use',
      'record runtime must fall back to the org default when the app assignment excludes the form factor');
    const profileDefaultPage = (await api.send(`${recordRoute}?appId=SalesApp&formFactor=Desktop`, adminToken)).data.lightningPage;
    assert.equal(profileDefaultPage.apiName, 'Snapshot_Card_Profile_Assignment',
      'app, record type, and profile assignments must take precedence at runtime');
    const appSpecificPage = {
      ...appScopedPage,
      activationAssignments: [{ ...appScopedPage.activationAssignments[0], formFactors: ['Phone'] }]
    };
    assert.equal((await api.send('/metadata/pages/Snapshot_Card_App_Assignment', adminToken, 'PUT', appSpecificPage)).status, 200);
    const appDefaultPageAfterUpdate = (await api.send(`${recordRoute}?appId=SalesApp&formFactor=Phone`, adminToken)).data.lightningPage;
    assert.equal(appDefaultPageAfterUpdate.apiName, 'Snapshot_Card_App_Assignment',
      'matching App Default assignments must override the Org Default page');
    assert.equal((await api.send(`${recordRoute}?appId=SalesApp&formFactor=Tablet`, adminToken)).status, 400,
      'unsupported activation form factors must be rejected explicitly');
    const customDashboardComponent = {
      ...dashboardComponent,
      id: 'dashboard-custom-card',
      title: 'Custom Card',
      type: 'Custom',
      customComponentApiName: 'Snapshot_Card'
    };
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', sharedUserIds: [outsiderId], components: [customDashboardComponent]
    })).status, 200, 'registered dashboard components remain valid snapshot sources');
    const customSnapshot = await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken, 'POST', {
      label: 'Custom component snapshot',
      customComponents: [{
        componentId: customDashboardComponent.id,
        html: '<div onclick="alert(1)"><script>alert(1)</script><img src="https://example.invalid/pixel"><strong>Captured custom output</strong></div>'
      }]
    });
    assert.equal(customSnapshot.status, 201, JSON.stringify(customSnapshot.data));
    assert.match(customSnapshot.data.snapshot.components[0].customHtml, /Captured custom output/);
    assert.doesNotMatch(customSnapshot.data.snapshot.components[0].customHtml, /script|onclick|example\.invalid/i,
      'custom snapshots must strip executable markup and remote resources');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', outsiderToken)).data.snapshots.length, 0,
      'custom component snapshots remain private to their creator');
    assert.equal((await api.send(`/metadata/dashboards/Owner_Dashboard/snapshots/${customSnapshot.data.snapshot.id}`, ownerToken, 'DELETE')).status, 204);
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', sharedUserIds: [outsiderId]
    })).status, 200, 'restore the built-in dashboard before subscription coverage');
    const stackedChart = {
      ...dashboardComponent,
      id: 'dashboard-stacked-chart',
      title: 'Accounts by Industry and Type',
      type: 'Chart',
      groupByFieldApiName: 'Industry',
      seriesFieldApiName: 'Type',
      chartType: '100% Stacked Column',
      chartSortOrder: 'Ascending',
      chartLimit: 5,
      chartValueFormat: 'Currency',
      chartCurrencyCode: 'USD',
      chartDecimalPlaces: 0,
      showLegend: true,
      showValues: true
    };
    const validChartSave = await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', refreshIntervalMinutes: 5,
      sharedUserIds: [outsiderId], components: [stackedChart]
    });
    assert.equal(validChartSave.status, 200, JSON.stringify(validChartSave.data));
    assert.equal(validChartSave.data.dashboard.components[0].chartType, '100% Stacked Column');
    assert.equal(validChartSave.data.dashboard.components[0].chartLimit, 5);
    assert.equal(validChartSave.data.dashboard.components[0].chartSortOrder, 'Ascending');
    assert.equal(validChartSave.data.dashboard.components[0].chartValueFormat, 'Currency');
    assert.equal(validChartSave.data.dashboard.components[0].chartDecimalPlaces, 0);
    assert.equal(validChartSave.data.dashboard.refreshIntervalMinutes, 5);
    const scatterChart = {
      ...dashboardComponent,
      id: 'dashboard-scatter-chart',
      title: 'Revenue Scatter',
      type: 'Chart',
      aggregation: 'Sum',
      measureFieldApiName: 'AnnualRevenue',
      groupByFieldApiName: null,
      xAxisFieldApiName: 'AnnualRevenue',
      chartType: 'Scatter',
      chartDataLabelPosition: 'Inside',
      xAxisTitle: 'Annual revenue',
      yAxisTitle: 'Revenue total',
      showGridlines: false,
      legendPosition: 'Right'
    };
    const scatterSave = await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', sharedUserIds: [outsiderId], components: [scatterChart]
    });
    assert.equal(scatterSave.status, 200, JSON.stringify(scatterSave.data));
    assert.equal(scatterSave.data.dashboard.components[0].chartType, 'Scatter');
    assert.equal(scatterSave.data.dashboard.components[0].legendPosition, 'Right');
    assert.equal(scatterSave.data.dashboard.components[0].chartDataLabelPosition, 'Inside');
    const boundedScatterSave = await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', sharedUserIds: [outsiderId],
      components: [{
        ...scatterChart,
        chartXAxisMinimum: 0,
        chartXAxisMaximum: 1_000_000,
        chartYAxisMinimum: 0,
        chartYAxisMaximum: 1_000_000,
        chartValueFormat: 'Currency',
        chartCurrencyCode: 'USD',
        chartDecimalPlaces: 0
      }]
    });
    assert.equal(boundedScatterSave.status, 200, JSON.stringify(boundedScatterSave.data));
    assert.equal(boundedScatterSave.data.dashboard.components[0].chartXAxisMaximum, 1_000_000);
    assert.equal(boundedScatterSave.data.dashboard.components[0].chartYAxisMaximum, 1_000_000);
    const invalidAxisRange = await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', components: [{
        ...scatterChart, chartYAxisMinimum: 100, chartYAxisMaximum: 10
      }]
    });
    assert.equal(invalidAxisRange.status, 400, 'chart axes must reject a maximum less than or equal to the configured minimum');
    const scatterSnapshot = await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken, 'POST', {
      label: 'Scatter chart snapshot'
    });
    assert.equal(scatterSnapshot.status, 201, JSON.stringify(scatterSnapshot.data));
    assert.equal(scatterSnapshot.data.snapshot.components[0].chartType, 'Scatter');
    assert.equal(scatterSnapshot.data.snapshot.components[0].xAxisFieldApiName, 'AnnualRevenue');
    assert.equal(scatterSnapshot.data.snapshot.components[0].chartXAxisMaximum, 1_000_000);
    assert.equal(scatterSnapshot.data.snapshot.components[0].chartYAxisMaximum, 1_000_000);
    assert.equal(scatterSnapshot.data.snapshot.components[0].xAxisTitle, 'Annual revenue');
    assert.equal(scatterSnapshot.data.snapshot.components[0].showGridlines, false);
    assert.equal(scatterSnapshot.data.snapshot.components[0].chartDataLabelPosition, 'Inside');
    assert.equal((await api.send(`/metadata/dashboards/Owner_Dashboard/snapshots/${scatterSnapshot.data.snapshot.id}`, ownerToken, 'DELETE')).status, 204);
    const invalidScatter = await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', components: [{ ...scatterChart, xAxisFieldApiName: 'Name' }]
    });
    assert.equal(invalidScatter.status, 422, 'scatter charts must reject non-numeric x-axis fields');
    const invalidStackedChart = await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', sharedUserIds: [outsiderId],
      components: [{ ...stackedChart, seriesFieldApiName: null }]
    });
    assert.equal(invalidStackedChart.status, 400, 'stacked charts must select a secondary series field');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', outsiderToken, 'PUT', dashboard)).status, 403, 'shared viewers cannot edit another owner’s dashboard');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', outsiderToken, 'DELETE')).status, 403, 'shared viewers cannot delete another owner’s dashboard');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, visibility: 'All Users', status: 'Deployed', sharedUserIds: []
    })).status, 200);
    assert.equal((await api.send('/metadata/dashboards', outsiderToken)).data.dashboards.length, 1, 'published tenant-wide dashboards should be visible');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, visibility: 'All Users', status: 'Draft'
    })).status, 200);
    assert.equal((await api.send('/metadata/dashboards', outsiderToken)).data.dashboards.length, 0, 'draft dashboards should not leak to tenant-wide viewers');

    const roleCreate = await api.send('/metadata/roles', adminToken, 'POST', {
      id: 'smoke-new-role', name: 'Smoke New Role', apiName: 'Smoke_New_Role', parentRoleId: null
    });
    assert.equal(roleCreate.status, 201);
    const cycleRole = await api.send('/metadata/roles/smoke-new-role', adminToken, 'PUT', {
      name: 'Smoke New Role', apiName: 'Smoke_New_Role', parentRoleId: 'smoke-new-role'
    });
    assert.equal(cycleRole.status, 400, 'role hierarchy cycles must be rejected');
    assert.equal((await api.send('/metadata/roles/smoke-owner-role', adminToken, 'DELETE')).status, 409, 'a parent role cannot be removed');
    assert.ok((await api.send('/metadata/roles', adminToken)).data.roles.some((role: { id: string }) => role.id === 'smoke-new-role'));
    assert.equal((await api.send('/metadata/roles/smoke-new-role', adminToken, 'DELETE')).status, 204);

    const recordResponse = await api.send('/records/Account', ownerToken, 'POST', {
      Name: 'Smoke Private Account', Phone: '555-0100', Report_Date__c: new Date().toISOString().slice(0, 10)
    });
    assert.equal(recordResponse.status, 201, JSON.stringify(recordResponse.data));
    const recordId = recordResponse.data.record.Id as string;
    const secondOwnerAccount = await api.send('/records/Account', ownerToken, 'POST', {
      Name: 'Smoke Zulu Account', Report_Date__c: new Date().toISOString().slice(0, 10)
    });
    assert.equal(secondOwnerAccount.status, 201, JSON.stringify(secondOwnerAccount.data));
    const frozenSnapshot = (await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken)).data.snapshots[0];
    assert.equal(frozenSnapshot.components[0].metricValue, 0,
      'a dashboard snapshot must retain the capture-time result after records change');
    assert.equal((await api.send(`/metadata/dashboards/Owner_Dashboard/snapshots/${dashboardSnapshot.data.snapshot.id}`, ownerToken, 'DELETE')).status, 204);
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken)).data.snapshots.length, 0,
      'deleting a snapshot removes its persisted history entry');
    const childRecord = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Smoke Child Contact', AccountId: recordId
    });
    assert.equal(childRecord.status, 201, JSON.stringify(childRecord.data));
    const invalidRecordTypePicklist = await api.send('/records/Contact', ownerToken, 'POST', {
      Name: 'Invalid Retail Contact', RecordTypeId: 'contact-retail', Source__c: 'Referral'
    });
    assert.equal(invalidRecordTypePicklist.status, 422, 'record type picklist values must be enforced by the server');
    const invalidDependentPicklist = await api.send('/records/Contact', ownerToken, 'POST', {
      Name: 'Invalid Dependent Picklist Contact', RecordTypeId: 'contact-retail', Source__c: 'Web', Rating__c: 'Hot'
    });
    assert.equal(invalidDependentPicklist.status, 422, 'dependent picklist mappings must be enforced by the server');
    const invalidDependentMultiSelect = await api.send('/records/Contact', ownerToken, 'POST', {
      Name: 'Invalid Dependent Multi-Select Contact', RecordTypeId: 'contact-retail',
      Source__c: 'Web', Campaign_Topics__c: 'Events'
    });
    assert.equal(invalidDependentMultiSelect.status, 422, 'dependent multi-select values must be checked against the controlling value');
    const validDependentMultiSelect = await api.send('/records/Contact', ownerToken, 'POST', {
      Name: 'Valid Dependent Multi-Select Contact', RecordTypeId: 'contact-retail',
      Source__c: 'Web', Campaign_Topics__c: 'Product;Training'
    });
    assert.equal(validDependentMultiSelect.status, 201, JSON.stringify(validDependentMultiSelect.data));
    const invalidMultiSelect = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Invalid Multi-Select Contact', RecordTypeId: 'contact-retail', Topics__c: 'Product;Unknown'
    });
    assert.equal(invalidMultiSelect.status, 422, 'restricted multi-select values must be validated by the server');
    const validMultiSelect = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Valid Multi-Select Contact', RecordTypeId: 'contact-retail', Topics__c: 'Product;Training', Notes__c: 'First line\nSecond line'
    });
    assert.equal(validMultiSelect.status, 201, JSON.stringify(validMultiSelect.data));
    assert.equal(validMultiSelect.data.record.Topics__c, 'Product;Training');
    assert.equal(validMultiSelect.data.record.Notes__c, 'First line\nSecond line');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Oversized Notes Contact', RecordTypeId: 'contact-retail', Notes__c: 'x'.repeat(131073)
    })).status, 422, 'long text areas must enforce their maximum length');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Wrong Record Type Multi-Select Contact', RecordTypeId: 'contact-partner', Topics__c: 'Product'
    })).status, 422, 'multi-select values must also respect record-type availability');
    assert.equal((await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Duplicate Multi-Select Contact', Topics__c: 'Product;Product'
    })).status, 422, 'multi-select fields must reject duplicate selections');
    const contactMetadata = (await api.send('/metadata/objects/Contact', adminToken)).data.object as {
      fields: Array<Record<string, unknown>>;
    };
    const invalidDependentField = {
      ...contactMetadata.fields.find((field) => field.apiName === 'Rating__c'),
      valueSettings: { Web: ['Not a configured value'], Referral: ['Hot'] }
    };
    assert.equal((await api.send('/metadata/objects/Contact/fields/Rating__c', adminToken, 'PUT', invalidDependentField)).status, 400,
      'dependent picklist metadata cannot reference values outside its value set');
    assert.equal((await api.send('/metadata/objects/Contact/fields/Source__c', adminToken, 'DELETE')).status, 409,
      'a controller field referenced by dependent picklists or record types cannot be removed');
    const retailContact = await api.send('/records/Contact', ownerToken, 'POST', {
      Name: 'Smoke Retail Contact', RecordTypeId: 'contact-retail', Source__c: 'Web', Rating__c: 'Cold'
    });
    assert.equal(retailContact.status, 201, JSON.stringify(retailContact.data));
    const ratingField = contactMetadata.fields.find((field) => field.apiName === 'Rating__c')!;
    assert.equal((await api.send('/metadata/objects/Contact/fields/Rating__c', adminToken, 'PUT', {
      ...ratingField, valueSettings: { Web: [], Referral: ['Hot'] }
    })).status, 409, 'dependency mappings cannot be changed incompatibly with existing record values');
    const createdDependentPicklist = await api.send('/metadata/objects/Contact/fields', adminToken, 'POST', {
      apiName: 'Created_Dependency__c',
      label: 'Created Dependency',
      dataType: 'Picklist',
      required: false,
      unique: false,
      picklistValues: ['Alpha', 'Beta'],
      picklistRestricted: true,
      controllerFieldApiName: 'Source__c',
      valueSettings: { Web: ['Alpha'], Referral: ['Beta'] }
    });
    assert.equal(createdDependentPicklist.status, 201, JSON.stringify(createdDependentPicklist.data));
    assert.deepEqual(createdDependentPicklist.data.field.valueSettings, { Web: ['Alpha'], Referral: ['Beta'] },
      'field creation must persist controlling-field mappings atomically with its picklist values');
    const reloadedContactFields = (await api.send('/metadata/objects/Contact', adminToken)).data.object.fields;
    assert.deepEqual(reloadedContactFields.find((field: { apiName: string }) => field.apiName === 'Created_Dependency__c').valueSettings,
      { Web: ['Alpha'], Referral: ['Beta'] },
      'dependent picklist mappings must round-trip through object metadata reloads');
    const createdDependencyRecord = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Created Dependency Runtime Contact',
      Source__c: 'Web',
      Created_Dependency__c: 'Alpha'
    });
    assert.equal(createdDependencyRecord.status, 201, JSON.stringify(createdDependencyRecord.data));
    assert.equal((await api.send(`/records/Contact/${createdDependencyRecord.data.record.Id}`, adminToken, 'PUT', {
      RecordTypeId: 'contact-partner',
      Source__c: 'Referral'
    })).status, 422, 'record updates must reject dependent values that no longer match the controller');
    assert.equal((await api.send('/records/Contact/import', adminToken, 'POST', {
      records: [{ Name: 'Invalid Created Dependency Import', Source__c: 'Web', Created_Dependency__c: 'Beta' }]
    })).status, 422, 'record imports must enforce newly created dependent-picklist mappings');
    const createdDependentUpdate = await api.send(`/records/Contact/${createdDependencyRecord.data.record.Id}`, adminToken, 'PUT', {
      RecordTypeId: 'contact-partner',
      Source__c: 'Referral',
      Created_Dependency__c: 'Beta'
    });
    assert.equal(createdDependentUpdate.status, 200, JSON.stringify(createdDependentUpdate.data));
    assert.equal((await api.send(`/records/Contact/${retailContact.data.record.Id}`, ownerToken, 'PUT', {
      RecordTypeId: 'contact-partner', Source__c: 'Referral'
    })).status, 422,
      'changing a controller cannot leave an incompatible dependent value on an existing record');
    const changedDependentContact = await api.send(`/records/Contact/${retailContact.data.record.Id}`, ownerToken, 'PUT', {
      RecordTypeId: 'contact-partner', Source__c: 'Referral', Rating__c: 'Hot'
    });
    assert.equal(changedDependentContact.status, 200, JSON.stringify(changedDependentContact.data));
    const partnerContact = await api.send('/records/Contact', ownerToken, 'POST', {
      Name: 'Smoke Partner Contact', RecordTypeId: 'contact-partner', Source__c: 'Referral'
    });
    assert.equal(partnerContact.status, 201, JSON.stringify(partnerContact.data));
    const contactsBeforeInvalidImport = (await api.send('/records/Contact', adminToken)).data.records.length as number;
    const rejectedImport = await api.send('/records/Contact/import', ownerToken, 'POST', {
      records: [
        { Name: 'Would Roll Back', RecordTypeId: 'contact-retail', Source__c: 'Web' },
        { Name: 'Invalid Imported Contact', RecordTypeId: 'contact-retail', Source__c: 'Referral' }
      ]
    });
    assert.equal(rejectedImport.status, 422, 'a bad import row must reject the batch');
    assert.equal((await api.send('/records/Contact', adminToken)).data.records.length, contactsBeforeInvalidImport,
      'failed imports must not persist a partial batch');
    const importResult = await api.send('/records/Contact/import', ownerToken, 'POST', {
      records: [
        { Name: 'Imported Contact One', RecordTypeId: 'contact-retail', Source__c: 'Web' },
        { Name: 'Imported Contact Two', RecordTypeId: 'contact-partner', Source__c: 'Referral' }
      ]
    });
    assert.equal(importResult.status, 201, JSON.stringify(importResult.data));
    assert.equal(importResult.data.count, 2);
    const expandedImport = await api.send('/records/Contact/import', ownerToken, 'POST', {
      records: Array.from({ length: 201 }, (_, index) => ({
        Name: `Expanded Import Contact ${index + 1}`,
        RecordTypeId: 'contact-retail',
        Source__c: 'Web'
      }))
    });
    assert.equal(expandedImport.status, 201, JSON.stringify(expandedImport.data));
    assert.equal(expandedImport.data.count, 201, 'CSV import must not apply an undocumented 200-row application limit');
    const campaignResult = await api.send('/records/Campaign', adminToken, 'POST', { Name: 'Smoke Campaign' });
    assert.equal(campaignResult.status, 201, JSON.stringify(campaignResult.data));
    const campaignId = campaignResult.data.record.Id as string;
    const campaignMembers = await api.send(`/campaigns/${campaignId}/members`, adminToken, 'POST', {
      contactIds: [childRecord.data.record.Id, retailContact.data.record.Id]
    });
    assert.equal(campaignMembers.status, 201, JSON.stringify(campaignMembers.data));
    assert.equal(campaignMembers.data.addedCount, 2);
    const duplicateCampaignMembers = await api.send(`/campaigns/${campaignId}/members`, adminToken, 'POST', {
      contactIds: [childRecord.data.record.Id, retailContact.data.record.Id]
    });
    assert.equal(duplicateCampaignMembers.data.addedCount, 0);
    assert.equal(duplicateCampaignMembers.data.alreadyMemberCount, 2, 'campaign membership must be idempotent');
    permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')
      .fieldPermissions['Account.Phone'] = { read: false, edit: false };
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    const currentUserAccess = (await api.send('/auth/me', ownerToken)).data.user;
    assert.deepEqual(currentUserAccess.fieldAccess['Account.Phone'], { read: false, edit: false },
      'the current-user endpoint must expose effective field access for UI rendering');
    assert.equal(currentUserAccess.recordTypeAccess['Account.smoke-secondary'], false,
      'the current-user endpoint must expose effective record type access');
    const unrelatedAccount = await api.send('/records/Account', ownerToken, 'POST', { Name: 'Other Smoke Account' });
    assert.equal(unrelatedAccount.status, 201);
    const ownerAccountsUnderPrivate = await api.send('/records/Account', ownerToken);
    const managerAccountsUnderPrivate = await api.send('/records/Account', managerToken);
    assert.equal(managerAccountsUnderPrivate.data.records.length, ownerAccountsUnderPrivate.data.records.length,
      'role ancestors must inherit read access to child-owned records even under Private OWD');
    assert.equal((await api.send('/records/Account', outsiderToken)).data.records.length, 0, 'Private OWD must hide unrelated records');
    assert.equal((await api.send(`/records/Account/${recordId}`, outsiderToken)).status, 404);
    const hierarchyDashboard = await api.send('/metadata/dashboards/Hierarchy_Smoke_Dashboard', ownerToken, 'PUT', {
      ...dashboard,
      label: 'Hierarchy Smoke Dashboard',
      visibility: 'All Users',
      status: 'Deployed',
      sharedUserIds: [],
      components: [dashboardComponent]
    });
    assert.equal(hierarchyDashboard.status, 200, JSON.stringify(hierarchyDashboard.data));
    const managerDashboardRecords = await api.send('/metadata/dashboards/Hierarchy_Smoke_Dashboard/data/Account', managerToken);
    assert.equal(managerDashboardRecords.status, 200, JSON.stringify(managerDashboardRecords.data));
    assert.equal(managerDashboardRecords.data.records.length, ownerAccountsUnderPrivate.data.records.length,
      'dynamic dashboards must return the manager hierarchy scope rather than the child or admin scope');

    const ownerTransfer = await api.send(`/records/Account/${recordId}`, ownerToken, 'PUT', { OwnerId: outsiderId });
    assert.equal(ownerTransfer.status, 403, 'ordinary record edits cannot transfer ownership');
    assert.equal((await api.send(`/records/Account/${recordId}/owner`, ownerToken, 'PUT', { ownerId: outsiderId })).status, 403,
      'ordinary users cannot use the dedicated ownership operation');
    const accountActionMetadata = (await api.send('/metadata/objects/Account', adminToken)).data.object;
    assert.ok(accountActionMetadata.listViewButtons.includes('Change Owner'),
      'the account list view must expose the configured ownership action before testing its runtime gate');
    const changeOwnerDisabled = await api.send('/metadata/objects/Account', adminToken, 'PUT', {
      ...accountActionMetadata,
      listViewButtons: accountActionMetadata.listViewButtons.filter((button: string) => button !== 'Change Owner')
    });
    assert.equal(changeOwnerDisabled.status, 200, JSON.stringify(changeOwnerDisabled.data));
    assert.equal((await api.send(`/records/Account/${recordId}/owner`, adminToken, 'PUT', { ownerId: outsiderId })).status, 403,
      'the ownership API must enforce the Object Manager Change Owner list-view setting');
    assert.equal((await api.send('/metadata/objects/Account', adminToken, 'PUT', accountActionMetadata)).status, 200,
      'the ownership action must be restored before subsequent ownership checks');
    const adminOwnerTransfer = await api.send(`/records/Account/${recordId}/owner`, adminToken, 'PUT', { ownerId: outsiderId });
    assert.equal(adminOwnerTransfer.status, 200, JSON.stringify(adminOwnerTransfer.data));
    assert.equal(adminOwnerTransfer.data.record.OwnerId, outsiderId, 'authorized transfers must persist the tenant-scoped owner');
    assert.equal((await api.send(`/records/Account/${recordId}/owner`, adminToken, 'PUT', { ownerId: randomUUID() })).status, 422,
      'ownership transfers must reject users outside the tenant');
    assert.equal((await api.send(`/records/Account/${recordId}/owner`, adminToken, 'PUT', { ownerId })).status, 200,
      'ownership can be transferred back to an active user in the same tenant');
    const report = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Name',
      sortDirection: 'Ascending', filters: [], folderName: 'Public Reports'
    });
    assert.equal(report.status, 200, JSON.stringify(report.data));
    const previewReport = {
      ...report.data.report,
      apiName: 'Unsaved_Report_Preview',
      label: 'Unsaved Report Preview'
    };
    const preview = await api.send('/reports/preview', ownerToken, 'POST', {
      report: previewReport,
      offset: 0,
      limit: 100
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.totalRows, ownerAccountsUnderPrivate.data.records.length,
      'unsaved report previews must use the current user record-access scope');
    assert.equal((await api.send('/metadata/reports', adminToken)).data.reports
      .some((item: { apiName: string }) => item.apiName === 'Unsaved_Report_Preview'), false,
    'previewing an unsaved report must not persist it');
    const deniedPreview = await api.send('/reports/preview', ownerToken, 'POST', {
      report: { ...previewReport, fieldApiNames: ['Phone'], sortFieldApiName: 'Phone' },
      offset: 0,
      limit: 100
    });
    assert.equal(deniedPreview.status, 403, `unsaved previews must enforce field-level read access: ${JSON.stringify(deniedPreview.data)}`);
    const managerReport = await api.send('/reports/Sharing_Smoke/run', managerToken, 'POST', {
      offset: 0, limit: 5000
    });
    assert.equal(managerReport.status, 200, JSON.stringify(managerReport.data));
    assert.equal(managerReport.data.totalRows, managerAccountsUnderPrivate.data.records.length,
      'reports must aggregate the manager hierarchy scope while a child report remains scoped to that child');
    assert.equal(report.data.report.sortFieldApiName, 'Name');
    assert.equal(report.data.report.sortDirection, 'Ascending');
    const firstReportPage = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 1 });
    const secondReportPage = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 1, limit: 1 });
    assert.equal(firstReportPage.data.pageSize, 1);
    assert.equal(secondReportPage.data.offset, 1);
    assert.equal(secondReportPage.data.totalRows, firstReportPage.data.totalRows);
    assert.equal(firstReportPage.data.totalRows, ownerAccountsUnderPrivate.data.records.length,
      'the child report must stay scoped to the child-owned records instead of inheriting its manager access');
    assert.notEqual(secondReportPage.data.rows[0]?.Name, firstReportPage.data.rows[0]?.Name,
      'report-backed dashboard tables must be able to load later pages');
    assert.ok(String(firstReportPage.data.rows[0]?.Name).localeCompare(String(secondReportPage.data.rows[0]?.Name)) < 0,
      'report sorting must be applied server-side before pagination');
    const ownerSubtotalReport = await api.send('/metadata/reports/Owner_Subtotal_Smoke', adminToken, 'PUT', {
      label: 'Owner Subtotal Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name', 'CreatedDate'], groupByFieldApiNames: ['Name', 'CreatedDate'],
      format: 'Summary',
      filters: [{ id: 'owner-subtotal-name', fieldApiName: 'Name', operator: 'Starts With', value: 'Smoke ' }],
      folderName: 'Public Reports'
    });
    assert.equal(ownerSubtotalReport.status, 200, JSON.stringify(ownerSubtotalReport.data));
    const ownerSubtotalRun = await api.send('/reports/Owner_Subtotal_Smoke/run', ownerToken, 'POST', {
      offset: 0, limit: 5000
    });
    assert.equal(ownerSubtotalRun.status, 200, JSON.stringify(ownerSubtotalRun.data));
    assert.equal(ownerSubtotalRun.data.subtotalRows.reduce((total: number, subtotal: { rowCount: number }) =>
      total + subtotal.rowCount, 0), ownerSubtotalRun.data.totalRows,
    'subtotal aggregates only include records visible to the report runner');
    assert.ok(ownerSubtotalRun.data.subtotalRows.every((subtotal: {
      groupValues: Record<string, unknown>;
    }) => String(subtotal.groupValues.Name).startsWith('Smoke ')),
    'subtotal group values must not expose names from inaccessible records');
    const logicalFilters = [
      { id: 'report-name-match', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account' },
      { id: 'report-name-miss', fieldApiName: 'Name', operator: 'Equals', value: 'No Matching Account' }
    ];
    const allReportFilters = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Name',
      sortDirection: 'Ascending', filterLogic: 'All', filters: logicalFilters
    });
    assert.equal(allReportFilters.status, 200, JSON.stringify(allReportFilters.data));
    assert.equal(allReportFilters.data.report.filterLogic, 'All');
    const allReportFiltersRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(allReportFiltersRun.data.totalRows, 0, 'All report-filter logic requires every saved filter to match');
    const anyReportFilters = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Name',
      sortDirection: 'Ascending', filterLogic: 'Any', filters: logicalFilters
    });
    assert.equal(anyReportFilters.status, 200, JSON.stringify(anyReportFilters.data));
    const anyReportFiltersRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(anyReportFiltersRun.data.totalRows, 1, 'Any report-filter logic accepts a record matching one saved filter');
    assert.equal(anyReportFiltersRun.data.report.filterLogic, 'Any');
    const blankAnyFilterReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: '1 OR 2',
      filters: [
        { id: 'blank-any-filter', fieldApiName: 'Name', operator: 'Equals', value: '' },
        { id: 'active-any-filter', fieldApiName: 'Name', operator: 'Equals', value: 'No Matching Account' }
      ]
    });
    assert.equal(blankAnyFilterReport.status, 200, JSON.stringify(blankAnyFilterReport.data));
    const blankAnyFilterRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(blankAnyFilterRun.data.totalRows, 0, 'blank field filters do not make an OR expression match every record');
    const allBlankFilterReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: '1 AND 2',
      filters: [
        { id: 'blank-all-filter-one', fieldApiName: 'Name', operator: 'Equals', value: '' },
        { id: 'blank-all-filter-two', fieldApiName: 'Name', operator: 'Equals', value: '' }
      ]
    });
    assert.equal(allBlankFilterReport.status, 200, JSON.stringify(allBlankFilterReport.data));
    const allBlankFilterRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.ok(allBlankFilterRun.data.totalRows > 0, 'All logic treats an entirely blank filter set as unrestricted');
    const blankNegatedGroupReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: 'NOT (1 OR 2)',
      filters: [
        { id: 'blank-negated-filter-one', fieldApiName: 'Name', operator: 'Equals', value: '' },
        { id: 'blank-negated-filter-two', fieldApiName: 'Name', operator: 'Equals', value: '' }
      ]
    });
    assert.equal(blankNegatedGroupReport.status, 200, JSON.stringify(blankNegatedGroupReport.data));
    const blankNegatedGroupRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.ok(blankNegatedGroupRun.data.totalRows > 0, 'NOT over a nested group of blank filters remains unrestricted');
    const doesNotContainReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: 'All',
      filters: [{ id: 'exclude-private', fieldApiName: 'Name', operator: 'Does Not Contain', value: 'Private' }]
    });
    assert.equal(doesNotContainReport.status, 200, JSON.stringify(doesNotContainReport.data));
    const doesNotContainRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.ok(doesNotContainRun.data.rows.every((row: { Name: string }) => !row.Name.includes('Private')),
      'Does Not Contain report filters exclude matching field values');
    const invalidTextComparison = await api.send('/metadata/reports/Invalid_Text_Comparison_Smoke', adminToken, 'PUT', {
      label: 'Invalid Text Comparison', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filters: [
        { id: 'invalid-text-comparison', fieldApiName: 'Name', operator: 'Greater Than', value: 'A' }
      ]
    });
    assert.equal(invalidTextComparison.status, 422,
      'report filters reject numeric comparison operators on text fields');
    const invalidNumericValue = await api.send('/metadata/reports/Invalid_Numeric_Filter_Value_Smoke', adminToken, 'PUT', {
      label: 'Invalid Numeric Filter Value', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filters: [
        { id: 'invalid-numeric-filter-value', fieldApiName: 'AnnualRevenue', operator: 'Greater Than', value: 'not a number' }
      ]
    });
    assert.equal(invalidNumericValue.status, 422,
      'report filters reject values that cannot be compared as numbers');
    const customLogicReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [],
      filterLogic: '(1 OR 2) AND NOT 3',
      filters: [
        { id: 'custom-logic-1', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account' },
        { id: 'custom-logic-2', fieldApiName: 'Name', operator: 'Equals', value: 'No Matching Account' },
        { id: 'custom-logic-3', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account' }
      ]
    });
    assert.equal(customLogicReport.status, 200, JSON.stringify(customLogicReport.data));
    const customLogicRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(customLogicRun.data.totalRows, 0, 'custom Boolean filter logic supports grouped AND, OR, and NOT');
    assert.equal((await api.send('/metadata/reports/Invalid_Logic_Smoke', adminToken, 'PUT', {
      label: 'Invalid Logic', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: '1 OR 4',
      filters: [{ id: 'only-filter', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account' }]
    })).status, 400, 'filter logic must reject references to nonexistent filter numbers');
    const lockedFilterReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: 'All',
      filters: [{ id: 'locked-name', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account', locked: true }]
    });
    assert.equal(lockedFilterReport.status, 200, JSON.stringify(lockedFilterReport.data));
    assert.equal((await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      reportFilterOverrides: [{ id: 'locked-name', value: 'Smoke Zulu Account' }]
    })).status, 403, 'locked report filters cannot be overridden when a report runs');
    const unlockedRunValue = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: 'All',
      filters: [{ id: 'run-name', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account' }]
    });
    assert.equal(unlockedRunValue.status, 200, JSON.stringify(unlockedRunValue.data));
    const overrideRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      reportFilterOverrides: [{ id: 'run-name', value: 'Smoke Zulu Account' }]
    });
    assert.equal(overrideRun.data.totalRows, 1, 'unlocked report filter values can be changed for an individual run');
    const standardFilterReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filterLogic: '1 OR 2',
      filters: [
        { id: 'smoke-private-account', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account' },
        { id: 'smoke-zulu-account', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Zulu Account' }
      ],
      standardFilters: { showMe: 'My', dateFieldApiName: 'CreatedDate', dateRange: 'Today' }
    });
    assert.equal(standardFilterReport.status, 200, JSON.stringify(standardFilterReport.data));
    const ownerStandardFilterRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(ownerStandardFilterRun.data.totalRows, 2, 'My and Today standard filters are applied to report results');
    const managerStandardFilterRun = await api.send('/reports/Sharing_Smoke/run', managerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(managerStandardFilterRun.data.totalRows, 0, 'My standard filters are evaluated for the running user');
    const openOpportunity = await api.send('/records/Opportunity', adminToken, 'POST', {
      Name: 'Report Open Opportunity', StageName: 'Prospecting', Amount: 100000, CloseDate: '2026-12-31'
    });
    assert.equal(openOpportunity.status, 201, JSON.stringify(openOpportunity.data));
    const closedOpportunity = await api.send('/records/Opportunity', adminToken, 'POST', {
      Name: 'Report Closed Opportunity', StageName: 'Closed Won', Amount: 200000, CloseDate: '2026-12-31'
    });
    assert.equal(closedOpportunity.status, 201, JSON.stringify(closedOpportunity.data));
    const qualifiedOpportunity = await api.send('/records/Opportunity', adminToken, 'POST', {
      Name: 'Report Qualified Opportunity', StageName: 'Qualification', Amount: 150000, CloseDate: '2026-12-31'
    });
    assert.equal(qualifiedOpportunity.status, 201, JSON.stringify(qualifiedOpportunity.data));
    const opportunityStatusReport = await api.send('/metadata/reports/Opportunity_Status_Filter_Smoke', adminToken, 'PUT', {
      label: 'Opportunity Status Filter Smoke', description: '', objectApiName: 'Opportunity',
      fieldApiNames: ['Name', 'Fiscal', 'Age', 'CreatedDate', 'OwnerId', 'OwnerRole', 'AccountId'], groupByFieldApiNames: [],
      filters: [{ id: 'opportunity-name-scope', fieldApiName: 'Name', operator: 'Contains', value: 'Report ' }],
      standardFilters: { showMe: 'All', dateFieldApiName: null, dateRange: 'All Time', statusFieldApiName: 'StageName', statusSelection: 'Open' }
    });
    assert.equal(opportunityStatusReport.status, 200, JSON.stringify(opportunityStatusReport.data));
    const openOpportunityRun = await api.send('/reports/Opportunity_Status_Filter_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(openOpportunityRun.data.totalRows, 2, 'the standard Open status filter excludes closed opportunity stages');
    const openOpportunityRow = openOpportunityRun.data.rows.find((row: { Name: string }) => row.Name === 'Report Open Opportunity');
    assert.equal(openOpportunityRow.Fiscal, 'FY2026 Q4');
    assert.equal(typeof openOpportunityRow.Age, 'number');
    assert.ok(Number.isFinite(Date.parse(openOpportunityRow.CreatedDate)));
    assert.equal(openOpportunityRow.OwnerId, admin.name);
    assert.equal(typeof openOpportunityRow.OwnerRole, 'string');
    const closedStatusReport = await api.send('/metadata/reports/Opportunity_Status_Filter_Smoke', adminToken, 'PUT', {
      label: 'Opportunity Status Filter Smoke', description: '', objectApiName: 'Opportunity',
      fieldApiNames: ['Name'], groupByFieldApiNames: [],
      filters: [{ id: 'opportunity-name-scope', fieldApiName: 'Name', operator: 'Contains', value: 'Report ' }],
      standardFilters: { showMe: 'All', dateFieldApiName: null, dateRange: 'All Time', statusFieldApiName: 'StageName', statusSelection: 'Closed' }
    });
    assert.equal(closedStatusReport.status, 200, JSON.stringify(closedStatusReport.data));
    const closedOpportunityRun = await api.send('/reports/Opportunity_Status_Filter_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(closedOpportunityRun.data.totalRows, 1, 'the standard Closed status filter includes closed opportunity stages');
    const closedWonStatusReport = await api.send('/metadata/reports/Opportunity_Status_Filter_Smoke', adminToken, 'PUT', {
      label: 'Opportunity Status Filter Smoke', description: '', objectApiName: 'Opportunity',
      fieldApiNames: ['Name'], groupByFieldApiNames: [],
      filters: [{ id: 'opportunity-name-scope', fieldApiName: 'Name', operator: 'Contains', value: 'Report ' }],
      standardFilters: { showMe: 'All', dateFieldApiName: null, dateRange: 'All Time', statusFieldApiName: 'StageName', statusSelection: 'Closed Won' }
    });
    assert.equal(closedWonStatusReport.status, 200, JSON.stringify(closedWonStatusReport.data));
    const closedWonRun = await api.send('/reports/Opportunity_Status_Filter_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(closedWonRun.data.totalRows, 1, 'the standard status filter can select an individual picklist value');
    const multiValueReport = await api.send('/metadata/reports/Opportunity_Status_Filter_Smoke', adminToken, 'PUT', {
      label: 'Opportunity Status Filter Smoke', description: '', objectApiName: 'Opportunity',
      fieldApiNames: ['Name'], groupByFieldApiNames: [],
      filterLogic: 'All',
      filters: [
        { id: 'stage-multi-value', fieldApiName: 'StageName', operator: 'Equals', value: '', values: ['Prospecting', 'Qualification'] },
        { id: 'opportunity-name-scope', fieldApiName: 'Name', operator: 'Contains', value: 'Report ' }
      ]
    });
    assert.equal(multiValueReport.status, 200, JSON.stringify(multiValueReport.data));
    const multiValueRun = await api.send('/reports/Opportunity_Status_Filter_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(multiValueRun.data.totalRows, 2, 'picklist filters match any of their selected values');
    const multiValueRunOverride = await api.send('/reports/Opportunity_Status_Filter_Smoke/run', adminToken, 'POST', {
      reportFilterOverrides: [{ id: 'stage-multi-value', value: '', values: ['Prospecting'] }]
    });
    assert.equal(multiValueRunOverride.data.totalRows, 1, 'picklist report-run values can select a different subset of values');
    const inclusiveNumericReport = await api.send('/metadata/reports/Opportunity_Status_Filter_Smoke', adminToken, 'PUT', {
      label: 'Opportunity Status Filter Smoke', description: '', objectApiName: 'Opportunity',
      fieldApiNames: ['Name'], groupByFieldApiNames: [],
      filterLogic: 'All',
      filters: [
        { id: 'opportunity-name-scope', fieldApiName: 'Name', operator: 'Contains', value: 'Report ' },
        { id: 'amount-inclusive-boundary', fieldApiName: 'Amount', operator: 'Greater Than or Equal To', value: '150000' }
      ]
    });
    assert.equal(inclusiveNumericReport.status, 200, JSON.stringify(inclusiveNumericReport.data));
    const inclusiveNumericRun = await api.send('/reports/Opportunity_Status_Filter_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(inclusiveNumericRun.data.totalRows, 2, 'inclusive numeric report operators include records at and above the comparison value');
    assert.equal((await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Name',
      sortDirection: 'Ascending', filters: []
    })).status, 200);
    const sortedOwnerRows = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    const rowLimitedReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filters: [],
      rowLimit: { limit: 1, sortFieldApiName: 'Name', sortDirection: 'Ascending' }
    });
    assert.equal(rowLimitedReport.status, 200, JSON.stringify(rowLimitedReport.data));
    const rowLimitedRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(rowLimitedRun.data.totalRows, 1, 'tabular row limits cap the sorted report result set');
    assert.equal(rowLimitedRun.data.rows[0].Name, sortedOwnerRows.data.rows[0].Name, 'row limits retain the first row in the configured sort order');
    assert.equal((await api.send('/metadata/reports/Invalid_Row_Limit_Smoke', adminToken, 'PUT', {
      label: 'Invalid Row Limit', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: ['Name'], format: 'Summary', filters: [],
      rowLimit: { limit: 1, sortFieldApiName: 'Name', sortDirection: 'Ascending' }
    })).status, 400, 'row limits are restricted to tabular reports');
    const crossFilterReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filters: [],
      crossFilters: [{
        id: 'accounts-with-child-contact',
        childObjectApiName: 'Contact',
        mode: 'With',
        filters: [{ id: 'child-contact-name', fieldApiName: 'Name', operator: 'Equals', value: '', values: ['Smoke Child Contact', 'No Matching Contact'] }]
      }]
    });
    assert.equal(crossFilterReport.status, 200, JSON.stringify(crossFilterReport.data));
    const withCrossFilterRun = await api.send('/reports/Sharing_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
    assert.ok(withCrossFilterRun.data.rows.some((row: { Name: string }) => row.Name === 'Smoke Private Account'),
      'with cross-filters match a related child object and its subfilter');
    const withoutCrossFilterReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filters: [],
      crossFilters: [{
        id: 'accounts-without-child-contact',
        childObjectApiName: 'Contact',
        mode: 'Without',
        filters: [{ id: 'child-contact-name-2', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Child Contact' }]
      }]
    });
    assert.equal(withoutCrossFilterReport.status, 200, JSON.stringify(withoutCrossFilterReport.data));
    const withoutCrossFilterRun = await api.send('/reports/Sharing_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
    assert.ok(!withoutCrossFilterRun.data.rows.some((row: { Name: string }) => row.Name === 'Smoke Private Account'),
      'without cross-filters exclude a parent with a matching related child');
    assert.equal((await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Name',
      sortDirection: 'Ascending', filters: []
    })).status, 200, 'the report must be reset before independent sorting and matrix checks');
    assert.equal((await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Website',
      sortDirection: 'Ascending', filters: []
    })).status, 400, 'reports must not sort by fields outside their selected columns and groups');
    const descendingReport = await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Name',
      sortDirection: 'Descending', filters: []
    });
    assert.equal(descendingReport.status, 200, JSON.stringify(descendingReport.data));
    const descendingRows = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.ok(String(descendingRows.data.rows[0]?.Name).localeCompare(String(descendingRows.data.rows[descendingRows.data.rows.length - 1]?.Name)) > 0,
      'descending report sorting must be applied across the full result set');
    const matrixReport = await api.send('/metadata/reports/Matrix_Smoke', adminToken, 'PUT', {
      label: 'Matrix Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name', 'AnnualRevenue'], groupByFieldApiNames: ['Industry'],
      format: 'Matrix', columnGroupByFieldApiName: 'Type', filters: [],
      summaryOperations: { Name: ['Count'], AnnualRevenue: ['Sum', 'Average', 'Minimum', 'Maximum'] },
      showDetails: false, showChart: true, folderName: 'Public Reports'
    });
    assert.equal(matrixReport.status, 200, JSON.stringify(matrixReport.data));
    assert.equal(matrixReport.data.report.folderName, 'Public Reports');
    assert.equal(matrixReport.data.report.showChart, true);
    assert.equal(matrixReport.data.report.showDetails, false);
    const matrixRun = await api.send('/reports/Matrix_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    assert.equal(matrixRun.status, 200, JSON.stringify(matrixRun.data));
    assert.equal(matrixRun.data.report.format, 'Matrix');
    assert.equal(matrixRun.data.report.columnGroupByFieldApiName, 'Type');
    assert.deepEqual(matrixRun.data.report.summaryOperations.Name, ['Count']);
    assert.deepEqual(matrixRun.data.report.summaryOperations.AnnualRevenue, ['Sum', 'Average', 'Minimum', 'Maximum']);
    assert.equal(matrixRun.data.rows.length, 0, 'hidden detail rows are not returned by summary/matrix reports');
    assert.equal(matrixRun.data.truncated, false, 'hidden detail rows do not expose misleading detail pagination');
    assert.ok(matrixRun.data.summaryRows.every((row: { groupValues: Record<string, unknown>; sums: Record<string, number> }) =>
      'Industry' in row.groupValues && 'Type' in row.groupValues && typeof row.sums.AnnualRevenue === 'number'),
    'matrix summaries must group rows and columns and calculate numeric measures');
    assert.equal(matrixRun.data.summaryTotals.counts.Name, matrixRun.data.totalRows,
      'reports must count populated nonnumeric fields in the overall summary');
    assert.equal(matrixRun.data.summaryRows.reduce((total: number, row: { counts: Record<string, number> }) =>
      total + row.counts.Name, 0), matrixRun.data.totalRows,
    'matrix summaries must count populated nonnumeric fields across their groups');
    assert.equal((await api.send('/metadata/reports/Invalid_Summary_Operation', adminToken, 'PUT', {
      label: 'Invalid Summary Operation', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: ['Industry'], format: 'Summary',
      filters: [], summaryOperations: { Name: ['Sum'] }
    })).status, 422, 'summary operations are restricted to numeric report columns');
    assert.equal((await api.send('/metadata/reports/Invalid_Summary_Format', adminToken, 'PUT', {
      label: 'Invalid Summary Format', description: '', objectApiName: 'Account',
      fieldApiNames: ['AnnualRevenue'], groupByFieldApiNames: [], format: 'Tabular',
      filters: [], summaryOperations: { AnnualRevenue: ['Sum'] }
    })).status, 422, 'summary operations require a grouped summary or matrix report');
    assert.equal((await api.send('/metadata/reports/Invalid_Date_Grouping', adminToken, 'PUT', {
      label: 'Invalid Date Grouping', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: ['Industry'], format: 'Summary',
      filters: [], dateGroupings: { Industry: 'Month' }
    })).status, 422, 'date grouping is restricted to grouped Date or DateTime fields');
    const dateGroupExpectations = [
      ['Day', '2026-12-31'],
      ['Month', '2026-12'],
      ['Quarter', '2026-Q4'],
      ['Year', '2026']
    ] as const;
    for (const [dateGrouping, expectedGroup] of dateGroupExpectations) {
      const dateGroupedReport = await api.send('/metadata/reports/Opportunity_Date_Grouping_Smoke', adminToken, 'PUT', {
        label: 'Opportunity Date Grouping Smoke', description: '', objectApiName: 'Opportunity',
        fieldApiNames: ['Name', 'Amount'], groupByFieldApiNames: ['CloseDate'], format: 'Summary',
        filters: [{ id: 'date-group-name-scope', fieldApiName: 'Name', operator: 'Contains', value: 'Report ' }],
        dateGroupings: dateGrouping === 'Day' ? {} : { CloseDate: dateGrouping },
        summaryOperations: { Amount: ['Sum'] },
        showDetails: false
      });
      assert.equal(dateGroupedReport.status, 200, JSON.stringify(dateGroupedReport.data));
      assert.equal(dateGroupedReport.data.report.dateGroupings.CloseDate, dateGrouping,
        'date-grouping defaults are persisted explicitly');
      const dateGroupedRun = await api.send('/reports/Opportunity_Date_Grouping_Smoke/run', adminToken, 'POST', { offset: 0, limit: 5000 });
      assert.equal(dateGroupedRun.status, 200, JSON.stringify(dateGroupedRun.data));
      assert.equal(dateGroupedRun.data.totalRows, 3);
      assert.equal(dateGroupedRun.data.summaryRows.length, 1);
      assert.equal(dateGroupedRun.data.summaryRows[0].groupValues.CloseDate, expectedGroup,
        `${dateGrouping} grouping normalizes Opportunity CloseDate values`);
    }
    assert.equal((await api.send('/metadata/reports/Sharing_Smoke', adminToken, 'PUT', {
      label: 'Sharing Smoke', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], sortFieldApiName: 'Name',
      sortDirection: 'Ascending', filters: []
    })).status, 200);
    const dashboardFilters = [
      { id: 'name-is-smoke', objectApiName: 'Account', fieldApiName: 'Name', operator: 'Equals', value: 'Smoke Private Account' },
      { id: 'name-is-absent', objectApiName: 'Account', fieldApiName: 'Name', operator: 'Equals', value: 'No Matching Account' }
    ];
    const allFilterRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardFilters, dashboardFilterLogic: 'All', offset: 0, limit: 5000
    });
    assert.equal(allFilterRun.data.totalRows, 0, 'All dashboard filter logic requires every filter to match');
    const anyFilterRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardFilters, dashboardFilterLogic: 'Any', offset: 0, limit: 5000
    });
    assert.equal(anyFilterRun.data.totalRows, 1, 'Any dashboard filter logic accepts a record matching one filter');
    const startsWithFilterRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardFilters: [{ id: 'name-prefix', objectApiName: 'Account', fieldApiName: 'Name', operator: 'Starts With', value: 'Smoke Private' }],
      offset: 0,
      limit: 5000
    });
    assert.equal(startsWithFilterRun.data.totalRows, 1, 'Starts With filters must be applied server-side');
    const nullFilterRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardFilters: [{ id: 'website-is-null', objectApiName: 'Account', fieldApiName: 'Website', operator: 'Is Null', value: '' }],
      offset: 0,
      limit: 5000
    });
    assert.ok(nullFilterRun.data.totalRows >= 1, 'Is Null filters must match unset fields even without a value');
    const crossFilteredRun = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardFilters: dashboardFilters.slice(0, 1),
      dashboardFilterLogic: 'Any',
      dashboardCrossFilter: { id: 'cross-stage', objectApiName: 'Account', fieldApiName: 'Name', operator: 'Equals', value: 'No Matching Account' },
      offset: 0,
      limit: 5000
    });
    assert.equal(crossFilteredRun.data.totalRows, 0, 'cross-filters combine with configured dashboard filters using AND');
    const relatedCrossFilterRun = await api.send('/reports/Sharing_Smoke/run', adminToken, 'POST', {
      dashboardFilters: dashboardFilters.slice(0, 1),
      dashboardCrossFilter: {
        id: 'cross-related-contact',
        objectApiName: 'Contact',
        fieldApiName: 'Name',
        operator: 'Equals',
        value: 'Smoke Child Contact'
      },
      offset: 0,
      limit: 5000
    });
    assert.equal(relatedCrossFilterRun.data.totalRows, 1,
      `chart selections on a directly related child object must filter parent report rows: ${JSON.stringify(relatedCrossFilterRun.data)}`);
    const otherAccountContact = await api.send('/records/Contact', adminToken, 'POST', {
      Name: 'Other Account Contact', AccountId: unrelatedAccount.data.record.Id
    });
    assert.equal(otherAccountContact.status, 201, JSON.stringify(otherAccountContact.data));
    const contactNotes = await Promise.all([
      api.send('/records/Contact_Note__c', adminToken, 'POST', {
        Name: 'Positive multi-hop note', Contact__c: childRecord.data.record.Id, Sentiment__c: 'Positive'
      }),
      api.send('/records/Contact_Note__c', adminToken, 'POST', {
        Name: 'Neutral multi-hop note', Contact__c: childRecord.data.record.Id, Sentiment__c: 'Neutral'
      }),
      api.send('/records/Contact_Note__c', adminToken, 'POST', {
        Name: 'Other account note', Contact__c: otherAccountContact.data.record.Id, Sentiment__c: 'Positive'
      })
    ]);
    assert.ok(contactNotes.every((result) => result.status === 201), JSON.stringify(contactNotes.map((result) => result.data)));
    const multiHopMultiFilterRun = await api.send('/reports/Sharing_Smoke/run', adminToken, 'POST', {
      dashboardCrossFilters: [
        { id: 'positive-note', objectApiName: 'Contact_Note__c', fieldApiName: 'Sentiment__c', operator: 'Equals', value: 'Positive' },
        { id: 'neutral-note', objectApiName: 'Contact_Note__c', fieldApiName: 'Sentiment__c', operator: 'Equals', value: 'Neutral' },
        { id: 'specific-note', objectApiName: 'Contact_Note__c', fieldApiName: 'Name', operator: 'Equals', value: 'Positive multi-hop note' }
      ],
      offset: 0,
      limit: 5000
    });
    assert.equal(multiHopMultiFilterRun.data.totalRows, 1,
      'multiple selected values on a field use OR while separate cross-filter fields use AND across two relationship hops');
    assert.equal((await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      offset: 0,
      limit: 5000
    })).status, 200, 'the standard user can run the base report before relationship FLS is restricted');
    permissions = (await api.send('/metadata/permissions', adminToken)).data;
    const noRelationshipFieldRead = permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')!;
    noRelationshipFieldRead.fieldPermissions['Contact_Note__c.Contact__c'] = { read: false, edit: false };
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    const deniedMultiHopCrossFilter = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardCrossFilters: [
        { id: 'sensitive-cross-filter', objectApiName: 'Contact_Note__c', fieldApiName: 'Sentiment__c', operator: 'Equals', value: 'Positive' }
      ],
      offset: 0,
      limit: 5000
    });
    assert.equal(deniedMultiHopCrossFilter.status, 403,
      'multi-hop cross-filters must enforce FLS on each relationship field');
    noRelationshipFieldRead.fieldPermissions['Contact_Note__c.Contact__c'] = { read: true, edit: true };
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    const unmatchedRelatedCrossFilterRun = await api.send('/reports/Sharing_Smoke/run', adminToken, 'POST', {
      dashboardFilters: dashboardFilters.slice(0, 1),
      dashboardCrossFilter: {
        id: 'cross-related-contact-missing',
        objectApiName: 'Contact',
        fieldApiName: 'Name',
        operator: 'Equals',
        value: 'No Related Contact'
      },
      offset: 0,
      limit: 5000
    });
    assert.equal(unmatchedRelatedCrossFilterRun.data.totalRows, 0);
    for (const note of contactNotes) {
      assert.equal((await api.send(`/records/Contact_Note__c/${note.data.record.Id}`, adminToken, 'DELETE')).status, 204);
    }
    assert.equal((await api.send(`/records/Contact/${otherAccountContact.data.record.Id}`, adminToken, 'DELETE')).status, 204);
    permissions = (await api.send('/metadata/permissions', adminToken)).data;
    permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')
      .fieldPermissions['Account.AnnualRevenue'] = { read: true, edit: true };
    permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')
      .fieldPermissions['Account.Industry'] = { read: true, edit: true };
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    const snapshotNumericRecord = await api.send('/records/Account', ownerToken, 'POST', {
      Name: 'Snapshot Smoke Numeric', Industry: 'Technology', AnnualRevenue: 200
    });
    assert.equal(snapshotNumericRecord.status, 201, JSON.stringify(snapshotNumericRecord.data));
    const snapshotNullRecord = await api.send('/records/Account', ownerToken, 'POST', {
      Name: 'Snapshot Smoke Null', Industry: 'Technology'
    });
    assert.equal(snapshotNullRecord.status, 201, JSON.stringify(snapshotNullRecord.data));
    const snapshotReport = await api.send('/metadata/reports/Snapshot_Smoke_Report', adminToken, 'PUT', {
      label: 'Snapshot Smoke Report', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name', 'AnnualRevenue', 'Industry'], groupByFieldApiNames: ['Industry'],
      filters: [{ id: 'snapshot-name', fieldApiName: 'Name', operator: 'Contains', value: 'Snapshot Smoke' }],
      folderName: 'Public Reports'
    });
    assert.equal(snapshotReport.status, 200, JSON.stringify(snapshotReport.data));
    const snapshotReportRun = await api.send('/reports/Snapshot_Smoke_Report/run', ownerToken, 'POST', {
      offset: 0, limit: 5000
    });
    assert.equal(snapshotReportRun.status, 200, JSON.stringify(snapshotReportRun.data));
    assert.equal(snapshotReportRun.data.summaryTotals.sums.AnnualRevenue, 200);
    assert.equal(snapshotReportRun.data.summaryTotals.counts.AnnualRevenue, 1);
    assert.equal(snapshotReportRun.data.summaryTotals.minimums.AnnualRevenue, 200);
    assert.equal(snapshotReportRun.data.summaryTotals.maximums.AnnualRevenue, 200);
    const formulaRevenueField = {
      apiName: 'Formula_Revenue__c',
      label: 'Formula Revenue',
      dataType: 'Formula(Number)',
      required: false,
      unique: false,
      formula: { expression: 'AnnualRevenue * 2', returnType: 'Number' }
    };
    assert.equal((await api.send('/metadata/objects/Account/fields', adminToken, 'POST', formulaRevenueField)).status, 201,
      'numeric formula fields must be available for dashboard and report summaries');
    assert.equal((await api.send('/metadata/objects/Account/fields/Formula_Revenue__c', adminToken, 'PUT', {
      ...formulaRevenueField,
      formula: { expression: 'IF(ISBLANK(AnnualRevenue), 0, AnnualRevenue * 3)', returnType: 'Number' }
    })).status, 200, 'formula metadata can be changed without rewriting stored records');
    const formulaReport = await api.send('/metadata/reports/Formula_Summary_Smoke', adminToken, 'PUT', {
      label: 'Formula Summary Smoke',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name', 'Industry', 'Formula_Revenue__c'],
      groupByFieldApiNames: ['Industry'],
      format: 'Summary',
      filters: [{ id: 'formula-name', fieldApiName: 'Name', operator: 'Equals', value: 'Snapshot Smoke Numeric' }],
      summaryOperations: { Formula_Revenue__c: ['Sum'] }
    });
    assert.equal(formulaReport.status, 200, JSON.stringify(formulaReport.data));
    const formulaReportRun = await api.send('/reports/Formula_Summary_Smoke/run', adminToken, 'POST', {
      offset: 0,
      limit: 5000
    });
    assert.equal(formulaReportRun.status, 200, JSON.stringify(formulaReportRun.data));
    assert.equal(formulaReportRun.data.summaryTotals.sums.Formula_Revenue__c, 600,
      'report summaries must recalculate formula values using the current expression');
    const formulaDashboard = await api.send('/metadata/dashboards/Formula_Summary_Smoke', adminToken, 'PUT', {
      label: 'Formula Summary Smoke',
      description: '',
      folderName: 'Smoke Tests',
      visibility: 'Private',
      sharedUserIds: [],
      sharedPermissionSetGroupIds: [],
      filterLogic: 'All',
      status: 'Deployed',
      filters: [{
        id: 'formula-revenue-minimum',
        objectApiName: 'Account',
        fieldApiName: 'Formula_Revenue__c',
        operator: 'Greater Than',
        value: '500'
      }],
      components: [{
        id: 'formula-revenue-metric',
        title: 'Formula Revenue',
        type: 'Metric',
        reportApiName: 'Formula_Summary_Smoke',
        properties: {},
        objectApiName: 'Account',
        width: 'Half',
        aggregation: 'Sum',
        measureFieldApiName: 'Formula_Revenue__c',
        groupByFieldApiName: null,
        chartType: 'Bar',
        displayFieldApiNames: []
      }]
    });
    assert.equal(formulaDashboard.status, 200, JSON.stringify(formulaDashboard.data));
    const formulaDashboardReportRun = await api.send('/reports/Formula_Summary_Smoke/run', adminToken, 'POST', {
      dashboardApiName: 'Formula_Summary_Smoke',
      dashboardFilters: formulaDashboard.data.dashboard.filters,
      offset: 0,
      limit: 5000
    });
    assert.equal(formulaDashboardReportRun.status, 200, JSON.stringify(formulaDashboardReportRun.data));
    assert.equal(formulaDashboardReportRun.data.summaryTotals.sums.Formula_Revenue__c, 600,
      'dashboard report execution must accept only configured filter values and apply them to calculated fields');
    const forgedDashboardFilterRun = await api.send('/reports/Formula_Summary_Smoke/run', adminToken, 'POST', {
      dashboardApiName: 'Formula_Summary_Smoke',
      dashboardFilters: [{
        ...formulaDashboard.data.dashboard.filters[0],
        id: 'unconfigured-filter',
        value: '500'
      }],
      offset: 0,
      limit: 5000
    });
    assert.equal(forgedDashboardFilterRun.status, 400,
      'dashboard report runs must reject filter IDs or definitions that are not saved on the dashboard');
    const invalidDashboardFilterValueRun = await api.send('/reports/Formula_Summary_Smoke/run', adminToken, 'POST', {
      dashboardApiName: 'Formula_Summary_Smoke',
      dashboardFilters: [{ ...formulaDashboard.data.dashboard.filters[0], value: 'not-a-number' }],
      offset: 0,
      limit: 5000
    });
    assert.equal(invalidDashboardFilterValueRun.status, 400,
      'dashboard report runs must reject malformed numeric filter values');
    const invalidFormulaFilter = await api.send('/metadata/dashboards/Formula_Summary_Smoke', adminToken, 'PUT', {
      ...formulaDashboard.data.dashboard,
      filters: [{ ...formulaDashboard.data.dashboard.filters[0], operator: 'Contains' }]
    });
    assert.equal(invalidFormulaFilter.status, 422, 'dashboard filters must reject operators that do not match the formula field type');
    const formulaDashboardData = await api.send('/metadata/dashboards/Formula_Summary_Smoke/data/Account', adminToken);
    assert.equal(formulaDashboardData.status, 200, JSON.stringify(formulaDashboardData.data));
    assert.equal(formulaDashboardData.data.records.find((record: { Name: string }) =>
      record.Name === 'Snapshot Smoke Numeric')?.Formula_Revenue__c, 600,
    'live dashboard records must expose freshly calculated formula values');
    const formulaDashboardSnapshot = await api.send('/metadata/dashboards/Formula_Summary_Smoke/snapshots', adminToken, 'POST', {
      label: 'Formula Summary Snapshot'
    });
    assert.equal(formulaDashboardSnapshot.status, 201, JSON.stringify(formulaDashboardSnapshot.data));
    assert.equal(formulaDashboardSnapshot.data.snapshot.components[0].metricValue, 600,
      'dashboard snapshots must calculate formula measures with the current expression');
    const reportChartPage = await api.send('/metadata/pages/Report_Chart_Runtime', adminToken, 'PUT', {
      apiName: 'Report_Chart_Runtime',
      label: 'Report Chart Runtime',
      targetObject: 'Account',
      pageType: 'App Page',
      template: 'one-region',
      status: 'Draft',
      devices: ['Desktop', 'Phone'],
      components: [{
        id: 'snapshot-report-chart',
        type: 'Report Chart',
        label: 'Snapshot Revenue by Industry',
        properties: { reportApiName: 'Snapshot_Smoke_Report' },
        visible: true,
        region: 'main'
      }]
    });
    assert.equal(reportChartPage.status, 200, JSON.stringify(reportChartPage.data));
    assert.equal(reportChartPage.data.page.components[0].properties.reportApiName, 'Snapshot_Smoke_Report');
    const chartReportRun = await api.send('/reports/Snapshot_Smoke_Report/run', ownerToken, 'POST', { offset: 0, limit: 500 });
    assert.equal(chartReportRun.status, 200, 'Report Chart source reports must run through the authenticated report runtime');
    assert.equal(chartReportRun.data.rows.length, 2, 'Report Chart should receive report result rows including a null-revenue group');
    const snapshotDashboard = await api.send('/metadata/dashboards/Snapshot_Smoke', ownerToken, 'PUT', {
      label: 'Snapshot Smoke', description: '', folderName: 'Smoke Tests', visibility: 'Private',
      sharedUserIds: [], sharedPermissionSetGroupIds: [], filterLogic: 'All', status: 'Deployed', filters: [],
      components: [
        {
          id: 'snapshot-metric', title: 'Average Revenue', type: 'Metric', reportApiName: 'Snapshot_Smoke_Report',
          properties: {}, objectApiName: 'Account', width: 'Half', aggregation: 'Average',
          measureFieldApiName: 'AnnualRevenue', groupByFieldApiName: null, chartType: 'Bar', displayFieldApiNames: []
        },
        {
          id: 'snapshot-chart', title: 'Average by Industry', type: 'Chart', reportApiName: 'Snapshot_Smoke_Report',
          properties: {}, objectApiName: 'Account', width: 'Half', aggregation: 'Average',
          measureFieldApiName: 'AnnualRevenue', groupByFieldApiName: 'Industry', chartType: 'Bar', displayFieldApiNames: []
        },
        {
          id: 'snapshot-table', title: 'Snapshot Records', type: 'Table', reportApiName: 'Snapshot_Smoke_Report',
          properties: {}, objectApiName: 'Account', width: 'Full', aggregation: 'Count',
          measureFieldApiName: null, groupByFieldApiName: null, chartType: 'Bar', displayFieldApiNames: ['Name', 'AnnualRevenue']
        }
      ]
    });
    assert.equal(snapshotDashboard.status, 200, JSON.stringify(snapshotDashboard.data));
    const snapshotResponse = await api.send('/metadata/dashboards/Snapshot_Smoke/snapshots', ownerToken, 'POST', {
      label: 'Snapshot Smoke Capture'
    });
    assert.equal(snapshotResponse.status, 201, JSON.stringify(snapshotResponse.data));
    const capturedSnapshot = snapshotResponse.data.snapshot;
    assert.equal(capturedSnapshot.components.find((component: Record<string, any>) => component.componentId === 'snapshot-metric')?.metricValue, 200,
      'snapshot report averages must exclude null numeric values');
    const capturedChart = capturedSnapshot.components.find((component: Record<string, any>) => component.componentId === 'snapshot-chart');
    assert.equal(capturedChart?.buckets[0]?.value, 200, 'snapshot chart summaries must exclude null numeric values');
    assert.equal(capturedSnapshot.components.find((component: Record<string, any>) => component.componentId === 'snapshot-table')?.totalRows, 2,
      'snapshot tables must use the report source rows');
    assert.equal((await api.send('/metadata/dashboards/Snapshot_Smoke/snapshots', outsiderToken)).status, 404,
      'private dashboard snapshots must not be exposed to unrelated users');
    assert.equal((await api.send(`/metadata/dashboards/Snapshot_Smoke/snapshots/${capturedSnapshot.id}`, ownerToken, 'DELETE')).status, 204);
    assert.equal((await api.send('/metadata/dashboards/Snapshot_Smoke/snapshots', ownerToken)).data.snapshots.length, 0);
    const hiddenReport = await api.send('/reports/Sharing_Smoke/run', outsiderToken);
    assert.equal(hiddenReport.data.totalRows, 0, 'report counts must not include records hidden by sharing');
    assert.equal((await api.send(`/records/Account/${recordId}`, ownerToken, 'DELETE')).status, 422,
      'parent deletion must not clear a child lookup without child edit access');
    assert.equal((await api.send(`/records/Account/${recordId}`, ownerToken)).status, 200,
      'a rejected cascade must leave the parent record intact');

    permissions.sharingSettings.Account.defaultAccess = 'Public Read Only';
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send(`/records/Account/${recordId}`, managerToken)).status, 200, 'role ancestors should gain hierarchy access when enabled and permitted by OWD');
    assert.equal((await api.send(`/records/Account/${recordId}`, managerToken, 'PUT', { Name: 'Read Only Denied' })).status, 404, 'Public Read Only must not grant edit');
    permissions.sharingSettings.Account.grantAccessUsingHierarchies = false;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send(`/records/Account/${recordId}`, managerToken)).status, 200, 'Public Read Only access remains available when hierarchy grants are disabled');
    permissions.sharingSettings.Account.grantAccessUsingHierarchies = true;
    permissions.sharingSettings.Account.defaultAccess = 'Public Read/Write';
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send(`/records/Account/${recordId}`, managerToken, 'PUT', { Name: 'Hierarchy Edit' })).status, 200);
    permissions.sharingSettings.Account.defaultAccess = 'Private';
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);

    const readShare = await api.send(`/records/Account/${recordId}/shares`, ownerToken, 'POST', {
      userId: outsiderId, accessLevel: 'Read'
    });
    assert.equal(readShare.status, 201);
    const sharedRecords = (await api.send('/records/Account', outsiderToken)).data.records;
    assert.equal(sharedRecords.length, 1);
    assert.equal(Object.hasOwn(sharedRecords[0], 'Phone'), false, 'record shares must not bypass field-level read security');
    assert.equal((await api.send(`/records/Account/${recordId}`, outsiderToken, 'PUT', { Name: 'Read Share Edit' })).status, 404);
    const editShare = await api.send(`/records/Account/${recordId}/shares`, ownerToken, 'POST', {
      userId: outsiderId, accessLevel: 'Edit'
    });
    assert.equal(editShare.status, 201);
    assert.equal((await api.send(`/records/Account/${recordId}`, outsiderToken, 'PUT', { Name: 'Manual Share Edit' })).status, 200);
    assert.equal((await api.send(`/records/Account/${recordId}`, outsiderToken, 'PUT', { Phone: '555-0199' })).status, 422,
      'record edit shares must not bypass field-level edit security');
    assert.equal((await api.send(`/records/Account/${recordId}`, outsiderToken, 'DELETE')).status, 404, 'manual Edit shares do not grant delete');
    assert.equal((await api.send('/reports/Sharing_Smoke/run', outsiderToken)).data.totalRows, 1);
    assert.equal((await api.send(`/records/Account/${recordId}/shares/${outsiderId}`, ownerToken, 'DELETE')).status, 204);
    assert.equal((await api.send('/records/Account', outsiderToken)).data.records.length, 0, 'revoking a manual share removes access');
    assert.equal((await api.send(`/records/Account/${recordId}`, outsiderToken, 'DELETE')).status, 404);
    permissions = (await api.send('/metadata/permissions', adminToken)).data;
    const masterDetailObjectApiName = 'Master_Detail_Access__c';
    const masterDetailObject = await api.send('/metadata/objects', adminToken, 'POST', {
      apiName: masterDetailObjectApiName,
      label: 'Master Detail Access',
      pluralLabel: 'Master Detail Access Records',
      kind: 'Custom Object',
      description: 'Master-detail sharing inheritance smoke fixture.',
      fields: [
        { apiName: 'Name', label: 'Name', dataType: 'Text(80)', required: true, unique: false },
        {
          apiName: 'Account__c',
          label: 'Account',
          dataType: 'Master-Detail(Account)',
          required: true,
          unique: false,
          relationship: {
            type: 'Master-Detail',
            targetObject: 'Account',
            relationshipName: 'MasterDetailAccessAccount',
            childRelationshipName: 'MasterDetailAccessRecords'
          }
        }
      ],
      settings: {
        allowReports: true,
        allowActivities: false,
        trackFieldHistory: false,
        allowInChatter: false,
        deploymentStatus: 'Deployed',
        recordNameType: 'Text',
        recordNameFormat: ''
      }
    });
    assert.equal(masterDetailObject.status, 201, JSON.stringify(masterDetailObject.data));
    const standardUserProfile = permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user');
    standardUserProfile.objectPermissions[masterDetailObjectApiName] = objectPermissions;
    standardUserProfile.fieldPermissions[`${masterDetailObjectApiName}.Name`] = { read: true, edit: true };
    standardUserProfile.fieldPermissions[`${masterDetailObjectApiName}.Account__c`] = { read: true, edit: true };
    const systemAdministratorProfile = permissions.profiles.find((profile: { id: string }) => profile.id === 'system-administrator');
    systemAdministratorProfile.objectPermissions[masterDetailObjectApiName] = {
      read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true
    };
    systemAdministratorProfile.fieldPermissions[`${masterDetailObjectApiName}.Name`] = { read: true, edit: true };
    systemAdministratorProfile.fieldPermissions[`${masterDetailObjectApiName}.Account__c`] = { read: true, edit: true };
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200,
      'standard users must have object and field permissions for the master-detail access fixture');
    const masterDetailParent = await api.send('/records/Account', adminToken, 'POST', {
      Name: 'Master Detail Shared Parent'
    });
    assert.equal(masterDetailParent.status, 201, JSON.stringify(masterDetailParent.data));
    const masterDetailChild = await api.send(`/records/${masterDetailObjectApiName}`, adminToken, 'POST', {
      Name: 'Master Detail Child',
      Account__c: masterDetailParent.data.record.Id
    });
    assert.equal(masterDetailChild.status, 201, JSON.stringify(masterDetailChild.data));
    assert.equal((await api.send(`/records/Account/${masterDetailParent.data.record.Id}/shares`, adminToken, 'POST', {
      userId: outsiderId,
      accessLevel: 'Edit'
    })).status, 201);
    assert.equal((await api.send(`/records/${masterDetailObjectApiName}/${masterDetailChild.data.record.Id}`, outsiderToken)).status, 200,
      'master-detail child read access must inherit a shared parent record');
    assert.equal((await api.send(`/records/${masterDetailObjectApiName}/${masterDetailChild.data.record.Id}`, outsiderToken, 'PUT', {
      Name: 'Edited Through Master Detail Parent'
    })).status, 200, 'master-detail child edit access must inherit parent edit access');
    assert.equal((await api.send(`/records/${masterDetailObjectApiName}/${masterDetailChild.data.record.Id}`, outsiderToken, 'DELETE')).status, 404,
      'master-detail parent edit access must not imply child delete access');
    assert.equal((await api.send(`/records/Account/${masterDetailParent.data.record.Id}`, adminToken, 'DELETE')).status, 204,
      'deleting a master record must cascade to its detail records');
    assert.equal((await api.send(`/records/${masterDetailObjectApiName}/${masterDetailChild.data.record.Id}`, adminToken)).status, 404,
      'cascaded master-detail children must no longer be readable');
    permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')
      .fieldPermissions['Contact.AccountId'] = { read: true, edit: true };
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send(`/records/Contact/${childRecord.data.record.Id}/shares`, adminToken, 'POST', {
      userId: ownerId, accessLevel: 'Edit'
    })).status, 201);
    const ownerDelete = await api.send(`/records/Account/${unrelatedAccount.data.record.Id}`, ownerToken, 'DELETE');
    assert.equal(ownerDelete.status, 204,
      `record owners with object delete access retain delete access: ${JSON.stringify(ownerDelete.data)}`);

    permissions = (await api.send('/metadata/permissions', adminToken)).data;
    const duplicateEmail = structuredClone(permissions);
    duplicateEmail.users[1].username = duplicateEmail.users[0].username.toUpperCase();
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', duplicateEmail)).status, 400, 'duplicate emails must be rejected case-insensitively');
    const invalidRole = await api.send(`/metadata/roles/${managerRoleId}`, adminToken, 'PUT', {
      name: 'Smoke Manager', apiName: 'Smoke_Manager', parentRoleId: 'unknown-role'
    });
    assert.equal(invalidRole.status, 400, 'unknown role parents must be rejected');

    const faultFlow = await api.send('/metadata/flows/Fault_Path_Smoke', adminToken, 'PUT', {
      apiName: 'Fault_Path_Smoke', label: 'Fault Path Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Divide by zero', config: { variable: 'counter', operator: 'Divide', value: 0 } },
        { id: 3, type: 'Assignment', label: 'Capture fault message', config: { variable: 'faultMessage', operator: 'Assign', value: '{!$Flow.FaultMessage}' } },
        { id: 4, type: 'Assignment', label: 'Capture fault code', config: { variable: 'faultCode', operator: 'Assign', value: '{!$Flow.FaultCode}' } },
        { id: 5, type: 'End', label: 'End', config: {} }
      ],
      connectors: [
        { id: 'start-to-error', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'error-to-handler', from: 2, to: 3, label: 'Fault', kind: 'fault' },
        { id: 'message-to-code', from: 3, to: 4, label: '', kind: 'normal' },
        { id: 'code-to-end', from: 4, to: 5, label: '', kind: 'normal' }
      ],
      resources: [
        { name: 'counter', label: 'Counter', type: 'Variable', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: false, value: 1 },
        { name: 'faultMessage', label: 'Fault Message', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true },
        { name: 'faultCode', label: 'Fault Code', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true },
        { name: 'faultFormulaMessage', label: 'Fault Formula Message', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '$Flow.FaultMessage' }
      ],
      versions: []
    });
    assert.equal(faultFlow.status, 200, JSON.stringify(faultFlow.data));
    const execution = await api.send('/flows/Fault_Path_Smoke/execute', adminToken, 'POST', {});
    assert.equal(execution.status, 200, JSON.stringify(execution.data));
    assert.match(String(execution.data.outputs.faultMessage), /cannot divide by zero/i);
    assert.equal(execution.data.outputs.faultCode, 'FLOW_ELEMENT_ERROR');
    assert.match(String(execution.data.outputs.faultFormulaMessage), /cannot divide by zero/i,
      'formula resources on a fault path must resolve $Flow.FaultMessage');

    const unsupportedPathValidation = await api.send('/metadata/flows/Fault_Path_Smoke/validate', adminToken, 'POST', {
      ...faultFlow.data.flow,
      connectors: faultFlow.data.flow.connectors.map((connector: Record<string, unknown>) =>
        connector.id === 'error-to-handler' ? { ...connector, kind: 'scheduled' } : connector)
    });
    assert.equal(unsupportedPathValidation.status, 200, JSON.stringify(unsupportedPathValidation.data));
    assert.equal(unsupportedPathValidation.data.valid, false, 'unsupported scheduled connector types must not pass flow validation');

    const screenFlow = await api.send('/metadata/flows/Screen_Outcome_Smoke', adminToken, 'PUT', {
      apiName: 'Screen_Outcome_Smoke', label: 'Screen Outcome Smoke', flowType: 'Screen Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Screen', label: 'Decision Screen', config: {
          fields: [{ label: 'Decision', apiName: 'decision', type: 'Picklist', required: true, choices: ['Yes', 'No'] }],
          outcomes: [{ name: 'Approved', label: 'Approve' }, { name: 'Declined', label: 'Decline' }]
        } },
        { id: 3, type: 'Assignment', label: 'Set approved result', config: { variable: 'result', operator: 'Assign', value: 'approved' } },
        { id: 4, type: 'Assignment', label: 'Set declined result', config: { variable: 'result', operator: 'Assign', value: 'declined' } },
        { id: 5, type: 'End', label: 'Approved end', config: {} },
        { id: 6, type: 'End', label: 'Declined end', config: {} }
      ],
      connectors: [
        { id: 'start-to-screen', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'screen-approve', from: 2, to: 3, label: 'Approve', kind: 'normal' },
        { id: 'screen-decline', from: 2, to: 4, label: 'Decline', kind: 'normal' },
        { id: 'approved-end', from: 3, to: 5, label: '', kind: 'normal' },
        { id: 'declined-end', from: 4, to: 6, label: '', kind: 'normal' }
      ],
      resources: [{ name: 'result', label: 'Result', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true }],
      versions: []
    });
    assert.equal(screenFlow.status, 200, JSON.stringify(screenFlow.data));
    const screenRun = await api.send('/flows/Screen_Outcome_Smoke/execute', adminToken, 'POST', {});
    assert.equal(screenRun.status, 202, JSON.stringify(screenRun.data));
    assert.deepEqual(screenRun.data.outcomes.map((outcome: { label: string }) => outcome.label), ['Approve', 'Decline']);
    assert.equal((await api.send(`/flow-interviews/${screenRun.data.interviewId}/next`, adminToken, 'POST', {
      values: { decision: 'Maybe' }, outcome: 'Approve'
    })).status, 400, 'picklist input must be restricted to its configured choice values');
    const approveRun = await api.send(`/flow-interviews/${screenRun.data.interviewId}/next`, adminToken, 'POST', {
      values: { decision: 'Yes' }, outcome: 'Approve'
    });
    assert.equal(approveRun.status, 200, JSON.stringify(approveRun.data));
    assert.equal(approveRun.data.outputs.result, 'approved', 'screen outcome must route through its matching connector');

    const declineScreen = await api.send('/flows/Screen_Outcome_Smoke/execute', adminToken, 'POST', {});
    const declineRun = await api.send(`/flow-interviews/${declineScreen.data.interviewId}/next`, adminToken, 'POST', {
      values: { decision: 'No' }, outcome: 'Decline'
    });
    assert.equal(declineRun.status, 200, JSON.stringify(declineRun.data));
    assert.equal(declineRun.data.outputs.result, 'declined', 'each screen outcome must route independently');

    const formulaFlow = await api.send('/metadata/flows/Formula_Resource_Smoke', adminToken, 'PUT', {
      apiName: 'Formula_Resource_Smoke', label: 'Formula Resource Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
      connectors: [],
      resources: [
        { name: 'Total', label: 'Total', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: '1 + 2 * 3' },
        { name: 'Doubled', label: 'Doubled', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'Total * 2' },
        { name: 'Enabled', label: 'Enabled', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TRUE' },
        { name: 'EffectiveDate', label: 'Effective Date', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: "'2026-04-12'" },
        { name: 'NormalizedText', label: 'Normalized Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "LOWER(TRIM('  FLOW  '))" },
        { name: 'ShortText', label: 'Short Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "LEFT('MetaDrive', 4)" },
        { name: 'MiddleText', label: 'Middle Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "MID('MetaDrive', 5, 5)" },
        { name: 'FoundTextPosition', label: 'Found Text Position', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "FIND('Drive', 'MetaDrive')" },
        { name: 'ConvertedNumber', label: 'Converted Number', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "VALUE('12.5')" },
        { name: 'MaximumValue', label: 'Maximum Value', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'MAX(4, 2, 8)' },
        { name: 'Summary', label: 'Summary', type: 'Text Template', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: 'Total is {!Total}' }
      ],
      versions: []
    });
    assert.equal(formulaFlow.status, 200, JSON.stringify(formulaFlow.data));
    const formulaRun = await api.send('/flows/Formula_Resource_Smoke/execute', adminToken, 'POST', {});
    assert.equal(formulaRun.status, 200, JSON.stringify(formulaRun.data));
    assert.equal(formulaRun.data.outputs.Total, 7);
    assert.equal(formulaRun.data.outputs.Doubled, 14, 'formula resources can reference other formula resources');
    assert.equal(formulaRun.data.outputs.Enabled, true, 'boolean formula results preserve their declared type');
    assert.equal(formulaRun.data.outputs.EffectiveDate, '2026-04-12', 'date formula results serialize as date-only values');
    assert.equal(formulaRun.data.outputs.NormalizedText, 'flow');
    assert.equal(formulaRun.data.outputs.ShortText, 'Meta');
    assert.equal(formulaRun.data.outputs.MiddleText, 'Drive');
    assert.equal(formulaRun.data.outputs.FoundTextPosition, 5);
    assert.equal(formulaRun.data.outputs.ConvertedNumber, 12.5);
    assert.equal(formulaRun.data.outputs.MaximumValue, 8);
    assert.equal(formulaRun.data.outputs.Summary, 'Total is 7', 'text templates interpolate flow resource values');

    const sendEmailFlowBody = {
      apiName: 'Send_Email_Smoke', label: 'Send Email Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Send notification', config: {
          actionType: 'Send Email', namedCredentialId: 'smtp-credential',
          fromEmail: 'flows@example.net', recipients: 'admin@example.net',
          subject: 'Flow notification', body: 'A flow ran.'
        } }
      ],
      connectors: [{ id: 'start-send', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    };
    const noCredentialFlow = await api.send('/metadata/flows/Send_Email_Smoke', adminToken, 'PUT', sendEmailFlowBody);
    assert.equal(noCredentialFlow.status, 422, 'Send Email cannot activate without an SMTP credential');
    assert.match(String(noCredentialFlow.data.details), /SMTP Named Credential/);
    const smtpCredential = await api.send('/named-credentials', adminToken, 'POST', {
      name: 'Flow_SMTP', label: 'Flow SMTP', protocol: 'SMTP',
      baseUrl: 'smtp://smtp.gmail.com:587', authType: 'Basic',
      username: 'mailer@example.net', secret: 'test-smtp-password'
    });
    assert.equal(smtpCredential.status, 201, JSON.stringify(smtpCredential.data));
    assert.equal(smtpCredential.data.credential.protocol, 'SMTP');
    assert.equal(smtpCredential.data.credential.hasSecret, true);
    assert.equal(JSON.stringify(smtpCredential.data).includes('test-smtp-password'), false, 'SMTP secrets are never returned to the browser');
    const dashboardSmtpCredential = await api.send('/named-credentials', adminToken, 'POST', {
      name: 'Dashboard_SMTP', label: 'Dashboard SMTP', protocol: 'SMTP',
      baseUrl: `smtp://127.0.0.1:${smtpRelay.port}`, authType: 'None'
    });
    assert.equal(dashboardSmtpCredential.status, 201, JSON.stringify(dashboardSmtpCredential.data));
    sendEmailFlowBody.elements[1].config.namedCredentialId = smtpCredential.data.credential.id;
    const emailFlow = await api.send('/metadata/flows/Send_Email_Smoke', adminToken, 'PUT', sendEmailFlowBody);
    assert.equal(emailFlow.status, 200, JSON.stringify(emailFlow.data));
    const unauthorizedEmail = await api.send('/flows/Send_Email_Smoke/execute', ownerToken, 'POST', {});
    assert.equal(unauthorizedEmail.status, 422);
    assert.match(String(unauthorizedEmail.data.error), /does not have permission to send email/);
    const subscriptionPermissions = (await api.send('/metadata/permissions', adminToken)).data;
    const schedulingProfile = subscriptionPermissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')!;
    schedulingProfile.systemPermissions = [...new Set([...schedulingProfile.systemPermissions, 'email:send'])];
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', subscriptionPermissions)).status, 200);
    const flowEmailDelivery = structuredClone(sendEmailFlowBody);
    flowEmailDelivery.apiName = 'Send_Email_Delivery_Smoke';
    flowEmailDelivery.label = 'Send Email Delivery Smoke';
    flowEmailDelivery.elements[1].config.namedCredentialId = dashboardSmtpCredential.data.credential.id;
    flowEmailDelivery.elements[1].config.recipients = 'owner@rbac-sharing-smoke.test';
    const savedFlowEmailDelivery = await api.send('/metadata/flows/Send_Email_Delivery_Smoke', adminToken, 'PUT', flowEmailDelivery);
    assert.equal(savedFlowEmailDelivery.status, 200, JSON.stringify(savedFlowEmailDelivery.data));
    let deliveredFlowEmail: Awaited<ReturnType<typeof api.send>>;
    try {
      deliveredFlowEmail = await api.send('/flows/Send_Email_Delivery_Smoke/execute', ownerToken, 'POST', {});
    } catch (error) {
      throw new Error(`Send Email API request failed: ${error instanceof Error ? error.message : String(error)}\n${apiLogs}`);
    }
    assert.equal(deliveredFlowEmail.status, 200, JSON.stringify(deliveredFlowEmail.data));
    assert.equal(smtpRelay.messages.length, 1, 'authorized Send Email actions must deliver through the selected SMTP credential');
    assert.match(smtpRelay.messages[0], /To: owner@rbac-sharing-smoke\.test/i);
    assert.match(smtpRelay.messages[0], /Subject: Flow notification/i);
    assert.match(smtpRelay.messages[0], /A flow ran\./);
    const emailAlert = await api.send('/metadata/email-alerts', adminToken, 'POST', {
      name: 'Flow_Record_Alert',
      label: 'Flow Record Alert',
      objectApiName: 'Account',
      namedCredentialId: dashboardSmtpCredential.data.credential.id,
      fromEmail: 'flows@example.net',
      recipients: 'admin@rbac-sharing-smoke.test',
      subject: 'Email alert notification',
      body: 'An email alert ran for {!$Record.Name}.'
    });
    assert.equal(emailAlert.status, 201, JSON.stringify(emailAlert.data));
    const emailAlertFlow = structuredClone(flowEmailDelivery);
    emailAlertFlow.apiName = 'Email_Alert_Delivery_Smoke';
    emailAlertFlow.label = 'Email Alert Delivery Smoke';
    emailAlertFlow.flowType = 'Record-Triggered Flow';
    emailAlertFlow.triggerObject = 'Account';
    emailAlertFlow.startConfig = { trigger: 'created', runWhen: 'after-save', entryConditions: [] };
    emailAlertFlow.elements[1].config = {
      actionType: 'Email Alert',
      emailAlertId: emailAlert.data.emailAlert.id
    };
    const savedEmailAlertFlow = await api.send('/metadata/flows/Email_Alert_Delivery_Smoke', adminToken, 'PUT', emailAlertFlow);
    assert.equal(savedEmailAlertFlow.status, 200, JSON.stringify(savedEmailAlertFlow.data));
    const emailAlertRecord = await api.send('/records/Account', adminToken, 'POST', { Name: 'Email Alert Trigger Record' });
    assert.equal(emailAlertRecord.status, 201, JSON.stringify(emailAlertRecord.data));
    assert.equal(smtpRelay.messages.length, 2, 'Email Alert Flow actions deliver through the configured SMTP credential');
    assert.match(smtpRelay.messages[1], /Subject: Email alert notification/i);
    assert.match(smtpRelay.messages[1], /An email alert ran for Email Alert Trigger Record\./);
    assert.equal((await api.send(`/metadata/email-alerts/${emailAlert.data.emailAlert.id}`, adminToken, 'DELETE')).status, 409,
      'a saved Email Alert cannot be deleted while an active flow references it');
    assert.equal((await api.send('/metadata/flows/Email_Alert_Delivery_Smoke', adminToken, 'PUT', {
      ...savedEmailAlertFlow.data.flow,
      status: 'Draft'
    })).status, 200, 'the Email Alert smoke flow must be deactivated so later record tests remain isolated');
    const invalidRecipientFlow = {
      apiName: 'Send_Email_Fault_Smoke', label: 'Send Email Fault Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Send to supplied recipient', config: {
          actionType: 'Send Email', namedCredentialId: dashboardSmtpCredential.data.credential.id,
          fromEmail: 'flows@example.net', recipients: '{Recipient}',
          subject: 'Flow notification', body: 'A flow ran.'
        } },
        { id: 3, type: 'Assignment', label: 'Capture Email Fault', config: {
          variable: 'Result', operator: 'Assign', value: '{!$Flow.FaultMessage}'
        } }
      ],
      connectors: [
        { id: 'start-send', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'send-fault', from: 2, to: 3, label: '', kind: 'fault' }
      ],
      resources: [
        { name: 'Recipient', label: 'Recipient', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false, value: '' },
        { name: 'Result', label: 'Result', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '' }
      ],
      versions: []
    };
    const savedInvalidRecipientFlow = await api.send('/metadata/flows/Send_Email_Fault_Smoke', adminToken, 'PUT', invalidRecipientFlow);
    assert.equal(savedInvalidRecipientFlow.status, 200, JSON.stringify(savedInvalidRecipientFlow.data));
    const faultedEmail = await api.send('/flows/Send_Email_Fault_Smoke/execute', ownerToken, 'POST', { Recipient: 'not-an-email' });
    assert.equal(faultedEmail.status, 200, JSON.stringify(faultedEmail.data));
    assert.match(faultedEmail.data.outputs.Result, /valid recipient email addresses/,
      'Send Email validation errors must reach the configured fault connector');
    assert.equal(smtpRelay.messages.length, 2, 'invalid dynamic recipients must not be sent');

    const calloutCredential = await api.send('/named-credentials', adminToken, 'POST', {
      name: 'Flow_HTTP_Test', label: 'Flow HTTP Test', protocol: 'HTTPS',
      baseUrl: 'https://api.github.com/', authType: 'None'
    });
    assert.equal(calloutCredential.status, 201, JSON.stringify(calloutCredential.data));
    const httpCalloutFlow = {
      apiName: 'HTTP_Callout_Smoke', label: 'HTTP Callout Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'HTTP Callout', label: 'Resolve Missing Callout Value', config: {
          namedCredentialId: calloutCredential.data.credential.id, method: 'GET',
          path: 'v1/{MissingCalloutValue}', onError: 'FAULT_PATH'
        } },
        { id: 3, type: 'Assignment', label: 'Capture Callout Fault', config: {
          variable: 'Result', operator: 'Assign', value: '{!$Flow.FaultMessage}'
        } }
      ],
      connectors: [
        { id: 'start-callout', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'callout-fault', from: 2, to: 3, label: '', kind: 'fault' }
      ],
      resources: [{
        name: 'Result', label: 'Result', type: 'Variable', dataType: 'Text', isCollection: false,
        availableForInput: false, availableForOutput: true, value: ''
      }],
      versions: []
    };
    const savedHttpCalloutFlow = await api.send('/metadata/flows/HTTP_Callout_Smoke', adminToken, 'PUT', httpCalloutFlow);
    assert.equal(savedHttpCalloutFlow.status, 200, JSON.stringify(savedHttpCalloutFlow.data));
    const deniedCallout = await api.send('/flows/HTTP_Callout_Smoke/execute', ownerToken, 'POST', {});
    assert.equal(deniedCallout.status, 200, JSON.stringify(deniedCallout.data));
    assert.match(deniedCallout.data.outputs.Result, /does not have permission to execute HTTP callouts/,
      'callout authorization must be enforced before performing network access and exposed to the fault path');
    const failedCallout = await api.send('/flows/HTTP_Callout_Smoke/execute', adminToken, 'POST', {});
    assert.equal(failedCallout.status, 200, JSON.stringify(failedCallout.data));
    assert.match(failedCallout.data.outputs.Result, /unavailable flow value "MissingCalloutValue"/,
      'HTTP Callout errors must route through the configured fault connector');

    const outboundMessageFlow = {
      apiName: 'Outbound_Message_Smoke', label: 'Outbound Message Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1,
      activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Send outbound message', config: {
          actionType: 'Outbound Message', namedCredentialId: calloutCredential.data.credential.id,
          path: 'v1/messages', messageBody: '{"value":"{MissingOutboundValue}"}'
        } },
        { id: 3, type: 'Assignment', label: 'Capture Outbound Fault', config: {
          variable: 'Result', operator: 'Assign', value: '{!$Flow.FaultMessage}'
        } }
      ],
      connectors: [
        { id: 'start-outbound', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'outbound-fault', from: 2, to: 3, label: '', kind: 'fault' }
      ],
      resources: [{
        name: 'Result', label: 'Result', type: 'Variable', dataType: 'Text', isCollection: false,
        availableForInput: false, availableForOutput: true, value: ''
      }],
      versions: []
    };
    const savedOutboundMessageFlow = await api.send('/metadata/flows/Outbound_Message_Smoke', adminToken, 'PUT', outboundMessageFlow);
    assert.equal(savedOutboundMessageFlow.status, 200, JSON.stringify(savedOutboundMessageFlow.data));
    const deniedOutboundMessage = await api.send('/flows/Outbound_Message_Smoke/execute', ownerToken, 'POST', {});
    assert.equal(deniedOutboundMessage.status, 200, JSON.stringify(deniedOutboundMessage.data));
    assert.match(deniedOutboundMessage.data.outputs.Result, /does not have permission to send outbound messages/,
      'outbound messages must enforce callout permission before any network request');
    const failedOutboundMessage = await api.send('/flows/Outbound_Message_Smoke/execute', adminToken, 'POST', {});
    assert.equal(failedOutboundMessage.status, 200, JSON.stringify(failedOutboundMessage.data));
    assert.match(failedOutboundMessage.data.outputs.Result, /unavailable value "MissingOutboundValue"/,
      'outbound message template errors must use the configured Flow fault path');

    const notificationPermissionFlow = {
      apiName: 'Custom_Notification_RBAC_Smoke', label: 'Custom Notification RBAC Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1,
      activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Send notification', config: {
          actionType: 'Custom Notification', recipientIds: '{!$User.Id}',
          title: 'RBAC test', messageBody: 'Permission check'
        } }
      ],
      connectors: [{ id: 'start-notification', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    };
    const savedNotificationPermissionFlow = await api.send('/metadata/flows/Custom_Notification_RBAC_Smoke', adminToken, 'PUT', notificationPermissionFlow);
    assert.equal(savedNotificationPermissionFlow.status, 200, JSON.stringify(savedNotificationPermissionFlow.data));
    const deniedCustomNotification = await api.send('/flows/Custom_Notification_RBAC_Smoke/execute', ownerToken, 'POST', {});
    assert.equal(deniedCustomNotification.status, 422, JSON.stringify(deniedCustomNotification.data));
    assert.match(deniedCustomNotification.data.error, /does not have permission to send custom notifications/,
      'custom notification actions must enforce notifications:send for the running user');

    const continuedCalloutFlow = structuredClone(httpCalloutFlow);
    continuedCalloutFlow.apiName = 'HTTP_Callout_Continue_Smoke';
    continuedCalloutFlow.label = 'HTTP Callout Continue Smoke';
    continuedCalloutFlow.elements = httpCalloutFlow.elements.slice(0, 2).map((element) =>
      element.id === 2 ? { ...element, label: 'Continue After Callout Error', config: {
        ...element.config, onError: 'CONTINUE', responseVariable: 'CalloutResponse',
        statusVariable: 'CalloutStatus', responseMapping: '{"failure":"error"}'
      } } : element);
    continuedCalloutFlow.connectors = [{ id: 'start-callout', from: 1, to: 2, label: '', kind: 'normal' }];
    continuedCalloutFlow.resources = [
      { name: 'CalloutResponse', label: 'Callout Response', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '' },
      { name: 'CalloutStatus', label: 'Callout Status', type: 'Variable', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 0 }
    ];
    const savedContinuedCallout = await api.send('/metadata/flows/HTTP_Callout_Continue_Smoke', adminToken, 'PUT', continuedCalloutFlow);
    assert.equal(savedContinuedCallout.status, 200, JSON.stringify(savedContinuedCallout.data));
    const continuedCallout = await api.send('/flows/HTTP_Callout_Continue_Smoke/execute', adminToken, 'POST', {});
    assert.equal(continuedCallout.status, 200, JSON.stringify(continuedCallout.data));
    assert.equal(continuedCallout.data.outputs.CalloutStatus, 0);
    assert.match(continuedCallout.data.outputs.CalloutResponse.failure, /MissingCalloutValue/);
    const failedCalloutFlow = structuredClone(httpCalloutFlow);
    failedCalloutFlow.apiName = 'HTTP_Callout_Fail_Smoke';
    failedCalloutFlow.label = 'HTTP Callout Fail Smoke';
    failedCalloutFlow.elements[1].config.onError = 'FAIL';
    const savedFailedCallout = await api.send('/metadata/flows/HTTP_Callout_Fail_Smoke', adminToken, 'PUT', failedCalloutFlow);
    assert.equal(savedFailedCallout.status, 200, JSON.stringify(savedFailedCallout.data));
    const failedCalloutResult = await api.send('/flows/HTTP_Callout_Fail_Smoke/execute', adminToken, 'POST', {});
    assert.equal(failedCalloutResult.status, 422);
    assert.match(failedCalloutResult.data.error, /unavailable flow value "MissingCalloutValue"/,
      'HTTP Callout FAIL behavior must stop execution rather than continue or take a fault path');

    const publishedSubscriptionDashboard = await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Deployed', sharedUserIds: [outsiderId], components: [stackedChart]
    });
    assert.equal(publishedSubscriptionDashboard.status, 200, JSON.stringify(publishedSubscriptionDashboard.data));
    const subscriptionInput = {
      label: 'Weekly owner digest',
      frequency: 'Weekly',
      dayOfWeek: 1,
      localTime: '09:00',
      timeZone: 'Europe/London',
      recipientUserIds: [ownerId, outsiderId],
      namedCredentialId: dashboardSmtpCredential.data.credential.id,
      fromEmail: 'dashboards@example.net',
      active: true
    };
    const createdSubscription = await api.send('/metadata/dashboards/Owner_Dashboard/subscriptions', ownerToken, 'POST', subscriptionInput);
    assert.equal(createdSubscription.status, 201, JSON.stringify(createdSubscription.data));
    assert.ok(Date.parse(createdSubscription.data.subscription.nextRunAt) > Date.now());
    const scheduledLocalParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(createdSubscription.data.subscription.nextRunAt));
    assert.equal(scheduledLocalParts.find((part) => part.type === 'weekday')?.value, 'Monday');
    assert.equal(
      `${scheduledLocalParts.find((part) => part.type === 'hour')?.value}:${scheduledLocalParts.find((part) => part.type === 'minute')?.value}`,
      '09:00',
      'weekly runs must resolve the selected day and local time in the configured IANA time zone'
    );
    assert.deepEqual(createdSubscription.data.subscription.recipientUserIds, [ownerId, outsiderId]);
    assert.equal(createdSubscription.data.subscription.saveSnapshots, true, 'scheduled recipient snapshots are enabled by default');
    const deliveredSubscription = await api.send(
      `/metadata/dashboards/Owner_Dashboard/subscriptions/${createdSubscription.data.subscription.id}/run`,
      ownerToken, 'POST', {}
    );
    assert.equal(deliveredSubscription.status, 200, JSON.stringify(deliveredSubscription.data));
    assert.equal(smtpRelay.messages.length, 4, 'the SMTP relay receives both Flow actions and one message per dashboard recipient');
    assert.ok(smtpRelay.messages.slice(2).every((message) =>
      /Content-Type: text\/plain/i.test(message) && /Content-Type: text\/html/i.test(message)
      && /scheduled dashboard/i.test(message) && /Open dashboard/i.test(message)
      && /font-family:Arial/i.test(message)),
    'scheduled delivery must include both readable text and rendered HTML dashboard content');
    assert.match(smtpRelay.messages[2], /To: owner@rbac-sharing-smoke\.test/i);
    assert.match(smtpRelay.messages[3], /To: outsider@rbac-sharing-smoke\.test/i);
    const ownerRunSnapshots = (await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken)).data.snapshots;
    const outsiderRunSnapshots = (await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', outsiderToken)).data.snapshots;
    const ownerScheduledSnapshot = ownerRunSnapshots.find((snapshot: { subscriptionId?: string }) =>
      snapshot.subscriptionId === createdSubscription.data.subscription.id);
    const outsiderScheduledSnapshot = outsiderRunSnapshots.find((snapshot: { subscriptionId?: string }) =>
      snapshot.subscriptionId === createdSubscription.data.subscription.id);
    assert.equal(ownerScheduledSnapshot?.createdBy, ownerId);
    assert.equal(outsiderScheduledSnapshot?.createdBy, outsiderId);
    assert.equal(ownerRunSnapshots.some((snapshot: { createdBy: string }) => snapshot.createdBy === outsiderId), false,
      'subscription owners cannot read another recipient private snapshots');
    assert.equal(outsiderRunSnapshots.some((snapshot: { createdBy: string }) => snapshot.createdBy === ownerId), false,
      'recipients cannot read another recipient private snapshots');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/subscriptions', ownerToken, 'POST', {
      ...subscriptionInput, timeZone: 'Invalid/Time_Zone'
    })).status, 400, 'subscription schedules must reject invalid IANA time zones');
    assert.equal((await api.send(`/named-credentials/${dashboardSmtpCredential.data.credential.id}`, adminToken, 'DELETE')).status, 409,
      'SMTP credentials referenced by subscriptions cannot be deleted');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/subscriptions', ownerToken)).data.subscriptions.length, 1);
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/subscriptions', outsiderToken)).data.subscriptions.length, 0,
      'subscription definitions are private to their creator');
    assert.equal((await api.send(`/metadata/dashboards/Owner_Dashboard/subscriptions/${createdSubscription.data.subscription.id}`,
      outsiderToken, 'DELETE')).status, 403);
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard, status: 'Draft', components: [stackedChart], sharedUserIds: [outsiderId]
    })).status, 409, 'deployed dashboards cannot be unpublished while subscriptions are active');
    const pausedSubscription = await api.send(
      `/metadata/dashboards/Owner_Dashboard/subscriptions/${createdSubscription.data.subscription.id}`,
      ownerToken, 'PUT', { ...subscriptionInput, active: false }
    );
    assert.equal(pausedSubscription.status, 200, JSON.stringify(pausedSubscription.data));
    assert.equal(pausedSubscription.data.subscription.active, false);
    assert.equal((await api.send(
      `/metadata/dashboards/Owner_Dashboard/subscriptions/${createdSubscription.data.subscription.id}`,
      ownerToken, 'DELETE'
    )).status, 204);
    assert.equal((await api.send(`/named-credentials/${smtpCredential.data.credential.id}`, adminToken, 'DELETE')).status, 409,
      'SMTP credentials referenced by an active flow cannot be removed');
    assert.equal((await api.send(`/named-credentials/${dashboardSmtpCredential.data.credential.id}`, adminToken, 'DELETE')).status, 409,
      'SMTP credentials referenced by an active Flow action cannot be removed');
    const adminUserId = (await api.send('/auth/me', adminToken)).data.user.id as string;
    const contentWidgetSubscription = await api.send(
      '/metadata/dashboards/Content_Widgets_Smoke/subscriptions',
      adminToken,
      'POST',
      {
        ...subscriptionInput,
        label: 'Content widgets delivery',
        recipientUserIds: [adminUserId],
        saveSnapshots: true
      }
    );
    assert.equal(contentWidgetSubscription.status, 201, JSON.stringify(contentWidgetSubscription.data));
    const contentWidgetDelivery = await api.send(
      `/metadata/dashboards/Content_Widgets_Smoke/subscriptions/${contentWidgetSubscription.data.subscription.id}/run`,
      adminToken, 'POST', {}
    );
    assert.equal(contentWidgetDelivery.status, 200, JSON.stringify(contentWidgetDelivery.data));
    const contentWidgetMessage = smtpRelay.messages[smtpRelay.messages.length - 1];
    assert.match(contentWidgetMessage, /Dashboard note/);
    assert.match(contentWidgetMessage, /Sales performance/);
    assert.match(contentWidgetMessage, /https:\/\/example\.test\/dashboard\.png/);
    assert.doesNotMatch(contentWidgetMessage, /<script|onerror=/i,
      'scheduled dashboard content must retain safe rich text and image widgets without active markup');
    const contentWidgetSnapshots = (await api.send('/metadata/dashboards/Content_Widgets_Smoke/snapshots', adminToken)).data.snapshots;
    const contentWidgetScheduledSnapshot = contentWidgetSnapshots.find((snapshot: { subscriptionId?: string }) =>
      snapshot.subscriptionId === contentWidgetSubscription.data.subscription.id);
    assert.equal(contentWidgetScheduledSnapshot?.components[0].type, 'Rich Text');
    assert.equal(contentWidgetScheduledSnapshot?.components[1].type, 'Image');
    assert.equal((await api.send(
      `/metadata/dashboards/Content_Widgets_Smoke/subscriptions/${contentWidgetSubscription.data.subscription.id}`,
      adminToken, 'DELETE'
    )).status, 204);
    assert.equal((await api.send('/metadata/dashboards/Content_Widgets_Smoke', adminToken, 'DELETE')).status, 204);

    assert.equal((await api.send('/records/Account', ownerToken, 'POST', {
      Name: 'Denied Secondary Account', RecordTypeId: 'smoke-secondary'
    })).status, 403, 'profiles must restrict creation to assigned record types');
    permissions = (await api.send('/metadata/permissions', adminToken)).data;
    const standardUser = permissions.users.find((user: { id: string }) => user.id === ownerId)!;
    const recordTypeSetId = 'smoke-secondary-record-type-set';
    const recordTypeGroupId = 'smoke-secondary-record-type-group';
    permissions.permissionSets.push({
      id: recordTypeSetId,
      label: 'Secondary Record Type',
      apiName: 'Secondary_Record_Type',
      license: 'MetaDrive',
      description: '',
      systemPermissions: [],
      objectPermissions: {},
      recordTypePermissions: { 'Account.smoke-secondary': true },
      fieldPermissions: {}
    });
    permissions.permissionSetGroups.push({
      id: recordTypeGroupId,
      label: 'Muted Secondary Record Type',
      apiName: 'Muted_Secondary_Record_Type',
      description: '',
      permissionSetIds: [recordTypeSetId],
      mutedSystemPermissions: [],
      mutedObjectPermissions: {},
      mutedRecordTypePermissions: { 'Account.smoke-secondary': true },
      mutedFieldPermissions: {}
    });
    standardUser.permissionSetGroupIds.push(recordTypeGroupId);
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send('/records/Account', ownerToken, 'POST', {
      Name: 'Muted Secondary Account', RecordTypeId: 'smoke-secondary'
    })).status, 403, 'permission-set group muting must remove record-type access granted by the group');
    const recordTypeEdit = await api.send(`/records/Account/${recordId}`, ownerToken, 'PUT', {
      RecordTypeId: 'smoke-secondary'
    });
    assert.equal(recordTypeEdit.status, 403,
      `record-type changes must honor profile and permission-set-group access: ${JSON.stringify(recordTypeEdit.data)}`);
    permissions.permissionSetGroups.find((group: { id: string }) => group.id === recordTypeGroupId)
      .mutedRecordTypePermissions['Account.smoke-secondary'] = false;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send('/records/Account', ownerToken, 'POST', {
      Name: 'Granted Secondary Account', RecordTypeId: 'smoke-secondary'
    })).status, 201, 'permission-set groups must grant unmuted record-type access');
    const invalidRecordTypeAssignment = structuredClone(permissions);
    invalidRecordTypeAssignment.permissionSetGroups.find((group: { id: string }) => group.id === recordTypeGroupId)
      .mutedRecordTypePermissions['Account.unknown'] = true;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', invalidRecordTypeAssignment)).status, 400,
      'record-type permission metadata must reference an active record type');
    permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user')
      .systemPermissions = ['metadata:read', 'reports:manage'];
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200);
    assert.equal((await api.send('/metadata/reports/Sharing_Smoke', ownerToken, 'PUT', {
      label: 'Granular Report Manager', description: '', objectApiName: 'Account',
      fieldApiNames: ['Name'], groupByFieldApiNames: [], filters: [], folderName: 'Public Reports'
    })).status, 200, 'reports:manage must authorize report metadata without granting global metadata write');
    assert.equal((await api.send('/metadata/flows/Fault_Path_Smoke', ownerToken, 'PUT', {})).status, 403,
      'report management must not grant unrelated flow metadata access');
    const reportFolder = await api.send('/metadata/report-folders', adminToken, 'POST', {
      label: 'Smoke Shared Report Folder',
      parentFolderId: null,
      visibility: 'Private',
      shares: [{ targetType: 'User', targetId: outsiderId, accessLevel: 'Viewer' }]
    });
    assert.equal(reportFolder.status, 201, JSON.stringify(reportFolder.data));
    const folderScopedReport = await api.send('/metadata/reports/Folder_Scoped_Smoke', adminToken, 'PUT', {
      label: 'Folder Scoped Smoke Report',
      description: '',
      objectApiName: 'Account',
      fieldApiNames: ['Name'],
      groupByFieldApiNames: [],
      filters: [],
      folderId: reportFolder.data.folder.id
    });
    assert.equal(folderScopedReport.status, 200, JSON.stringify(folderScopedReport.data));
    const outsiderReportList = await api.send('/metadata/reports', outsiderToken);
    assert.ok(outsiderReportList.data.reports.some((report: { apiName: string }) => report.apiName === 'Folder_Scoped_Smoke'),
      'users granted Viewer access to a report folder can discover its source reports');
    const folderReportRun = await api.send('/reports/Folder_Scoped_Smoke/run', outsiderToken, 'POST', { limit: 100 });
    assert.equal(folderReportRun.status, 200, JSON.stringify(folderReportRun.data));
    assert.equal(folderReportRun.data.totalRows,
      (await api.send('/records/Account', outsiderToken)).data.records.length,
      'report-folder viewers can run the source report without bypassing their record-level access');
    const folderSourceDashboard = await api.send('/metadata/dashboards/Folder_Source_Access_Smoke', adminToken, 'PUT', {
      label: 'Folder Source Access Smoke',
      description: '',
      folderName: 'Private Reports',
      visibility: 'Private',
      status: 'Deployed',
      sharedUserIds: [managerId],
      filterLogic: 'All',
      filters: [],
      components: [{
        id: 'folder-source-metric',
        title: 'Folder Source Count',
        type: 'Metric',
        reportApiName: 'Folder_Scoped_Smoke',
        properties: {},
        objectApiName: 'Account',
        aggregation: 'Count',
        measureFieldApiName: null,
        groupByFieldApiName: null,
        chartType: 'Bar',
        displayFieldApiNames: ['Name']
      }]
    });
    assert.equal(folderSourceDashboard.status, 200, JSON.stringify(folderSourceDashboard.data));
    const restrictedReportRecord = await api.send('/records/Account', adminToken, 'POST', {
      Name: 'Restricted Dashboard Report Row'
    });
    assert.equal(restrictedReportRecord.status, 201, JSON.stringify(restrictedReportRecord.data));
    assert.equal((await api.send(`/records/Account/${restrictedReportRecord.data.record.Id}/shares`, adminToken, 'POST', {
      userId: managerId,
      accessLevel: 'Read'
    })).status, 201);
    const restrictedSourceSubscription = await api.send(
      '/metadata/dashboards/Folder_Source_Access_Smoke/subscriptions',
      adminToken,
      'POST',
      {
        ...subscriptionInput,
        label: 'Restricted source report delivery',
        recipientUserIds: [managerId]
      }
    );
    assert.equal(restrictedSourceSubscription.status, 201, JSON.stringify(restrictedSourceSubscription.data));
    const restrictedSourceDelivery = await api.send(
      `/metadata/dashboards/Folder_Source_Access_Smoke/subscriptions/${restrictedSourceSubscription.data.subscription.id}/run`,
      adminToken,
      'POST',
      {}
    );
    assert.equal(restrictedSourceDelivery.status, 200, JSON.stringify(restrictedSourceDelivery.data));
    const restrictedSourceMessage = smtpRelay.messages[smtpRelay.messages.length - 1];
    assert.match(restrictedSourceMessage, /unavailable under your current access permissions/i,
      'scheduled widgets must report when their source report is inaccessible to the recipient');
    assert.doesNotMatch(restrictedSourceMessage, /Restricted Dashboard Report Row/,
      'scheduled delivery must not expose report data outside the recipient report-folder audience');
    assert.deepEqual((await api.send(
      '/metadata/dashboards/Folder_Source_Access_Smoke/snapshots',
      managerToken
    )).data.snapshots, [],
    'scheduled snapshots must not expose data from a report folder the recipient cannot access');
    assert.equal((await api.send(
      `/metadata/dashboards/Folder_Source_Access_Smoke/subscriptions/${restrictedSourceSubscription.data.subscription.id}`,
      adminToken,
      'DELETE'
    )).status, 204);
    const snapshotAccessRecord = await api.send('/records/Account', outsiderToken, 'POST', {
      Name: 'Dashboard Snapshot Access Revalidation'
    });
    assert.equal(snapshotAccessRecord.status, 201, JSON.stringify(snapshotAccessRecord.data));
    assert.equal((await api.send('/metadata/reports', managerToken)).data.reports
      .some((report: { apiName: string }) => report.apiName === 'Folder_Scoped_Smoke'), false,
    'users outside a report folder audience cannot discover its reports');
    assert.equal((await api.send('/reports/Folder_Scoped_Smoke/run', managerToken, 'POST', { limit: 100 })).status, 404,
      'direct report execution must not bypass source-folder visibility');
    assert.equal((await api.send('/reports/Folder_Scoped_Smoke/run', managerToken, 'POST', {
      dashboardApiName: 'Folder_Source_Access_Smoke',
      limit: 100
    })).status, 404, 'dashboard access must not bypass source-report folder visibility');
    assert.equal((await api.send('/metadata/report-folders/' + reportFolder.data.folder.id, adminToken, 'PUT', {
      label: 'Smoke Shared Report Folder',
      parentFolderId: null,
      visibility: 'Private',
      shares: [
        { targetType: 'User', targetId: outsiderId, accessLevel: 'Viewer' },
        { targetType: 'User', targetId: managerId, accessLevel: 'Viewer' }
      ]
    })).status, 200);
    assert.equal((await api.send(`/records/Account/${snapshotAccessRecord.data.record.Id}/shares`, outsiderToken, 'POST', {
      userId: managerId,
      accessLevel: 'Read'
    })).status, 201);
    assert.equal((await api.send('/reports/Folder_Scoped_Smoke/run', managerToken, 'POST', {
      dashboardApiName: 'Folder_Source_Access_Smoke',
      limit: 100
    })).status, 200, 'dashboard source reports run after current folder access is granted');
    const managerSourceSnapshot = await api.send(
      '/metadata/dashboards/Folder_Source_Access_Smoke/snapshots',
      managerToken,
      'POST',
      { label: 'Source access snapshot' }
    );
    assert.equal(managerSourceSnapshot.status, 201, JSON.stringify(managerSourceSnapshot.data));
    assert.equal((await api.send('/metadata/report-folders/' + reportFolder.data.folder.id, adminToken, 'PUT', {
      label: 'Smoke Shared Report Folder',
      parentFolderId: null,
      visibility: 'Private',
      shares: [{ targetType: 'User', targetId: outsiderId, accessLevel: 'Viewer' }]
    })).status, 200);
    assert.equal((await api.send('/reports/Folder_Scoped_Smoke/run', managerToken, 'POST', {
      dashboardApiName: 'Folder_Source_Access_Smoke',
      limit: 100
    })).status, 404, 'dashboard source access is revoked immediately when folder sharing is removed');
    assert.deepEqual((await api.send(
      '/metadata/dashboards/Folder_Source_Access_Smoke/snapshots',
      managerToken
    )).data.snapshots, [],
    'a saved snapshot must not disclose report data after its creator loses source-folder access');
    assert.equal((await api.send('/metadata/report-folders/' + reportFolder.data.folder.id, adminToken, 'PUT', {
      label: 'Smoke Shared Report Folder',
      parentFolderId: null,
      visibility: 'Private',
      shares: [
        { targetType: 'User', targetId: outsiderId, accessLevel: 'Viewer' },
        { targetType: 'User', targetId: managerId, accessLevel: 'Viewer' }
      ]
    })).status, 200);
    const recordAccessSnapshot = await api.send(
      '/metadata/dashboards/Folder_Source_Access_Smoke/snapshots',
      managerToken,
      'POST',
      { label: 'Record access snapshot' }
    );
    assert.equal(recordAccessSnapshot.status, 201, JSON.stringify(recordAccessSnapshot.data));
    assert.equal((await api.send(`/records/Account/${snapshotAccessRecord.data.record.Id}/shares/${managerId}`, outsiderToken, 'DELETE')).status, 204);
    assert.equal((await api.send(
      '/metadata/dashboards/Folder_Source_Access_Smoke/snapshots',
      managerToken
    )).data.snapshots.some((snapshot: { id: string }) => snapshot.id === recordAccessSnapshot.data.snapshot.id), false,
    'a saved snapshot must be hidden when its running user loses access to any captured record');
    assert.equal((await api.send('/metadata/report-folders/' + reportFolder.data.folder.id, adminToken, 'PUT', {
      label: 'Smoke Shared Report Folder',
      parentFolderId: null,
      visibility: 'Private',
      shares: [{ targetType: 'User', targetId: outsiderId, accessLevel: 'Viewer' }]
    })).status, 200);
    assert.equal((await api.send('/metadata/report-folders/' + reportFolder.data.folder.id, adminToken, 'DELETE')).status, 409,
      'report folders containing saved reports cannot be deleted');
    permissions.sharingSettings.Account = { defaultAccess: 'Private', grantAccessUsingHierarchies: false };
    const standardProfileForSharing = permissions.profiles.find((profile: { id: string }) => profile.id === 'standard-user');
    assert.ok(standardProfileForSharing, 'standard-user profile must exist');
    standardProfileForSharing.systemPermissions = [...new Set([...standardProfileForSharing.systemPermissions, 'email:send'])];
    const publicGroupId = 'smoke-public-group';
    permissions.publicGroups.push({
      id: publicGroupId,
      label: 'Smoke Public Group',
      apiName: 'Smoke_Public_Group',
      description: '',
      userIds: [],
      roleIds: [],
      roleAndSubordinateIds: [],
      groupIds: ['smoke-nested-public-group']
    }, {
      id: 'smoke-nested-public-group',
      label: 'Smoke Nested Group',
      apiName: 'Smoke_Nested_Group',
      description: '',
      userIds: [outsiderId],
      roleIds: [],
      roleAndSubordinateIds: [],
      groupIds: []
    });
    const ruleId = 'smoke-criteria-sharing-rule';
    permissions.sharingRules.push({
      id: ruleId,
      label: 'Smoke Criteria Rule',
      apiName: 'Smoke_Criteria_Rule',
      objectApiName: 'Account',
      active: true,
      type: 'CriteriaBased',
      ownerRoleIds: [],
      criteria: [{ fieldApiName: 'Name', operator: 'Equals', value: 'Automated Rule Shared Account' }],
      filterLogic: 'All',
      targetType: 'PublicGroup',
      targetId: publicGroupId,
      accessLevel: 'Read'
    }, {
      id: 'smoke-owner-sharing-rule',
      label: 'Smoke Owner Rule',
      apiName: 'Smoke_Owner_Rule',
      objectApiName: 'Account',
      active: true,
      type: 'OwnerBased',
      ownerRoleIds: [ownerRoleId],
      criteria: [],
      filterLogic: 'All',
      targetType: 'RoleAndSubordinates',
      targetId: managerRoleId,
      accessLevel: 'Read'
    });
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissions)).status, 200,
      'tenant metadata must accept well-formed public groups and sharing rules');
    assert.ok((await api.send('/auth/me', ownerToken)).data.user.permissions.includes('email:send'),
      'the standard user must retain email permission while record-triggered email alert rules are active');
    const invalidCriteriaRule = structuredClone(permissions);
    invalidCriteriaRule.sharingRules.find((rule: { id: string }) => rule.id === ruleId)
      .criteria[0].fieldApiName = 'Unknown_Field__c';
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', invalidCriteriaRule)).status, 400,
      'sharing rules must reject criteria that reference unknown fields');
    const invalidTargetUserRule = structuredClone(permissions);
    invalidTargetUserRule.sharingRules.find((rule: { id: string }) => rule.id === ruleId).targetType = 'User';
    invalidTargetUserRule.sharingRules.find((rule: { id: string }) => rule.id === ruleId).targetId = 'unknown-user';
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', invalidTargetUserRule)).status, 400,
      'sharing rules must reject target users outside the tenant');
    const invalidOperatorRule = structuredClone(permissions);
    invalidOperatorRule.sharingRules.find((rule: { id: string }) => rule.id === ruleId)
      .criteria[0].operator = 'Greater Than';
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', invalidOperatorRule)).status, 400,
      'sharing rules must reject operators incompatible with the field type');
    const automatedRuleRecord = await api.send('/records/Account', ownerToken, 'POST', { Name: 'Automated Rule Shared Account' });
    assert.equal(automatedRuleRecord.status, 201, JSON.stringify(automatedRuleRecord.data));
    assert.equal((await api.send(`/records/Account/${automatedRuleRecord.data.record.Id}`, outsiderToken)).status, 200,
      'active criteria rules must share matching records to nested public-group members');
    const ownerRuleRecord = await api.send('/records/Account', ownerToken, 'POST', { Name: 'Automated Owner Shared Account' });
    assert.equal(ownerRuleRecord.status, 201, JSON.stringify(ownerRuleRecord.data));
    assert.equal((await api.send(`/records/Account/${ownerRuleRecord.data.record.Id}`, managerToken)).status, 200,
      'owner-based rules must grant access from source roles to target roles and subordinates');
    assert.equal((await api.send(`/records/Account/${ownerRuleRecord.data.record.Id}`, outsiderToken)).status, 404,
      'owner-based sharing must not grant access to users outside its target role hierarchy');
    const permissionsAfterRuleChecks = (await api.send('/metadata/permissions', adminToken)).data;
    permissionsAfterRuleChecks.sharingRules.find((rule: { id: string }) => rule.id === ruleId).active = false;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', permissionsAfterRuleChecks)).status, 200);
    assert.equal((await api.send(`/records/Account/${automatedRuleRecord.data.record.Id}`, outsiderToken)).status, 404,
      'deactivating an automated sharing rule must revoke its access without deleting records');
    assert.equal((await api.send(`/records/Account/${automatedRuleRecord.data.record.Id}/shares`, ownerToken, 'POST', {
      groupId: publicGroupId, accessLevel: 'Edit'
    })).status, 201, 'manual record shares must support public-group targets');
    assert.equal((await api.send(`/records/Account/${automatedRuleRecord.data.record.Id}`, outsiderToken, 'PUT', {
      Name: 'Edited Through Group Share'
    })).status, 200, 'public-group Edit shares must grant record edit access to group members');
    assert.equal((await api.send(`/records/Account/${automatedRuleRecord.data.record.Id}/shares/groups/${publicGroupId}`, ownerToken, 'DELETE')).status, 204);
    assert.equal((await api.send(`/records/Account/${automatedRuleRecord.data.record.Id}`, outsiderToken)).status, 404,
      'revoking a manual group share must remove the resulting access');
    const cycle = structuredClone((await api.send('/metadata/permissions', adminToken)).data);
    cycle.publicGroups.find((group: { id: string }) => group.id === publicGroupId).groupIds = ['smoke-nested-public-group'];
    cycle.publicGroups.find((group: { id: string }) => group.id === 'smoke-nested-public-group').groupIds = [publicGroupId];
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', cycle)).status, 400,
      'public-group nesting cycles must be rejected');

    const runAsComponent = {
      ...dashboardComponent,
      id: 'dashboard-report-count',
      title: 'Accessible Account Count',
      reportApiName: 'Sharing_Smoke'
    };
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard,
      status: 'Deployed',
      components: [runAsComponent],
      allowViewerToSelectRunningUser: true,
      runningUserId: null
    })).status, 403, 'dashboard owners cannot enable running-user selection without dashboard-management permission');
    const runAsDashboard = await api.send('/metadata/dashboards/Owner_Dashboard', adminToken, 'PUT', {
      ...dashboard,
      status: 'Deployed',
      sharedUserIds: [outsiderId, managerId],
      components: [runAsComponent],
      runningUserId: admin.id
    });
    assert.equal(runAsDashboard.status, 200, JSON.stringify(runAsDashboard.data));
    assert.equal(runAsDashboard.data.dashboard.runningUserId, admin.id,
      'dashboard administrators must be able to persist a tenant-scoped running user');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard', ownerToken, 'PUT', {
      ...dashboard,
      status: 'Deployed',
      components: [runAsComponent],
      runningUserId: ownerId
    })).status, 403, 'dashboard owners cannot change the administrator-controlled running identity');
    const viewerReport = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', { offset: 0, limit: 5000 });
    const dashboardReport = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardApiName: 'Owner_Dashboard', offset: 0, limit: 5000
    });
    assert.equal(dashboardReport.status, 200, JSON.stringify(dashboardReport.data));
    assert.ok(dashboardReport.data.totalRows > viewerReport.data.totalRows,
      'a shared viewer must receive report results evaluated with the configured dashboard running user’s record access');
    const viewerRecords = await api.send('/metadata/dashboards/Owner_Dashboard/data/Account', ownerToken);
    assert.equal(viewerRecords.status, 200, JSON.stringify(viewerRecords.data));
    assert.ok(viewerRecords.data.records.length > 0,
      'dashboard record sources must resolve under the configured running identity');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/data/Campaign', ownerToken)).status, 404,
      'dashboard data endpoints must not expose unreferenced tenant objects');
    const runAsSnapshot = await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken, 'POST', {
      label: 'Viewer-owned run-as snapshot'
    });
    assert.equal(runAsSnapshot.status, 201, JSON.stringify(runAsSnapshot.data));
    assert.equal(runAsSnapshot.data.snapshot.createdBy, ownerId,
      'run-as snapshot data must not transfer snapshot ownership to the configured running user');
    assert.equal(runAsSnapshot.data.snapshot.components[0].metricValue, dashboardReport.data.totalRows,
      'snapshot values must be evaluated with the same configured running identity as dashboard report execution');
    const dynamicDashboard = await api.send('/metadata/dashboards/Owner_Dashboard', adminToken, 'PUT', {
      ...runAsDashboard.data.dashboard,
      runningUserId: null,
      allowViewerToSelectRunningUser: true
    });
    assert.equal(dynamicDashboard.status, 200, JSON.stringify(dynamicDashboard.data));
    const managerDashboardList = await api.send('/metadata/dashboards', managerToken);
    assert.equal(managerDashboardList.status, 200, JSON.stringify(managerDashboardList.data));
    assert.ok(managerDashboardList.data.runningUserIds.includes(managerId));
    assert.ok(managerDashboardList.data.runningUserIds.includes(ownerId),
      'users with team-dashboard preview permission can select users in subordinate roles');
    assert.equal(managerDashboardList.data.runningUserIds.includes(outsiderId), false,
      'team-dashboard preview choices must exclude users outside the manager role hierarchy');
    assert.equal(managerDashboardList.data.runningUserIds.includes(admin.id), false,
      'team-dashboard preview choices must exclude users above the manager in the role hierarchy');
    const peerRolePermissions = (await api.send('/metadata/permissions', adminToken)).data;
    const peerUserMetadata = peerRolePermissions.users.find((user: { id: string }) => user.id === outsiderId);
    peerUserMetadata.role = 'Smoke Manager';
    peerUserMetadata.roleId = managerRoleId;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', peerRolePermissions)).status, 200);
    const peerRoleDashboardList = await api.send('/metadata/dashboards', managerToken);
    assert.equal(peerRoleDashboardList.data.runningUserIds.includes(outsiderId), false,
      'team-dashboard preview choices must exclude users in peer roles');
    const restoredPeerPermissions = (await api.send('/metadata/permissions', adminToken)).data;
    const restoredPeerUser = restoredPeerPermissions.users.find((user: { id: string }) => user.id === outsiderId);
    restoredPeerUser.role = 'Smoke Outsider';
    restoredPeerUser.roleId = outsiderRoleId;
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', restoredPeerPermissions)).status, 200);
    const managerReportWithoutSelection = await api.send('/reports/Sharing_Smoke/run', managerToken, 'POST', {
      offset: 0,
      limit: 5000
    });
    const managerSelectingSubordinate = await api.send('/reports/Sharing_Smoke/run', managerToken, 'POST', {
      dashboardApiName: 'Owner_Dashboard',
      dashboardRunningUserId: ownerId,
      offset: 0,
      limit: 5000
    });
    assert.equal(managerSelectingSubordinate.status, 200, JSON.stringify(managerSelectingSubordinate.data));
    assert.equal(managerSelectingSubordinate.data.totalRows, viewerReport.data.totalRows,
      'team preview report runs must use the selected subordinate identity rather than the viewing manager');
    assert.equal((await api.send('/reports/Sharing_Smoke/run', managerToken, 'POST', {
      dashboardApiName: 'Owner_Dashboard',
      dashboardRunningUserId: outsiderId,
      offset: 0,
      limit: 5000
    })).status, 403, 'team preview must deny a user outside the manager’s hierarchy');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/data/Account?runningUserId=' + outsiderId, managerToken)).status, 403,
      'record-data endpoints must enforce the same role hierarchy as report runs');
    const viewAllPermissions = await api.send('/metadata/permissions', adminToken);
    assert.equal(viewAllPermissions.status, 200, JSON.stringify(viewAllPermissions.data));
    const viewAllAccess = structuredClone(viewAllPermissions.data);
    const viewAllSet = structuredClone(viewAllAccess.permissionSets.find((set: { id: string }) => set.id === 'sales-user'));
    viewAllSet.id = 'smoke-view-all-data';
    viewAllSet.apiName = 'Smoke_View_All_Data';
    viewAllSet.label = 'Smoke View All Data';
    viewAllSet.systemPermissions = ['data:viewAll'];
    viewAllAccess.permissionSets.push(viewAllSet);
    const viewAllUser = viewAllAccess.users.find((user: { id: string }) => user.id === outsiderId);
    viewAllUser.permissionSetIds.push(viewAllSet.id);
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', viewAllAccess)).status, 200,
      'View All Data permission fixture must be assignable');
    const viewAllDashboardList = await api.send('/metadata/dashboards', outsiderToken);
    assert.ok(viewAllDashboardList.data.runningUserIds.includes(admin.id),
      'View All Data grants preview-as choices beyond the user’s role hierarchy');
    const outsiderSelectingAnyUser = await api.send('/reports/Sharing_Smoke/run', outsiderToken, 'POST', {
      dashboardApiName: 'Owner_Dashboard',
      dashboardRunningUserId: admin.id,
      offset: 0,
      limit: 5000
    });
    assert.equal(outsiderSelectingAnyUser.status, 200, JSON.stringify(outsiderSelectingAnyUser.data));
    assert.ok(outsiderSelectingAnyUser.data.totalRows > managerReportWithoutSelection.data.totalRows,
      'View All Data preview selection evaluates the report as the chosen tenant user');
    const restoredViewAllAccess = structuredClone(viewAllAccess);
    restoredViewAllAccess.permissionSets = restoredViewAllAccess.permissionSets.filter((set: { id: string }) => set.id !== viewAllSet.id);
    const restoredViewAllUser = restoredViewAllAccess.users.find((user: { id: string }) => user.id === outsiderId);
    restoredViewAllUser.permissionSetIds = restoredViewAllUser.permissionSetIds.filter((setId: string) => setId !== viewAllSet.id);
    assert.equal((await api.send('/metadata/permissions', adminToken, 'PUT', restoredViewAllAccess)).status, 200,
      'View All Data permission fixture must be removed after its assertions');
    const managerSelectedSnapshot = await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', managerToken, 'POST', {
      label: 'Team preview snapshot',
      runningUserId: ownerId
    });
    assert.equal(managerSelectedSnapshot.status, 201, JSON.stringify(managerSelectedSnapshot.data));
    assert.equal(managerSelectedSnapshot.data.snapshot.createdBy, managerId);
    assert.equal(managerSelectedSnapshot.data.snapshot.runningUserId, ownerId);
    const unauthorizedReportSelection = await api.send('/reports/Sharing_Smoke/run', ownerToken, 'POST', {
      dashboardApiName: 'Owner_Dashboard',
      dashboardRunningUserId: admin.id,
      offset: 0,
      limit: 5000
    });
    assert.equal(unauthorizedReportSelection.status, 403,
      'a shared dashboard viewer without dashboard-management permission cannot select another running user for reports');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/data/Account?runningUserId=' + admin.id, ownerToken)).status, 403,
      'dashboard data requests must enforce running-user selection authorization');
    assert.equal((await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', ownerToken, 'POST', {
      label: 'Unauthorized selected-user snapshot',
      runningUserId: admin.id
    })).status, 403, 'snapshot requests must enforce running-user selection authorization');
    const selectedOwnerReport = await api.send('/reports/Sharing_Smoke/run', adminToken, 'POST', {
      dashboardApiName: 'Owner_Dashboard',
      dashboardRunningUserId: ownerId,
      offset: 0,
      limit: 5000
    });
    assert.equal(selectedOwnerReport.status, 200, JSON.stringify(selectedOwnerReport.data));
    assert.equal(selectedOwnerReport.data.totalRows, viewerReport.data.totalRows,
      'authorized dynamic selection must evaluate report rows with the selected user’s permissions');
    const selectedOwnerSnapshot = await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', adminToken, 'POST', {
      label: 'Selected owner snapshot',
      runningUserId: ownerId
    });
    assert.equal(selectedOwnerSnapshot.status, 201, JSON.stringify(selectedOwnerSnapshot.data));
    assert.equal(selectedOwnerSnapshot.data.snapshot.createdBy, admin.id,
      'dynamic snapshots remain owned by the capturing viewer');
    assert.equal(selectedOwnerSnapshot.data.snapshot.runningUserId, ownerId,
      'dynamic snapshots persist the identity used to evaluate their data');
    assert.equal(selectedOwnerSnapshot.data.snapshot.components[0].metricValue, selectedOwnerReport.data.totalRows,
      'dynamic snapshots use the same selected identity as report execution');
    assert.equal((await api.send('/reports/Sharing_Smoke/run', adminToken, 'POST', {
      dashboardApiName: 'Owner_Dashboard',
      dashboardRunningUserId: 'unknown-user',
      offset: 0,
      limit: 5000
    })).status, 403, 'dynamic selection must reject inactive or cross-tenant identities');
    const outsiderSnapshotsAtEnd = (await api.send('/metadata/dashboards/Owner_Dashboard/snapshots', outsiderToken)).data.snapshots;
    assert.ok(outsiderSnapshotsAtEnd.every((snapshot: { createdBy: string }) => snapshot.createdBy === outsiderId),
      'run-as snapshots remain private, while scheduled snapshots are only visible to their recipient owner');
    if (child) await stopApi(child);
    child = await startApi(port, dataPath);
    const persistenceToken = await api.login(adminEmail);
    const persistedLifecycleMetadata = await api.send(`/metadata/objects/${lifecycleObjectApiName}`, persistenceToken);
    assert.equal(persistedLifecycleMetadata.status, 200, JSON.stringify(persistedLifecycleMetadata.data));
    assert.equal(persistedLifecycleMetadata.data.object.description, 'Updated lifecycle fixture',
      'object metadata edits must survive a server restart');
    assert.equal(persistedLifecycleMetadata.data.object.fields.find((field: { apiName: string }) => field.apiName === 'External_Code__c').label,
      'External Reference', 'field metadata edits must survive a server restart');
    assert.equal(persistedLifecycleMetadata.data.object.fields.some((field: { apiName: string }) => field.apiName === 'Lifecycle_Status__c'), false,
      'field deletions must survive a server restart');
    assert.equal(persistedLifecycleMetadata.data.object.compactLayouts.some((layout: { id: string }) => layout.id === 'lifecycle-secondary-compact'), true,
      'compact layout definitions must survive a server restart');
    assert.equal(persistedLifecycleMetadata.data.object.compactLayoutAssignments.find((assignment: { profileId: string }) => assignment.profileId === 'standard-user')?.compactLayoutId,
      'lifecycle-secondary-compact', 'compact layout assignments must survive a server restart');
    assert.deepEqual(persistedLifecycleMetadata.data.object.fieldSets, [
      { apiName: 'LifecycleSummary', label: 'Lifecycle Summary', fieldApiNames: ['Name', 'External_Code__c'] }
    ], 'field set metadata must survive a server restart');
    const persistedLifecycleRecords = await api.send(`/records/${lifecycleObjectApiName}`, persistenceToken);
    assert.equal(persistedLifecycleRecords.status, 200, JSON.stringify(persistedLifecycleRecords.data));
    assert.equal(persistedLifecycleRecords.data.records.length, 1, 'records must survive a server restart');
    assert.equal(persistedLifecycleRecords.data.records[0].External_Code__c, 'LIFE-002');
    const persistedLifecycleHistory = await api.send(
      `/records/${lifecycleObjectApiName}/${persistedLifecycleRecords.data.records[0].Id}/history`, persistenceToken
    );
    assert.equal(persistedLifecycleHistory.status, 200, JSON.stringify(persistedLifecycleHistory.data));
    assert.equal(persistedLifecycleHistory.data.history.length, 1, 'field history must survive a server restart');
    assert.equal((await api.send(`/records/${lifecycleObjectApiName}/${persistedLifecycleRecords.data.records[0].Id}`, persistenceToken, 'DELETE')).status, 204,
      'the Object Manager lifecycle fixture record must be deletable');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, persistenceToken, 'DELETE')).status, 204,
      'custom objects must be deletable after their records are removed');
    assert.equal((await api.send(`/metadata/objects/${lifecycleObjectApiName}`, persistenceToken)).status, 404,
      'deleted custom objects must disappear from tenant metadata');
    const persistedAutoNumberMetadata = await api.send(`/metadata/objects/${autoNumberObjectApiName}`, persistenceToken);
    assert.equal(persistedAutoNumberMetadata.status, 200, JSON.stringify(persistedAutoNumberMetadata.data));
    assert.equal(persistedAutoNumberMetadata.data.object.label, 'Updated Auto Number Lifecycle');
    assert.equal(persistedAutoNumberMetadata.data.object.pluralLabel, 'Updated Auto Number Lifecycles');
    assert.equal(persistedAutoNumberMetadata.data.object.description, 'Updated object metadata must persist.');
    assert.deepEqual(persistedAutoNumberMetadata.data.object.settings, updatedAutoNumberMetadata.settings,
      'object features and record-name settings must survive a server restart');
    assert.equal(persistedAutoNumberMetadata.data.object.settings.recordNameFormat, 'LIFE-{0000}',
      'auto-number formats must survive a server restart');
    const persistedAutoNumberRecords = await api.send(`/records/${autoNumberObjectApiName}`, persistenceToken);
    assert.deepEqual(persistedAutoNumberRecords.data.records.map((record: { Name: string }) => record.Name),
      ['LIFE-0002', 'LIFE-0003'], 'generated record names must survive a server restart');
    for (const record of persistedAutoNumberRecords.data.records) {
      assert.equal((await api.send(`/records/${autoNumberObjectApiName}/${record.Id}`, persistenceToken, 'DELETE')).status, 204);
    }
    const fourthAutoNumberRecord = await api.send(`/records/${autoNumberObjectApiName}`, persistenceToken, 'POST', {});
    assert.equal(fourthAutoNumberRecord.status, 201, JSON.stringify(fourthAutoNumberRecord.data));
    assert.equal(fourthAutoNumberRecord.data.record.Name, 'LIFE-0004',
      'the auto-number sequence must persist independently of existing records');
    assert.equal((await api.send(`/records/${autoNumberObjectApiName}/${fourthAutoNumberRecord.data.record.Id}`, persistenceToken, 'DELETE')).status, 204);
    assert.equal((await api.send(`/metadata/objects/${autoNumberObjectApiName}`, persistenceToken, 'DELETE')).status, 204);
    const appReferencedPages = (await api.send('/metadata/pages', persistenceToken)).data.pages as Array<Record<string, any>>;
    for (const page of appReferencedPages) {
      const assignments = page.activationAssignments as Array<{ appId?: string | null }> | undefined;
      if (!assignments?.some((assignment) => assignment.appId)) continue;
      const remainingAssignments = assignments.filter((assignment) => !assignment.appId);
      const updatedPage = {
        ...page,
        status: remainingAssignments.length ? page.status : 'Draft',
        activationAssignments: remainingAssignments
      };
      const savedPage = await api.send(`/metadata/pages/${encodeURIComponent(String(page.apiName))}`, persistenceToken, 'PUT', updatedPage);
      assert.equal(savedPage.status, 200, `app assignments must be removable before deleting their apps: ${JSON.stringify(savedPage.data)}`);
    }
    const appsBeforeCleanup = (await api.send('/metadata/apps', persistenceToken)).data.apps as Array<{ apiName: string }>;
    assert.ok(appsBeforeCleanup.length > 0, 'the smoke tenant should still contain its initial app metadata');
    for (const app of appsBeforeCleanup) {
      const deletedApp = await api.send(`/metadata/apps/${encodeURIComponent(app.apiName)}`, persistenceToken, 'DELETE');
      assert.equal(deletedApp.status, 204, `the final app must be deletable: ${JSON.stringify(deletedApp.data)}`);
    }
    assert.deepEqual((await api.send('/metadata/apps', persistenceToken)).data.apps, [],
      'tenants may intentionally keep an empty Lightning app catalog');
    if (child) await stopApi(child);
    child = await startApi(port, dataPath);
    const emptyAppCatalogToken = await api.login(adminEmail);
    assert.deepEqual((await api.send('/metadata/apps', emptyAppCatalogToken)).data.apps, [],
      'an intentionally empty app catalog must survive a server restart without migration defaults being reinserted');
    console.log('PASS: isolated API smoke covered RBAC/sharing, fault handling, screen routing, and formula resources');
  } finally {
    if (child) await stopApi(child);
    await new Promise<void>((resolve, reject) => smtpRelay.server.close((error) => error ? reject(error) : resolve()));
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
