// One-time metadata bootstrap for test kiosk accounts and ordering. Never hardcodes runtime business behaviour.
// Invoked only when METADRIVE_KIOSK_BOOTSTRAP=true; uses the checked relational state writer.
import pg from 'pg';
import { randomUUID, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { readRelationalState, writeRelationalState } from '../src/relational-runtime.mjs';

if (process.env.METADRIVE_KIOSK_BOOTSTRAP === 'true') {
  if (process.env.METADRIVE_PERSISTENCE_MODE !== 'relational') throw Error('Kiosk bootstrap requires relational persistence');
  const password = process.env.METADRIVE_KIOSK_TEST_PASSWORD;
  if (!password || password.length < 12 || password.length > 256) throw Error('Kiosk test password must be 12-256 characters');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw Error('DATABASE_URL is required');
  const url = new URL(databaseUrl);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: process.env.PGSSLMODE === 'disable' ? false : {
      rejectUnauthorized: process.env.METADRIVE_DB_ALLOW_SELF_SIGNED_CERT !== 'true',
      ...(process.env.METADRIVE_DB_CA_CERT ? { ca: process.env.METADRIVE_DB_CA_CERT.replace(/\\n/g, '\n') } : {})
    }
  });
  try {
    const previous = await readRelationalState(pool);
    const state = structuredClone(previous.state);
    const admin = state.users.find((u) => u.email.toLowerCase() === 'support@unesolutions.co.uk');
    if (!admin) throw Error('Expected tenant administrator is missing');
    const tenantId = admin.tenantId;
    const tenant = state.tenants[tenantId];
    if (!tenant?.accessControl || !Array.isArray(tenant.objects) || !Array.isArray(tenant.pages)) throw Error('Tenant metadata is incomplete');
    const field = (apiName, label, dataType, required = false) => ({
      apiName, label, dataType, required, unique: false
    });
    const productFields = [
      field('Name', 'Name', 'Text', true),
      field('Price__c', 'Price', 'Currency', true),
      field('Image__c', 'Product Image URL', 'URL'),
      field('Category__c', 'Category', 'Text'),
      field('Description__c', 'Description', 'LongTextArea'),
      field('Available__c', 'Available on Kiosk', 'Checkbox')
    ];
    if (!tenant.objects.some((o) => o.apiName === 'Product__c')) {
      tenant.objects.push({
        apiName: 'Product__c', label: 'Product', pluralLabel: 'Products',
        kind: 'Custom Object', description: 'Products available to the metadata-driven kiosk',
        fields: productFields, recordTypes: [], pageLayouts: []
      });
    }
    tenant.records ??= {};
    if (!Array.isArray(tenant.records.Product__c)) tenant.records.Product__c = [];
    // Demonstration catalogue is ordinary records, never embedded inside the page or component code.
    const demoProducts = [
      ['Classic Burger', 4.99, 'Burgers', 'Beef patty with cheese and salad', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=620'],
      ['Chicken Burger', 5.99, 'Burgers', 'Crispy chicken with lettuce', 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=620'],
      ['French Fries', 2.49, 'Sides', 'Golden crispy fries', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=620'],
      ['Loaded Fries', 3.99, 'Sides', 'Fries with cheese sauce', 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=620'],
      ['Cola', 1.99, 'Drinks', 'Chilled sparkling drink', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=620'],
      ['Vanilla Ice Cream', 2.79, 'Desserts', 'Smooth vanilla ice cream', 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=620']
    ];
    for (const [name, price, category, description, image] of demoProducts) {
      if (!tenant.records.Product__c.some((r) => r.Name === name)) {
        tenant.records.Product__c.push({
          Id: randomUUID(), Name: name, Price__c: price, Category__c: category,
          Description__c: description, Image__c: image, Available__c: true
        });
      }
    }
    const sale = tenant.objects.find((o) => o.apiName === 'Sale__c');
    if (!sale) throw Error('Sale__c must exist for a kiosk billing flow');
    const saleFields = [
      field('Order_Total__c', 'Order Total', 'Currency'),
      field('Order_Type__c', 'Order Type', 'Text'),
      field('Order_Items__c', 'Order Items', 'LongTextArea'),
      field('Payment_Status__c', 'Payment Status', 'Text'),
      field('Currency__c', 'Currency', 'Text')
    ];
    for (const f of saleFields) if (!sale.fields.some((existing) => existing.apiName === f.apiName)) sale.fields.push(f);
    const standard = tenant.accessControl.profiles.find((p) => p.id === 'standard-user');
    if (!standard) throw Error('Standard user profile template not found');
    const grants = {
      read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false
    };
    const createProfile = (id, label) => {
      let profile = tenant.accessControl.profiles.find((p) => p.id === id);
      if (profile) return profile;
      profile = structuredClone(standard);
      Object.assign(profile, {
        id, label, apiName: label.replace(/\\W+/g, '_'),
        isStandard: false, description: label + ' test profile for kiosk or till',
        systemPermissions: ['flows:run'],
        objectPermissions: {
          Product__c: { ...grants },
          Sale__c: { ...grants, create: true, edit: true }
        },
        fieldPermissions: Object.fromEntries([
          ...productFields.map((f) => ['Product__c.' + f.apiName, { read: true, edit: false }]),
          ...saleFields.map((f) => ['Sale__c.' + f.apiName, { read: true, edit: true }])
        ])
      });
      tenant.accessControl.profiles.push(profile);
      return profile;
    };
    createProfile('till-user', 'TillUser');
    createProfile('kiosk-user', 'KioskUser');
    const credentials = promisify(scryptCallback);
    for (const [email, label, profileId] of [
      ['till@unesolutions.co.uk', 'Till Test User', 'till-user'],
      ['kisosk@unesolutions.co.uk', 'Kiosk Test User', 'kiosk-user']
    ]) {
      let user = state.users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        const salt = randomBytes(16).toString('hex');
        user = {
          id: randomUUID(), tenantId, name: label, email, role: 'Standard User',
          passwordSalt: salt, passwordHash: (await credentials(password, salt, 64)).toString('hex'),
          permissionSetIds: [], permissionSetGroupIds: [], disabled: false,
          createdAt: new Date().toISOString()
        };
        state.users.push(user);
      }
      if (!tenant.accessControl.users.some((u) => u.id === user.id)) {
        tenant.accessControl.users.push({
          id: user.id, name: user.name, username: email, role: user.role,
          roleId: 'role-standard-user', profileId, permissionSetIds: [],
          permissionSetGroupIds: [], timeZone: 'Europe/London', locale: 'en-GB'
        });
      }
    }
    tenant.flows ??= [];
    if (!tenant.flows.some((f) => f.apiName === 'KIOSK_BILLING')) {
      tenant.flows.push({
        apiName: 'KIOSK_BILLING', label: 'Kiosk Billing (Test Orders)',
        description: 'Editable test checkout. Creates an unpaid Sale record; does not charge a card.',
        flowType: 'Screen Flow', status: 'Active', versionNumber: 1, activeVersion: null,
        triggerObject: null, startConfig: {},
        elements: [
          { id: 1, type: 'Start', label: 'Start checkout', config: {} },
          { id: 2, type: 'Create Records', label: 'Create Pending Sale', config: {
            object: 'Sale__c', fieldValues: [
              { field: 'Order_Type__c', value: '{OrderType}' },
              { field: 'Currency__c', value: '{Currency}' },
              { field: 'Order_Total__c', value: '{Total}' },
              { field: 'Order_Items__c', value: '{Items}' },
              { field: 'Payment_Status__c', value: 'Test - Pending Payment' }
            ]
          } },
          { id: 3, type: 'End', label: 'Finish', config: {} }
        ],
        connectors: [
          { id: 'kiosk-start-create', from: 1, to: 2, label: '', kind: 'normal' },
          { id: 'kiosk-create-end', from: 2, to: 3, label: '', kind: 'normal' }
        ],
        resources: [
          { name: 'OrderType', label: 'Order Type', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false },
          { name: 'Currency', label: 'Currency', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false },
          { name: 'Total', label: 'Total', type: 'Variable', dataType: 'Number', isCollection: false, availableForInput: true, availableForOutput: false },
          { name: 'Items', label: 'Items', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false }
        ],
        versions: []
      });
    }
    const kiosk = tenant.pages.find((p) => p.apiName === 'UNE_KIOSK');
    if (!kiosk) throw Error('UNE_KIOSK page is missing');
    kiosk.status = 'Active';
    kiosk.activationAssignments ??= [];
    if (!kiosk.activationAssignments.some((a) => a.appId === 'Records' && a.profileId === 'kiosk-user')) {
      kiosk.activationAssignments.push({
        id: randomUUID(), scope: 'App and Profile', appId: 'Records',
        profileId: 'kiosk-user', recordTypeId: null, formFactors: ['Desktop', 'Phone']
      });
    }
    for (const component of kiosk.components) {
      if (component.type !== 'Custom:KioskOrderingExperience') continue;
      component.properties = {
        ...component.properties,
        objectApiName: 'Product__c',
        nameField: 'Name', priceField: 'Price__c', imageField: 'Image__c',
        categoryField: 'Category__c', descriptionField: 'Description__c',
        filters: [{ field: 'Available__c', operator: 'Equals', value: 'true' }],
        checkoutFlowApiName: 'KIOSK_BILLING'
      };
      // Prevent fallback to the embedded demo catalogue; runtime now resolves records via metadata.
      delete component.properties.products;
      delete component.properties.categories;
    }
    await writeRelationalState(pool, state, previous);
    console.log('Kiosk test accounts, profiles and editable metadata configured');
  } finally {
    await pool.end();
  }
}
