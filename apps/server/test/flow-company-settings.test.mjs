import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenantId = 'flow-company-settings-smoke';
const adminEmail = 'admin@flow-company-settings-smoke.test';
const password = 'Flow-Company-Settings-Smoke-Password-2026!';

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function startApi(port, dataPath) {
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      METADRIVE_TEST_MODE: 'true',
      PORT: String(port),
      METADRIVE_DATA_PATH: dataPath,
      METADRIVE_BOOTSTRAP_TENANT_ID: tenantId,
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Flow Company Settings Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 9).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout?.on('data', chunk => { logs += chunk.toString(); });
  child.stderr?.on('data', chunk => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test API exited during startup:\n${logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return child;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`Test API did not become ready:\n${logs}`);
}

async function stopApi(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
}

test('Flow formula reads tenant VAT settings and rejects caller-supplied overrides', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-flow-company-settings-'));
  const port = await availablePort();
  let child;
  try {
    child = await startApi(port, path.join(directory, 'test-state.json'));
    const root = `http://127.0.0.1:${port}/api`;
    const send = async (pathName, token, method = 'GET', body) => {
      const response = await fetch(`${root}${pathName}`, {
        signal: AbortSignal.timeout(20000),
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : {} };
    };
    const login = await send('/auth/login', undefined, 'POST', { email: adminEmail, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = login.data.access_token;
    const settings = await send('/metadata/currencies', token, 'PUT', {
      corporateCurrency: 'GBP', standardVatRate: 17.5,
      currencies: [{ currencyIsoCode: 'GBP', conversionRate: 1 }]
    });
    assert.equal(settings.status, 200, JSON.stringify(settings.data));

    const apiName = 'Company_Settings_VAT_Smoke';
    const flow = {
      apiName, label: 'Company Settings VAT Smoke', description: '',
      flowType: 'Autolaunched Flow', status: 'Active',
      versionNumber: 1, activeVersion: 1, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Capture VAT rate', config: {
          variable: 'VatResult', operator: 'Assign', value: '{!ConfiguredVatRate}'
        } },
        { id: 3, type: 'End', label: 'End', config: {} }
      ],
      connectors: [
        { id: 'start-assignment', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'assignment-end', from: 2, to: 3, label: '', kind: 'normal' }
      ],
      resources: [
        { name: 'ConfiguredVatRate', label: 'Configured VAT rate', type: 'Formula', dataType: 'Number',
          isCollection: false, availableForInput: false, availableForOutput: false,
          value: '{!$CompanySettings.StandardVatRate}' },
        { name: 'VatResult', label: 'VAT result', type: 'Variable', dataType: 'Number',
          isCollection: false, availableForInput: false, availableForOutput: true, value: 0 }
      ],
      versions: []
    };
    const validation = await send(`/metadata/flows/${apiName}/validate`, token, 'POST', flow);
    assert.equal(validation.status, 200, JSON.stringify(validation.data));
    assert.equal(validation.data.valid, true, JSON.stringify(validation.data.errors));
    const saved = await send(`/metadata/flows/${apiName}`, token, 'PUT', flow);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));

    const overridden = await send(`/flows/${apiName}/execute`, token, 'POST', { ConfiguredVatRate: 0 });
    assert.equal(overridden.status, 400, JSON.stringify(overridden.data));
    const executed = await send(`/flows/${apiName}/execute`, token, 'POST', {});
    assert.equal(executed.status, 200, JSON.stringify(executed.data));
    assert.equal(executed.data.outputs.VatResult, 17.5);

    const connectors = await send('/connector-apps/catalog', token);
    assert.equal(connectors.status, 200, JSON.stringify(connectors.data));
    const posApp = connectors.data.records.find(item => item.AppKey__c === 'uk-offlicence-pos');
    assert(posApp);
    const installed = await send(`/flows/${posApp.InstallFlow__c}/execute`, token, 'POST', { AppKey: posApp.AppKey__c });
    assert.equal(installed.status, 200, JSON.stringify(installed.data));
    const trial = await send(`/flows/${posApp.TrialFlow__c}/execute`, token, 'POST', { AppKey: posApp.AppKey__c });
    assert.equal(trial.status, 200, JSON.stringify(trial.data));
    const permissions = await send('/metadata/permissions', token);
    assert.equal(permissions.status, 200, JSON.stringify(permissions.data));
    const adminProfile = permissions.data.profiles.find(item => item.id === 'system-administrator');
    assert.deepEqual(adminProfile.fieldPermissions['Product.DefaultPrice'], { read: true, edit: true });
    assert.equal(adminProfile.objectPermissions.Product.viewAll, true);

    const flowList = await send('/metadata/flows', token);
    const checkoutFlow = flowList.data.flows.find(item => item.apiName === 'UK_OFFLICENCE_POS_CHECKOUT');
    assert(checkoutFlow);
    const checkoutValidation = await send('/metadata/flows/UK_OFFLICENCE_POS_CHECKOUT/validate', token, 'POST', checkoutFlow);
    assert.equal(checkoutValidation.status, 200, JSON.stringify(checkoutValidation.data));
    assert.equal(checkoutValidation.data.valid, true, JSON.stringify(checkoutValidation.data.errors));

    const createdProduct = await send('/records/Product', token, 'POST', {
      Name: 'POS Integration Product', DefaultPrice: 1.2, AgeRestricted: true, VATApplicable: true
    });
    assert.equal(createdProduct.status, 201, JSON.stringify(createdProduct.data));
    assert.equal(createdProduct.data.record.DefaultPrice, 1.2);
    const productList = await send('/records/Product?limit=50', token);
    assert.equal(productList.status, 200, JSON.stringify(productList.data));
    assert(productList.data.records.some(item => item.Id === createdProduct.data.record.Id));
    const checkoutDebug = await send('/flows/UK_OFFLICENCE_POS_CHECKOUT/debug', token, 'POST', {
      SaleLines: [{ ProductId: createdProduct.data.record.Id, Quantity: 2 }],
      CurrencyCode: 'GBP'
    });
    assert.equal(checkoutDebug.status, 200, JSON.stringify(checkoutDebug.data));
    assert.equal(checkoutDebug.data.screen.label, 'Challenge 25 verification');
    const startCheckout = await send('/flows/UK_OFFLICENCE_POS_CHECKOUT/execute', token, 'POST', {
      SaleLines: [{ ProductId: createdProduct.data.record.Id, Quantity: 2 }],
      CurrencyCode: 'GBP'
    });
    assert.equal(startCheckout.status, 202, JSON.stringify(startCheckout.data));
    assert.equal(startCheckout.data.screen.label, 'Challenge 25 verification');
    assert.equal(startCheckout.data.values.Total, 2.4);
    assert.equal(startCheckout.data.values.VATTotal, 0.36);
    const paymentScreen = await send(`/flow-interviews/${startCheckout.data.interviewId}/next`, token, 'POST', {
      values: { AgeCheckResult: 'Verified' }, outcome: 'Continue'
    });
    assert.equal(paymentScreen.status, 202, JSON.stringify(paymentScreen.data));
    assert.equal(paymentScreen.data.screen.label, 'Payment');
    const completed = await send(`/flow-interviews/${startCheckout.data.interviewId}/next`, token, 'POST', {
      values: { PaymentMethod: 'Cash', PaymentDecision: 'Accepted', AmountTendered: 3 },
      outcome: 'Continue'
    });
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal(completed.data.outputs.CheckoutStatus, 'Accepted', JSON.stringify(completed.data));
    assert.equal(completed.data.outputs.ChangeDue, 0.6);
    const invoices = await send('/records/Invoice?limit=50', token);
    const invoice = invoices.data.records.find(item => item.Total === 2.4);
    assert(invoice);
    assert.equal(invoice.VATTotal, 0.36);
    assert.equal(invoice.PaymentStatus, 'Accepted');
    const invoiceItems = await send('/records/InvoiceItem?limit=50', token);
    const invoiceItem = invoiceItems.data.records.find(item => item.InvoiceId === invoice.Id);
    assert(invoiceItem);
    assert.equal(invoiceItem.ProductId, createdProduct.data.record.Id);
    assert.equal(invoiceItem.Quantity, 2);
    assert.equal(invoiceItem.UnitPrice, 1.2);
    assert.equal(invoiceItem.VATRate, 17.5);
    assert.equal(invoiceItem.VATAmount, 0.36);
    assert.equal(invoiceItem.LineTotal, 2.4);

    const ageRejectedStart = await send('/flows/UK_OFFLICENCE_POS_CHECKOUT/execute', token, 'POST', {
      SaleLines: [{ ProductId: createdProduct.data.record.Id, Quantity: 2 }],
      CurrencyCode: 'GBP'
    });
    assert.equal(ageRejectedStart.status, 202, JSON.stringify(ageRejectedStart.data));
    const ageRejected = await send(`/flow-interviews/${ageRejectedStart.data.interviewId}/next`, token, 'POST', {
      values: { AgeCheckResult: 'Not Verified' }, outcome: 'Continue'
    });
    assert.equal(ageRejected.status, 200, JSON.stringify(ageRejected.data));
    assert.equal(ageRejected.data.outputs.CheckoutStatus, 'AgeRejected');

    const insufficientStart = await send('/flows/UK_OFFLICENCE_POS_CHECKOUT/execute', token, 'POST', {
      SaleLines: [{ ProductId: createdProduct.data.record.Id, Quantity: 2 }],
      CurrencyCode: 'GBP'
    });
    const insufficientPaymentScreen = await send(`/flow-interviews/${insufficientStart.data.interviewId}/next`, token, 'POST', {
      values: { AgeCheckResult: 'Verified' }, outcome: 'Continue'
    });
    assert.equal(insufficientPaymentScreen.status, 202, JSON.stringify(insufficientPaymentScreen.data));
    const insufficientCash = await send(`/flow-interviews/${insufficientStart.data.interviewId}/next`, token, 'POST', {
      values: { PaymentMethod: 'Cash', PaymentDecision: 'Accepted', AmountTendered: 2.39 },
      outcome: 'Continue'
    });
    assert.equal(insufficientCash.status, 200, JSON.stringify(insufficientCash.data));
    assert.equal(insufficientCash.data.outputs.CheckoutStatus, 'InsufficientCash');

    const declinedStart = await send('/flows/UK_OFFLICENCE_POS_CHECKOUT/execute', token, 'POST', {
      SaleLines: [{ ProductId: createdProduct.data.record.Id, Quantity: 2 }],
      CurrencyCode: 'GBP'
    });
    const declinedPaymentScreen = await send(`/flow-interviews/${declinedStart.data.interviewId}/next`, token, 'POST', {
      values: { AgeCheckResult: 'Verified' }, outcome: 'Continue'
    });
    assert.equal(declinedPaymentScreen.status, 202, JSON.stringify(declinedPaymentScreen.data));
    const declined = await send(`/flow-interviews/${declinedStart.data.interviewId}/next`, token, 'POST', {
      values: { PaymentMethod: 'Cash', PaymentDecision: 'Declined' },
      outcome: 'Continue'
    });
    assert.equal(declined.status, 200, JSON.stringify(declined.data));
    assert.equal(declined.data.outputs.CheckoutStatus, 'Declined');

    const vatExemptProduct = await send('/records/Product', token, 'POST', {
      Name: 'POS VAT Exempt Product', DefaultPrice: 3.3, AgeRestricted: false, VATApplicable: false
    });
    assert.equal(vatExemptProduct.status, 201, JSON.stringify(vatExemptProduct.data));
    const vatExemptStart = await send('/flows/UK_OFFLICENCE_POS_CHECKOUT/execute', token, 'POST', {
      SaleLines: [{ ProductId: vatExemptProduct.data.record.Id, Quantity: 1 }],
      CurrencyCode: 'GBP'
    });
    assert.equal(vatExemptStart.status, 202, JSON.stringify(vatExemptStart.data));
    assert.equal(vatExemptStart.data.values.VATTotal, 0);
    const vatExemptPaymentScreen = await send(`/flow-interviews/${vatExemptStart.data.interviewId}/next`, token, 'POST', {
      values: {}, outcome: 'Continue'
    });
    assert.equal(vatExemptPaymentScreen.status, 202, JSON.stringify(vatExemptPaymentScreen.data));
    const vatExemptCompleted = await send(`/flow-interviews/${vatExemptStart.data.interviewId}/next`, token, 'POST', {
      values: { PaymentMethod: 'Manual', PaymentDecision: 'Accepted' },
      outcome: 'Continue'
    });
    assert.equal(vatExemptCompleted.status, 200, JSON.stringify(vatExemptCompleted.data));
    assert.equal(vatExemptCompleted.data.outputs.CheckoutStatus, 'Accepted');
    assert.equal(vatExemptCompleted.data.outputs.ChangeDue, 0);

    const finalInvoices = await send('/records/Invoice?limit=50', token);
    assert.equal(finalInvoices.data.records.filter(item => item.PaymentStatus === 'Accepted').length, 2);
    const finalInvoiceItems = await send('/records/InvoiceItem?limit=50', token);
    assert.equal(finalInvoiceItems.data.records.length, 2);
    const vatExemptInvoiceItem = finalInvoiceItems.data.records.find(item =>
      item.ProductId === vatExemptProduct.data.record.Id);
    assert(vatExemptInvoiceItem);
    assert.equal(vatExemptInvoiceItem.VATApplicable, false);
    assert.equal(vatExemptInvoiceItem.VATRate, 0);
    assert.equal(vatExemptInvoiceItem.VATAmount, 0);
    assert.equal(vatExemptInvoiceItem.LineTotal, 3.3);
  } finally {
    if (child) await stopApi(child);
    await rm(directory, { recursive: true, force: true });
  }
});
