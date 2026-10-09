import { isIP } from 'node:net';

export type ConnectorTestResult = {
  status: 'Connected' | 'Failed' | 'Not configured' | 'Test unavailable';
  message: string;
};

type Definition = {
  authType: 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY';
  baseUrl: string;
  authHeader?: string;
  authCredential?: string;
  credentialsSchema: Array<{ name: string; required: boolean; secret: boolean }>;
  test?: {
    method: 'GET' | 'HEAD';
    path: string;
    expectedStatus: number;
    responseValidation?: { jsonPath: string; equals: string };
  };
  timeoutMs: number;
};

type TestResponse = { status: number; body: unknown; headers: unknown };
type Requester = (url: URL, method: 'GET' | 'HEAD', headers: Record<string, string>, timeoutMs: number) => Promise<TestResponse>;

const missing = (name: string): ConnectorTestResult =>
  ({ status: 'Not configured', message: `Required configuration is missing: ${name}.` });

export async function executeConnectorTest(
  definition: Definition,
  configuration: Record<string, unknown>,
  credentials: Record<string, string>,
  request: Requester
): Promise<ConnectorTestResult> {
  const test = definition.test;
  if (!test) return { status: 'Test unavailable', message: 'No safe read-only test is configured for this provider.' };
  if (!['GET', 'HEAD'].includes(test.method)) return { status: 'Test unavailable', message: 'Only read-only connector tests are supported.' };

  const headers: Record<string, string> = { accept: 'application/json' };
  for (const field of definition.credentialsSchema) {
    if (field.required && !credentials[field.name] && !configuration[field.name]) return missing(field.name);
  }

  const credential = (preferred: string, fallback: string) =>
    credentials[definition.authCredential || preferred] || credentials[fallback];
  switch (definition.authType) {
    case 'BEARER': {
      const token = credential('access_token', 'access_token');
      if (!token) return missing('access_token');
      headers.authorization = `Bearer ${token}`;
      break;
    }
    case 'BASIC': {
      const username = credentials.username;
      const password = credentials.password;
      if (!username || !password) return missing('username/password');
      headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      break;
    }
    case 'API_KEY': {
      const key = credential('api_key', 'api_key');
      if (!key || !definition.authHeader) return missing('API key or authentication header');
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(definition.authHeader)
        || /^(authorization|host|cookie|proxy-authorization|connection|transfer-encoding|content-length)$/i.test(definition.authHeader))
        return { status: 'Failed', message: 'Unsafe API key header configuration.' };
      headers[definition.authHeader] = key;
      break;
    }
  }

  let path = test.path;
  for (const [name, value] of Object.entries({ ...configuration, ...credentials })) {
    if (typeof value === 'string' || typeof value === 'number') {
      path = path.replaceAll(`{${name}}`, encodeURIComponent(String(value)));
    }
  }
  if (/{[^}]+}/.test(path)) return { status: 'Not configured', message: 'A required test path parameter is missing.' };
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('#') ||
      /%2f|%5c|%2e%2e/i.test(path) || path.split(/[/?]/).includes('..'))
    return { status: 'Failed', message: 'Unsafe connector test path.' };

  let base: URL;
  try { base = new URL(definition.baseUrl); }
  catch { return { status: 'Failed', message: 'Invalid provider URL.' }; }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || isIP(base.hostname)
    || base.hostname === 'localhost' || base.hostname.endsWith('.localhost'))
    return { status: 'Failed', message: 'Test requires a public HTTPS provider URL.' };

  const url = new URL(base.origin + base.pathname.replace(/\/$/, '') + path);
  if (url.origin !== base.origin || url.protocol !== 'https:')
    return { status: 'Failed', message: 'Test URL may not leave the provider host.' };

  try {
    const response = await request(url, test.method, headers, definition.timeoutMs);
    if (response.status !== test.expectedStatus)
      return { status: 'Failed', message: `Provider returned HTTP ${response.status}; expected ${test.expectedStatus}.` };
    if (test.responseValidation) {
      const keys = test.responseValidation.jsonPath.replace(/^\$\.?/, '').split('.').filter(Boolean);
      let value: unknown = response.body;
      for (const key of keys) {
        if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) {
          value = undefined; break;
        }
        value = (value as Record<string, unknown>)[key];
      }
      if (String(value ?? '') !== test.responseValidation.equals)
        return { status: 'Failed', message: 'Provider response did not match the configured validation.' };
    }
    return { status: 'Connected', message: 'Provider test completed successfully.' };
  } catch {
    return { status: 'Failed', message: 'Could not reach the provider or the request timed out.' };
  }
}
