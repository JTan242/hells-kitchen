import type { Facets, NewRecipeInput, RecipeDetail, RecipeListResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/** Thrown for any non-2xx response, so callers can branch on `status`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Per-field messages from a 400, keyed the same way the form names its inputs. */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The only place that talks to the backend, so base URL, caching and error
 *  shaping are decided once. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // Results are filter-dependent, so stale data is worse than a round trip.
    response = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init });
  } catch {
    // fetch only rejects on transport failure, which usually means the API is down.
    throw new ApiError(`Cannot reach the recipe API at ${API_BASE}. Is the backend running?`, 0);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error: { message?: string; fields?: Record<string, string> } }).error
        : null;
    throw new ApiError(
      String(error?.message ?? response.statusText),
      response.status,
      error?.fields ?? {},
    );
  }

  return response.json() as Promise<T>;
}

/** Forwards the page's own search params, so new filters need no change here. */
export function fetchRecipes(params: URLSearchParams): Promise<RecipeListResponse> {
  const query = params.toString();
  return request<RecipeListResponse>(`/api/recipes${query ? `?${query}` : ''}`);
}

export function fetchRecipe(id: string): Promise<RecipeDetail> {
  return request<RecipeDetail>(`/api/recipes/${encodeURIComponent(id)}`);
}

export function fetchFacets(): Promise<Facets> {
  return request<Facets>('/api/facets');
}

/** A 400 arrives as an ApiError carrying per-field messages in `fields`. */
export function createRecipe(input: NewRecipeInput): Promise<RecipeDetail> {
  return request<RecipeDetail>('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
