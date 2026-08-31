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

/**
 * The single place that talks to the backend. Every call goes through here so
 * error handling, the base URL, and caching policy are decided once rather than
 * re-invented at each call site.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // `no-store`: the data is filter-dependent and cheap to fetch, and stale
    // results after a filter change would be worse than a round trip.
    response = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init });
  } catch {
    // fetch only rejects on a transport failure, which almost always means the
    // API is not running. Say that, rather than surfacing "fetch failed".
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

/**
 * Filters live in the page URL, so this takes the URL's own search params and
 * forwards them. Adding a filter means touching the UI and the API, not this.
 */
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

/**
 * Creates a recipe. A 400 comes back as an ApiError carrying `fields`, so the
 * form can put each message next to the input it belongs to.
 */
export function createRecipe(input: NewRecipeInput): Promise<RecipeDetail> {
  return request<RecipeDetail>('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
