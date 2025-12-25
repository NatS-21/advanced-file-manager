export class ApiError extends Error {
  status: number;
  payload: any;
  constructor(status: number, payload: any) {
    super(payload?.error || `HTTP ${status}`);
    this.status = status;
    this.payload = payload;
  }
}

export async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiJson<T>(path, { method: 'GET' });
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  return apiJson<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

export async function apiPatch<T>(path: string, body?: any): Promise<T> {
  return apiJson<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiJson<T>(path, { method: 'DELETE' });
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}


