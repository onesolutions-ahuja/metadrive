import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPageDependencies } from '../apps/web/src/pageDependencies.ts';

function fixture() {
  const page = {
    apiName: 'Sales_Home', label: 'Sales Home', pageType: 'App Page',
    targetObject: '', status: 'Active', layoutMode: 'template',
    canvasWidth: 1280, canvasHeight: 720, devices: ['Desktop'],
    components: [], activationAssignments: [{ appId: 'Sales', scope: 'App Default' }]
  };
  const scope = {
    apps: [{ apiName: 'Sales', navigationPageApiNames: ['Customer_Page'] },
      { apiName: 'Other', navigationPageApiNames: [] }],
    pages: [
      { apiName: 'Customer_Page', pageType: 'App Page', status: 'Active' },
      { apiName: 'Draft_Page', pageType: 'App Page', status: 'Draft' },
      { apiName: 'Other_Page', pageType: 'App Page', status: 'Active',
        activationAssignments: [{ appId: 'Other' }] }
    ],
    objects: [{ apiName: 'Account' }, { apiName: 'Product__c' }],
    reports: [], dashboards: [],
    flows: [
      { apiName: 'SAVE_ORDER', status: 'Active', flowType: 'Autolaunched Flow' },
      { apiName: 'SCREEN_ORDER', status: 'Active', flowType: 'Screen Flow' },
      { apiName: 'SCHEDULED', status: 'Active', flowType: 'Schedule-Triggered Flow' },
      { apiName: 'DRAFT_FLOW', status: 'Draft', flowType: 'Autolaunched Flow' }
    ],
    libraryComponents: []
  };
  return { page, scope };
}

const component = (properties, type = 'Custom:Sample') =>
  ({ id: 'component_1', label: 'Sample', type, properties, visible: true });
const dependency = (page, scope, kind, name) =>
  inspectPageDependencies(page, scope).find(item =>
    item.kind === kind && item.name === name && item.componentId === 'component_1');

test('existing record-list navigation keys match the actual route resolver', () => {
  const { page, scope } = fixture();
  page.components = [component({ actionFlows: {
    open: { actionType: 'Navigate', navigationTargetType: 'Record List',
      navigationObjectApiName: 'Account', navigationAppId: 'Sales' }
  } })];
  assert.equal(dependency(page, scope, 'Object', 'Account').status, 'Ready');
  page.components[0].properties.actionFlows.open.navigationObjectApiName = 'Gone__c';
  assert.equal(dependency(page, scope, 'Object', 'Gone__c').status, 'Missing');
});

test('navigation respects existing App Page membership and draft state', () => {
  const { page, scope } = fixture();
  page.components = [component({ actionFlows: {
    view: { actionType: 'Navigate', navigationTargetType: 'App Page',
      navigationAppId: 'Sales', navigationPageApiName: 'Customer_Page' }
  } })];
  assert.equal(dependency(page, scope, 'Page', 'Customer_Page').status, 'Ready');
  page.components[0].properties.actionFlows.view.navigationPageApiName = 'Draft_Page';
  assert.equal(dependency(page, scope, 'Page', 'Draft_Page').status, 'Inactive');
  page.components[0].properties.actionFlows.view.navigationPageApiName = 'Other_Page';
  assert.equal(dependency(page, scope, 'Page', 'Other_Page').status, 'Missing');
  page.components[0].properties.actionFlows.view.navigationPageApiName = 'Deleted_Page';
  assert.equal(dependency(page, scope, 'Page', 'Deleted_Page').status, 'Missing');
});

test('app-home references are checked against existing application metadata', () => {
  const { page, scope } = fixture();
  page.components = [component({ actionFlows: {
    home: { actionType: 'Navigate', navigationTargetType: 'App Home',
      navigationAppId: 'Sales' }
  } })];
  assert.equal(dependency(page, scope, 'Application', 'Sales').status, 'Ready');
  page.components[0].properties.actionFlows.home.navigationAppId = 'Unknown_App';
  assert.equal(dependency(page, scope, 'Application', 'Unknown_App').status, 'Missing');
});

test('implicit app routes stay contextual when editor has no app assignment', () => {
  const { page, scope } = fixture();
  page.activationAssignments = [];
  page.components = [component({ actionFlows: {
    page: { actionType: 'Navigate', navigationTargetType: 'App Page',
      navigationPageApiName: 'Customer_Page' },
    home: { actionType: 'Navigate', navigationTargetType: 'App Home' }
  } })];
  assert.equal(dependency(page, scope, 'Page', 'Customer_Page').status, 'Contextual');
  assert.equal(dependency(page, scope, 'Application', '(current application)').status, 'Contextual');
  scope.currentAppId = 'Sales';
  assert.equal(dependency(page, scope, 'Page', 'Customer_Page').status, 'Ready');
});

test('event flows use existing active executable flow definitions, not mere existence', () => {
  const { page, scope } = fixture();
  page.components = [component({ actionFlows: {
    save: { actionType: 'Flow', flowApiName: 'SAVE_ORDER' },
    screen: { flowApiName: 'SCREEN_ORDER' },
    schedule: { flowApiName: 'SCHEDULED' },
    draft: { flowApiName: 'DRAFT_FLOW' },
    missing: { flowApiName: 'MISSING' },
    malformed: ['invalid']
  } })];
  for (const [name, expected] of [
    ['SAVE_ORDER','Ready'],['SCREEN_ORDER','Ready'],['SCHEDULED','Inactive'],
    ['DRAFT_FLOW','Inactive'],['MISSING','Missing']
  ]) {
    assert.equal(dependency(page, scope, 'Flow', name).status, expected);
  }
  assert.equal(inspectPageDependencies(page, scope).some(x => x.name === 'malformed'), false);
});

test('generic Object bindings and registered custom components use existing metadata', () => {
  const { page, scope } = fixture();
  scope.libraryComponents = [{
    apiName: 'Sample', surfaces: ['page'], status: 'Published'
  }];
  page.components = [component({ objectApiName: 'Product__c' })];
  assert.equal(dependency(page, scope, 'Component', 'Sample').status, 'Ready');
  assert.equal(dependency(page, scope, 'Object', 'Product__c').status, 'Ready');
  page.components[0].properties.objectApiName = 'Uninstalled__c';
  assert.equal(dependency(page, scope, 'Object', 'Uninstalled__c').status, 'Missing');
});

test('invalid navigation kinds fail closed without throwing or executing handlers', () => {
  const { page, scope } = fixture();
  page.components = [component({ actionFlows: {
    bad: { actionType: 'Navigate', navigationTargetType: 'https://external.example' }
  } })];
  assert.equal(dependency(page, scope, 'Page', '(invalid destination)').status, 'Missing');
});
