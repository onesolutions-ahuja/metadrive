// Inspect installed POS metadata through the existing authenticated API.
// No Object, component, page, Flow or permission metadata is written.
import {createHash} from 'node:crypto';
const origin = process.env.METADRIVE_API_URL;
const expectedTenant = process.env.METADRIVE_EXPECTED_TENANT_ID;
const email = process.env.METADRIVE_TEST_EMAIL;
const password = process.env.METADRIVE_TEST_PASSWORD;
if (!origin || !expectedTenant || !email || !password) throw Error('Missing tenant inspection configuration');
const base = new URL(origin);
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
    || base.pathname !== '/') throw Error('Expected an HTTPS API origin');
let token = '';
async function api(path, body) {
  const response = await fetch(new URL('/api' + path, base), {
    method: body ? 'POST' : 'GET',
    headers: {accept: 'application/json', ...(token ? {authorization: 'Bearer ' + token} : {}),
      ...(body ? {'content-type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw Error('Tenant inspection failed: ' + path + ' HTTP ' + response.status);
  return response.json();
}
const login = await api('/auth/login', {email, password});
if (login.user?.tenantId !== expectedTenant) throw Error('Unexpected tenant; no metadata inspected');
token = login.access_token;
if (typeof token !== 'string' || !token) throw Error('No authenticated access token');
const keys = value => Object.keys(value ?? {}).sort();
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const [objectData, pageData, flowData] = await Promise.all([
  api('/metadata/objects'), api('/metadata/pages'), api('/metadata/flows')
]);
for (const [data, key] of [[objectData, 'objects'], [pageData, 'pages'], [flowData, 'flows']]) {
  if (!Array.isArray(data[key])) throw Error('Unexpected metadata response: ' + key);
}
const objectNames = ['Product', 'Invoice', 'InvoiceItem'];
const pageNames = ['UK_OFFLICENCE_TILL', 'UK_OFFLICENCE_CUSTOMER'];
const flowNames = ['UK_OFFLICENCE_POS_CHECKOUT'];
const objects = objectNames.map(apiName => {
  const object = objectData.objects.find(item => item.apiName === apiName);
  return object ? {apiName, fingerprint: fingerprint(object), fields: (object.fields ?? []).map(field => ({
    apiName: field.apiName, dataType: field.dataType, required: field.required, unique: field.unique,
    ...(field.relationship ? {relationship: {
      type: field.relationship.type, targetObject: field.relationship.targetObject,
      deleteBehavior: field.relationship.deleteBehavior
    }} : {})
  }))} : {apiName, missing: true};
});
const pages = pageNames.map(apiName => {
  const page = pageData.pages.find(item => item.apiName === apiName);
  return page ? {apiName, status: page.status, fingerprint: fingerprint(page),
    layoutMode: page.layoutMode, template: page.template, devices: page.devices,
    components: (page.components ?? []).map(component => ({
      id: component.id, type: component.type, region: component.region,
      propertyKeys: keys(component.properties),
      actionFlows: Object.fromEntries(Object.entries(component.properties?.actionFlows ?? {}).map(
        ([event, binding]) => [event, {flowApiName: binding.flowApiName, inputNames: keys(binding.inputs)}]))
    }))} : {apiName, missing: true};
});
const flows = flowNames.map(apiName => {
  const flow = flowData.flows.find(item => item.apiName === apiName);
  return flow ? {apiName, status: flow.status, activeVersion: flow.activeVersion,
    fingerprint: fingerprint(flow), flowType: flow.flowType,
    elements: (flow.elements ?? []).map(element => ({
      id: element.id, type: element.type, configKeys: keys(element.config),
      object: element.config?.object,
      screenFields: (element.config?.fields ?? []).map(field => ({
        apiName: field.apiName, type: field.type, required: field.required
      }))
    })),
    resources: (flow.resources ?? []).map(resource => ({
      name: resource.name, type: resource.type, dataType: resource.dataType,
      isCollection: resource.isCollection, availableForInput: resource.availableForInput,
      availableForOutput: resource.availableForOutput
    }))
  } : {apiName, missing: true};
});
const catalog = await api('/connector-apps/catalog');
if (!Array.isArray(catalog.records)) throw Error('Unexpected package catalog response');
const installedPackage = catalog.records.find(record => record.AppKey__c === 'uk-offlicence-pos');
const packageStatus = installedPackage ? {
  found: true, installed: installedPackage.Installed__c === true,
  licenceStatus: installedPackage.LicenceStatus__c
} : {found: false};
console.log('POS_TENANT_METADATA ' + JSON.stringify({
  inspectedAt: new Date().toISOString(), tenantMatched: true, packageStatus, objects, pages, flows,
  commerceCandidates: objectData.objects.filter(object =>
    /product|invoice|till|session|stock|refund|receipt|payment|discount|shift/i.test(object.apiName)
  ).map(object => ({apiName: object.apiName, fields: (object.fields ?? []).map(field =>
    ({apiName: field.apiName, dataType: field.dataType}))}))
}));
