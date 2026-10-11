// One-time metadata bootstrap for test kiosk accounts and ordering. Never hardcodes runtime business behaviour.
// Invoked only when METADRIVE_KIOSK_BOOTSTRAP=true; uses the checked relational state writer.
import pg from 'pg';
import { randomUUID, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { readRelationalState, writeRelationalState } from '../src/relational-runtime.mjs';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';

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
    // Object metadata is the single catalogue/cart/device schema. Devices hold references to
    // Named Credentials, never payment API keys or printer secrets.
    const ensureObject = (apiName, label, fields, description) => {
      let object = tenant.objects.find((candidate) => candidate.apiName === apiName);
      if (!object) {
        object = { apiName, label, pluralLabel: label + 's', kind: 'Custom Object',
          description, fields: [], recordTypes: [], pageLayouts: [] };
        tenant.objects.push(object);
      }
      for (const definition of fields) {
        if (!object.fields.some((existing) => existing.apiName === definition.apiName)) object.fields.push(definition);
      }
      return object;
    };
    const cartFields = [
      field('Name', 'Cart Name', 'Text', true),
      field('Session__c', 'Session ID', 'Text', true),
      field('Product__c', 'Product ID', 'Text', true),
      field('Quantity__c', 'Quantity', 'Number', true),
      field('Unit_Price__c', 'Unit Price', 'Currency', true)
    ];
    const deviceFields = [
      field('Name', 'Device Name', 'Text', true),
      field('Type__c', 'Device Type', 'Text', true),
      field('Connection_Type__c', 'Connection Type', 'Text'),
      field('Named_Credential_Id__c', 'Named Credential Reference', 'Text'),
      field('Agent_Endpoint__c', 'Agent Endpoint (HTTPS)', 'URL'),
      field('Store__c', 'Store', 'Text'),
      field('Terminal__c', 'Terminal', 'Text'),
      field('Enabled__c', 'Enabled', 'Checkbox'),
      field('Capabilities__c', 'Capabilities', 'LongTextArea')
    ];
    ensureObject('CartLine__c', 'Cart Line', cartFields, 'Temporary session-scoped cart line; all mutations use Flow');
    ensureObject('NamedDevice__c', 'Named Device', deviceFields, 'Tenant-owned hardware definition referencing secured Named Credentials');
    ensureObject('ProductCategory__c', 'Product Category', [
      field('Name', 'Category', 'Text', true),
      field('Image__c', 'Image', 'URL'), field('Sort_Order__c', 'Sort Order', 'Number')
    ], 'Reusable product navigation categories');
    ensureObject('ProductModifier__c', 'Product Modifier', [
      field('Name', 'Modifier', 'Text', true), field('Product__c', 'Product', 'Text', true),
      field('Price__c', 'Price', 'Currency'), field('Available__c', 'Available', 'Checkbox')
    ], 'Product customisations and extras');
    ensureObject('Cart__c', 'Cart', [
      field('Name', 'Cart Name', 'Text', true), field('Session__c', 'Session ID', 'Text', true),
      field('Status__c', 'Status', 'Text'), field('Order_Type__c', 'Order Type', 'Text')
    ], 'Temporary session header; can be linked to Sale at checkout');
    ensureObject('PaymentTransaction__c', 'Payment Transaction', [
      field('Name', 'Payment Reference', 'Text', true), field('Sale__c', 'Sale', 'Text'),
      field('Device__c', 'Named Device', 'Text'), field('Provider_Reference__c', 'Provider Reference', 'Text'),
      field('Amount__c', 'Amount', 'Currency'), field('Status__c', 'Status', 'Text')
    ], 'Provider-verified payment events, not kiosk client claims');
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
        id, label, apiName: label.replace(/[^A-Za-z0-9]+/g, '_'),
        isStandard: false, description: label + ' test profile for kiosk or till',
        systemPermissions: ['flows:run'],
        objectPermissions: {
          Product__c: { ...grants },
          CartLine__c: { ...grants, create: true, edit: true, delete: true },
          Sale__c: { ...grants, create: true, edit: true }
        },
        fieldPermissions: Object.fromEntries([
          ...productFields.map((f) => ['Product__c.' + f.apiName, { read: true, edit: false }]),
          ...cartFields.map((f) => ['CartLine__c.' + f.apiName, { read: true, edit: true }]),
          ...saleFields.map((f) => ['Sale__c.' + f.apiName, { read: true, edit: true }])
        ])
      });
      tenant.accessControl.profiles.push(profile);
      return profile;
    };
    createProfile('till-user', 'TillUser');
    createProfile('kiosk-user', 'KioskUser');
    // Existing profile assignments are preserved; add only the new cart permissions.
    for (const id of ['till-user', 'kiosk-user']) {
      const profile = tenant.accessControl.profiles.find((candidate) => candidate.id === id);
      if (!profile) continue;
      profile.objectPermissions ??= {};
      profile.objectPermissions.CartLine__c = { ...grants, create: true, edit: true, delete: true };
      profile.fieldPermissions ??= {};
      for (const f of cartFields) profile.fieldPermissions['CartLine__c.' + f.apiName] = { read: true, edit: true };
      profile.objectPermissions.Product__c ??= { ...grants };
      for (const f of productFields) profile.fieldPermissions['Product__c.' + f.apiName] ??= { read: true, edit: false };
    }

    // RBAC permissions remain ordinary profile grants; no administrator bypass in runtime.
    const administratorProfile = tenant.accessControl.profiles.find((candidate) => candidate.id === 'system-administrator');
    if (administratorProfile) {
      administratorProfile.objectPermissions ??= {};
      administratorProfile.fieldPermissions ??= {};
      for (const objectName of ['Product__c', 'Cart__c', 'CartLine__c', 'ProductCategory__c',
        'ProductModifier__c', 'NamedDevice__c', 'PaymentTransaction__c']) {
        administratorProfile.objectPermissions[objectName] = {
          read: true, create: true, edit: true, delete: true, viewAll: true, modifyAll: true
        };
        const object = tenant.objects.find((candidate) => candidate.apiName === objectName);
        for (const f of object?.fields ?? []) {
          administratorProfile.fieldPermissions[objectName + '.' + f.apiName] = { read: true, edit: true };
        }
      }
    }
    const kioskProfile = tenant.accessControl.profiles.find((candidate) => candidate.id === 'kiosk-user');
    if (kioskProfile) {
      kioskProfile.objectPermissions.NamedDevice__c = { ...grants };
      for (const f of deviceFields) {
        kioskProfile.fieldPermissions['NamedDevice__c.' + f.apiName] = { read: true, edit: false };
      }
    }
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
    const resource = (name, dataType, direction = 'input', type = 'Variable') => ({
      name, label: name.replace(/([a-z])([A-Z])/g, '$1 $2'), type, dataType,
      isCollection: false, availableForInput: direction === 'input', availableForOutput: direction === 'output'
    });
    const connector = (from, to, label = '') =>
      ({ id: 'kiosk-' + from + '-' + to + '-' + (label || 'next'), from, to, label, kind: 'normal' });
    const flow = (apiName, label, elements, connectors, resources, status = 'Active') => ({
      apiName, label, description: 'Editable metadata Flow; uses record permissions and tenant objects',
      flowType: apiName === 'KIOSK_CHECKOUT' ? 'Screen Flow' : 'Autolaunched Flow',
      status, versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements, connectors, resources, versions: []
    });
    const getProduct = { id: 2, type: 'Get Records', label: 'Read current product and price', config: {
      object: 'Product__c', conditions: [
        { field: 'Id', operator: 'Equals', value: '{!ProductId}' },
        { field: 'Available__c', operator: 'Equals', value: true }
      ], outputVariable: 'SelectedProduct'
    } };
    const cartInputs = [resource('SessionId', 'Text'), resource('LineId', 'Text')];
    const kioskFlows = [
      flow('KIOSK_CART_ADD', 'Kiosk - Add product', [
        { id: 1, type: 'Start', label: 'Add', config: {} },
        getProduct,
        { id: 3, type: 'Decision', label: 'Product exists?', config: {
          outcomes: [{ name: 'Found', label: 'Found', conditions: [
            { field: '{!SelectedProduct.Id}', operator: 'Is Not Null' },
            { field: '{!Quantity}', operator: 'Greater Than', value: 0 }
          ] }]
        } },
        { id: 4, type: 'Create Records', label: 'Create cart line', config: {
          object: 'CartLine__c', fieldValues: [
            { field: 'Name', value: '{!SelectedProduct.Name}' },
            { field: 'Session__c', value: '{!SessionId}' },
            { field: 'Product__c', value: '{!ProductId}' },
            { field: 'Quantity__c', value: '{!Quantity}' },
            { field: 'Unit_Price__c', value: '{!SelectedProduct.Price__c}' }
          ]
        } },
        { id: 5, type: 'End', label: 'End', config: {} }
      ], [connector(1,2),connector(2,3),connector(3,4,'Found'),connector(3,5,'Default Outcome'),connector(4,5)], [
        resource('SessionId','Text'),resource('ProductId','Text'),resource('Quantity','Number'),
        resource('SelectedProduct','Product__c','internal','Record')
      ]),
      flow('KIOSK_CART_QUANTITY', 'Kiosk - Change quantity', [
        { id: 1, type: 'Start', label: 'Edit quantity', config: {} },
        { id: 2, type: 'Decision', label: 'Positive quantity?', config: {
          outcomes: [{ name: 'Positive', label: 'Positive', conditions: [
            { field: '{!Quantity}', operator: 'Greater Than', value: 0 }
          ] }]
        } },
        { id: 3, type: 'Update Records', label: 'Update own session line', config: {
          object: 'CartLine__c', conditions: [
            { field: 'Id', operator: 'Equals', value: '{!LineId}' },
            { field: 'Session__c', operator: 'Equals', value: '{!SessionId}' }
          ], fieldValues: [{ field: 'Quantity__c', value: '{!Quantity}' }]
        } },
        { id: 4, type: 'End', label: 'End', config: {} }
      ],[connector(1,2),connector(2,3,'Positive'),connector(2,4,'Default Outcome'),connector(3,4)],[
        ...cartInputs,resource('Quantity','Number')
      ]),
      flow('KIOSK_CART_REMOVE', 'Kiosk - Remove line', [
        { id: 1, type: 'Start', label: 'Remove', config: {} },
        { id: 2, type: 'Delete Records', label: 'Delete own session line', config: {
          object: 'CartLine__c', conditions: [
            { field: 'Id', operator: 'Equals', value: '{!LineId}' },
            { field: 'Session__c', operator: 'Equals', value: '{!SessionId}' }
          ]
        } },
        { id: 3, type: 'End', label: 'End', config: {} }
      ],[connector(1,2),connector(2,3)],cartInputs),
      flow('KIOSK_CART_RESET', 'Kiosk - Clear session', [
        { id: 1, type: 'Start', label: 'Clear', config: {} },
        { id: 2, type: 'Delete Records', label: 'Remove all session lines', config: {
          object: 'CartLine__c', conditions: [{ field: 'Session__c', operator: 'Equals', value: '{!SessionId}' }]
        } },
        { id: 3, type: 'End', label: 'End', config: {} }
      ],[connector(1,2),connector(2,3)],[resource('SessionId','Text')]),
      flow('KIOSK_CHECKOUT', 'Kiosk - Payment and receipt (configure device)', [
        { id: 1, type: 'Start', label: 'Start checkout', config: {} },
        { id: 2, type: 'Screen', label: 'Payment provider required', config: {
          fields: [{ type: 'Display Text', label: 'Device setup', text: 'Configure a payment Named Credential and a Named Device. Add payment confirmation, receipt and Sale creation steps before activating this Flow.' }]
        } },
        { id: 3, type: 'End', label: 'End', config: {} }
      ],[connector(1,2),connector(2,3)],[resource('SessionId','Text'),resource('OrderType','Text')],'Draft')
    ];
    for (const candidate of kioskFlows) {
      if (!tenant.flows.some((existing) => existing.apiName === candidate.apiName)) tenant.flows.push(candidate);
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
    const componentApiName = 'KioskOrderingExperience';
    const sourceFile = new URL('../../web/src/custom-components/KioskOrderingExperience/KioskOrderingExperience.jsx', import.meta.url);
    const stylesheetFile = new URL('../../web/src/custom-components/KioskOrderingExperience/KioskOrderingExperience.css', import.meta.url);
    const jsxSource = readFileSync(sourceFile, 'utf8');
    const cssSource = readFileSync(stylesheetFile, 'utf8');
    const compiledJs = (await transform(jsxSource, { loader: 'jsx', format: 'cjs', jsx: 'transform', target: 'es2020' })).code;
    state.libraryComponents ??= [];
    const existingComponent = state.libraryComponents.find((c) => c.apiName === componentApiName);
    const componentMetadata = {
      apiName: componentApiName, label: 'Kiosk Ordering Experience',
      description: 'Object- and field-bound product ordering with editable checkout Flow',
      surfaces: ['page', 'dashboard', 'flow'],
      resize: { defaultWidth: 1080, defaultHeight: 1920, minWidth: 320, minHeight: 600 },
      jsxSource, cssSource, compiledJs, scopedCss: cssSource,
      version: existingComponent ? existingComponent.version + (existingComponent.jsxSource === jsxSource ? 0 : 1) : 1,
      updatedAt: existingComponent?.updatedAt ?? new Date().toISOString()
    };
    if (!existingComponent) state.libraryComponents.push(componentMetadata);
    else if (existingComponent.jsxSource !== jsxSource || existingComponent.cssSource !== cssSource) {
      Object.assign(existingComponent, componentMetadata, { updatedAt: new Date().toISOString() });
    }
    kiosk.layoutMode = 'free-canvas';
    kiosk.canvasWidth = kiosk.canvasWidth || 1080;
    kiosk.canvasHeight = kiosk.canvasHeight || 1920;
    kiosk.components = [{
      id: 'kiosk-ordering-experience', type: 'Custom:KioskOrderingExperience',
      label: 'Interactive Ordering Kiosk', region: 'main', visible: true,
      position: { x: 0, y: 0, width: kiosk.canvasWidth, height: kiosk.canvasHeight },
      properties: {
        libraryComponentId: componentApiName,
        objectApiName: 'Product__c', nameField: 'Name',
        priceField: 'Price__c', imageField: 'Image__c',
        categoryField: 'Category__c', descriptionField: 'Description__c',
        filters: [{ field: 'Available__c', operator: 'Equals', value: 'true' }],
        cartObjectApiName: 'CartLine__c', cartSessionField: 'Session__c',
        cartProductField: 'Product__c', cartQuantityField: 'Quantity__c', cartPriceField: 'Unit_Price__c',
        actionFlows: {
          add: { flowApiName: 'KIOSK_CART_ADD', inputs: { SessionId: '$session', ProductId: '$event.productId', Quantity: '$event.quantity' } },
          quantity: { flowApiName: 'KIOSK_CART_QUANTITY', inputs: { SessionId: '$session', LineId: '$event.lineId', Quantity: '$event.quantity' } },
          remove: { flowApiName: 'KIOSK_CART_REMOVE', inputs: { SessionId: '$session', LineId: '$event.lineId' } },
          reset: { flowApiName: 'KIOSK_CART_RESET', inputs: { SessionId: '$session' }, resetSessionOnSuccess: true }
        },
        brandName: 'Your Restaurant', tagline: 'Made fresh for you',
        accentColor: '#ffca26', inkColor: '#202124', currency: '£'
      }
    }];
    await writeRelationalState(pool, state, previous);
    console.log('Kiosk test accounts, profiles and editable metadata configured');
  } finally {
    await pool.end();
  }
}
