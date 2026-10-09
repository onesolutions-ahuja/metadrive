
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

type ApiResponse<T> = { data: T };

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}`);
  }

  return { data };
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });

type ObjectMetadata = {
  id: number;
  api_name: string;
  label: string;
};

async function resolveObjectName(objectId: number): Promise<string> {
  const { data } = await request<ObjectMetadata[]>('/api/metadata/objects');
  const object = data.find((item) => Number(item.id) === Number(objectId));

  if (!object) {
    throw new Error(`Object ${objectId} not found`);
  }

  return object.api_name;
}

export const api = {
  getObjects: () =>
    request<ObjectMetadata[]>('/api/metadata/objects'),

  createObject: (data: unknown) =>
    post('/api/metadata/objects', data),

  getFields: (objectId: number) =>
    request<any[]>(`/api/metadata/objects/${objectId}/fields`),

  createField: (data: unknown) =>
    post('/api/metadata/fields', data),

  getRecords: async (objectId: number) => {
    const name = await resolveObjectName(objectId);
    return request<any[]>(`/api/records/${encodeURIComponent(name)}`);
  },

  createRecord: async (input: {
    object_id: number;
    data: Record<string, unknown>;
  }) => {
    const name = await resolveObjectName(input.object_id);
    return post(`/api/records/${encodeURIComponent(name)}`, input.data);
  },

  runReport: (data: unknown) =>
    post<any[]>('/api/reports/aggregate', data),

  triggerFlow: (data: unknown) =>
    post<{ workflowId: string; runId: string }>(
      '/api/flows/trigger',
      data
    ),
};
