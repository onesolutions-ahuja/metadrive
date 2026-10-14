// Same-origin API for deployed builds and development's Vite /api proxy.
export const apiBase = import.meta.env.VITE_API_BASE_URL ?? `${window.location.origin}/api`;
let accessToken: string | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;
export function isAuthErrorMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('401')
    || text.includes('bearer access token required')
    || text.includes('access token is invalid or expired')
    || text.includes('access token has been revoked')
    || text.includes('refresh token')
    || text.includes('session-expired')
    || text.includes('unable to refresh the login session');
}

export function withAuthRefreshLock(refresh: () => Promise<Response>, signal?: AbortSignal): Promise<Response> {
  if (typeof navigator === 'undefined' || !navigator.locks) return refresh();
  // A request can wait behind another tab's Web Lock before fetch even starts.
  // Applying the abort signal to the lock itself bounds that wait as well.
  return navigator.locks.request('metadrive-auth-refresh', { signal }, refresh).then(async (response) => await response);
}

function refreshAccessToken() {
  if (!refreshInFlight) {
    const startedToken = accessToken;
    refreshInFlight = withAuthRefreshLock(() =>
      fetch(`${apiBase}/auth/refresh`, { method: 'POST', credentials: 'include' })
    )
      .then(async (response) => {
        if (!response.ok) {
          // Only expire the session if our token didn't change while refreshing.
          // Otherwise another tab already refreshed and we hold a stale in-memory token.
          if (accessToken === startedToken) {
            accessToken = undefined;
            window.dispatchEvent(new Event('metadrive:session-expired'));
          }
          return undefined;
        }
        const session = await response.json() as { access_token: string };
        accessToken = session.access_token;
        return accessToken;
      })
      .catch((error: unknown) => {
        if (accessToken === startedToken) {
          accessToken = undefined;
          window.dispatchEvent(new Event('metadrive:session-expired'));
        }
        throw new Error(`Unable to refresh the login session: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
  }
  return refreshInFlight;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string | undefined) => fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
      'X-MetaDrive-Request-Source': 'web-app'
    }
  });
  const sentToken = accessToken;
  let response = await send(sentToken);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    // If another request already refreshed while we were in flight, reuse that token.
    // Otherwise join the single shared refresh instead of firing N parallel refreshes
    // (parallel refreshes reuse the same rotation cookie -> family revoked -> logout).
    const token = accessToken !== undefined && accessToken !== sentToken
      ? accessToken
      : await refreshAccessToken();
    // Only retry once with a *different* token; retrying with the same/empty token
    // just repeats the 401 and can trigger another refresh loop.
    if (token && token !== sentToken) response = await send(token);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as T & { error?: string; details?: unknown };
  if (!response.ok) {
    const details = Array.isArray(payload.details)
      ? payload.details.map(String).join('; ')
      : typeof payload.details === 'string'
        ? payload.details
        : payload.details
          ? JSON.stringify(payload.details)
          : '';
    throw new ApiRequestError(
      `${payload.error ?? `Request failed (${response.status})`}${details ? `: ${details}` : ''}`,
      payload, response.status
    );
  }
  return payload;
}

export class ApiRequestError extends Error {
  constructor(message: string, readonly responseBody: unknown, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function loadAppCommunicationHistory(objectName: string, field: string, source: string, offset: number, search: string) {
  const params = new URLSearchParams({
    limit: '50', offset: String(offset), ...(field ? {filterField:field, filterValue:source} : {}),
    ...(search ? { search } : {})
  });
  return apiRequest<{ records: Array<{ Id: string; [key: string]: unknown }>; total: number }>(
    `/records/${encodeURIComponent(objectName)}?${params.toString()}`);
}

export async function loadConnectorMarketplaceApps() {
  const result = await apiRequest<{records: import('./ConnectorAppWorkspace').ConnectorApp[]}>(`/connector-apps/catalog`);
  return result.records;
}
export async function executeConnectorAppLifecycleFlow(apiName: string, appKey: string): Promise<void> {
  await apiRequest(`/flows/${encodeURIComponent(apiName)}/execute`, {
    method: 'POST', body: JSON.stringify({AppKey:appKey})
  });
}
export async function loadFlowScreenRecords(objectApiName: string): Promise<Record<string, unknown>[]> {
  const result = await apiRequest<{ records: Record<string, unknown>[] }>(`/records/${encodeURIComponent(objectApiName)}`);
  return result.records;
}


export function getAccessToken() { return accessToken; }
export function setAccessToken(value: string | undefined) { accessToken = value; }
