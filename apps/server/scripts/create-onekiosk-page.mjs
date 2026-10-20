import { kioskMenuDraft } from '../src/app-seeders/onekiosk-menu.ts';

// One-time, opt-in, tenant-scoped creation through the existing authenticated
// MetaDrive Page API. No direct SQL, no new renderer and no credential output.
const env = key => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Required configuration missing: ${key}`);
  return value;
};
const base = env('METADRIVE_API_BASE_URL').replace(/\/$/, '');
if (!/^https:\/\//.test(base)) throw new Error('HTTPS API base required');
if (process.env.ONEKIOSK_APPROVE_CREATE !== 'Kiosk_Menu') {
  throw new Error('Explicit Kiosk_Menu approval required');
}
const json = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options, headers: { 'content-type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`MetaDrive API failed: ${response.status} ${url.replace(base, '')}`);
  return body;
};
const login = await json(`${base}/auth/login`, {
  method: 'POST',
  body: JSON.stringify({
    tenantSlug: env('METADRIVE_TENANT_SLUG'),
    email: env('METADRIVE_LOGIN_EMAIL'),
    password: env('METADRIVE_LOGIN_PASSWORD')
  })
});
if (login.mfa_required || !login.access_token) throw new Error('Login requires interactive authentication or failed');
const headers = { Authorization: `Bearer ${login.access_token}` };
const name = 'Kiosk_Menu';
// Never overwrite an existing tenant page, including an unpublished draft.
const current = await fetch(`${base}/metadata/pages/${name}`, { headers, signal: AbortSignal.timeout(15000) });
if (current.ok) {
  console.log('Kiosk_Menu already exists; untouched');
  process.exit(0);
}
if (current.status !== 404) throw new Error(`Cannot verify page absence: HTTP ${current.status}`);
const objectName = env('ONEKIOSK_MENU_OBJECT_API');
const fields = await json(`${base}/metadata/objects`, { headers });
const objects = Array.isArray(fields) ? fields : fields.objects ?? [];
const object = objects.find(o => o.apiName === objectName);
if (!object) throw new Error('Configured menu object was not found in authenticated tenant metadata');
const fieldNames = new Set((object.fields ?? []).map(f => f.apiName));
const namedField = key => {
  const value = env(key);
  if (!fieldNames.has(value)) throw new Error(`Configured field missing: ${key}`);
  return value;
};
const optionalField = key => {
  const value = process.env[key]?.trim();
  if (value && !fieldNames.has(value)) throw new Error(`Configured field missing: ${key}`);
  return value;
};
const page = kioskMenuDraft({
  productObjectApiName: objectName,
  nameFieldApiName: namedField('ONEKIOSK_NAME_FIELD_API'),
  priceFieldApiName: namedField('ONEKIOSK_PRICE_FIELD_API'),
  imageFieldApiName: optionalField('ONEKIOSK_IMAGE_FIELD_API'),
  categoryFieldApiName: optionalField('ONEKIOSK_CATEGORY_FIELD_API')
});
const result = await json(`${base}/metadata/pages/${name}`, {
  method: 'PUT', headers, body: JSON.stringify(page)
});
if (result.page?.apiName !== name) throw new Error('Page save response missing expected API name');
const saved = await json(`${base}/metadata/pages/${name}`, { headers });
if (saved.page?.apiName !== name || saved.page?.components?.length !== page.components.length) {
  throw new Error('Page read-back verification failed');
}
console.log('Kiosk_Menu draft saved and verified as editable tenant metadata');