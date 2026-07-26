import { msalInstance } from '../auth/msalConfig';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getToken(): Promise<string | null> {
  if (!authEnabled) return null;

  const account = msalInstance.getAllAccounts()[0];
  if (!account) return null;

  try {
    const response = await msalInstance.acquireTokenSilent({
      scopes: ['openid', 'profile'],
      account,
    });
    return response.accessToken;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`;
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    ...options,
  });

  if (response.status === 401 && authEnabled) {
    msalInstance.logoutRedirect();
    throw new ApiError(401, 'Unauthorized: session expired');
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new ApiError(response.status, errorBody);
  }

  return response.json();
}

export async function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export async function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
