import type {
  ApiError,
  SearchRequest,
  SearchRunResponse,
  StartSearchResponse,
} from './contract';

/** An API failure carrying the server's structured error, when it sent one. */
export class ApiRequestError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
    readonly code: string,
    /** `{ field: message }` when validation rejected the form. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const NETWORK_MESSAGE =
  'Could not reach the search API. Check that the backend is running on port 4000.';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(NETWORK_MESSAGE, 0, 'NETWORK');
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as { error?: ApiError } | null)?.error;
    throw new ApiRequestError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code ?? 'UNKNOWN',
      isFieldMap(error?.details) ? error.details : undefined,
    );
  }

  return body as T;
}

function isFieldMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

export const api = {
  startSearch: (body: SearchRequest) =>
    request<StartSearchResponse>('/api/search-hotels', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getSearch: (searchId: string) =>
    request<SearchRunResponse>(`/api/search-hotels/${encodeURIComponent(searchId)}`),

  cancelSearch: (searchId: string) =>
    request<{ searchId: string }>(
      `/api/search-hotels/${encodeURIComponent(searchId)}/cancel`,
      { method: 'POST' },
    ),

  getCities: () => request<{ cities: string[] }>('/api/cities'),

  getHealth: () => request<{ ok: boolean; temporal: string; taskQueue: string }>('/api/health'),
};
