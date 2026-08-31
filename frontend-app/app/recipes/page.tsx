import { Suspense } from 'react';
import Link from 'next/link';
import { fetchFacets, fetchRecipes } from '@/lib/api';
import { Filters } from '@/components/Filters';
import { RecipeCard } from '@/components/RecipeCard';
import { ErrorBox } from '@/components/ErrorBox';

/** Next 15 passes search params as a promise; every value can also be an array. */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Turns the page's own search params back into a query string for the API.
 *
 * The filter names the UI uses and the ones the API accepts are deliberately the
 * same, so this is a pass-through. Anything the API does not recognise it ignores,
 * which is why no allow-list is needed here.
 */
function toQuery(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  return query;
}

export default async function RecipesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  // The list and the filter options are independent, so fetch them together
  // rather than waiting for one before starting the other.
  const [result, facets] = await Promise.all([
    fetchRecipes(toQuery(params)).catch((error: unknown) => error as Error),
    fetchFacets().catch((error: unknown) => error as Error),
  ]);

  if (result instanceof Error) {
    return <ErrorBox title="Could not load recipes" message={result.message} />;
  }

  return (
    <div className="stack">
      <div className="control-row">
        <Link href="/recipes/new" className="primary">
          + Add a recipe
        </Link>
      </div>

      {/* useSearchParams needs a Suspense boundary; the fallback is a plain
          count so the page never flashes empty. */}
      <Suspense fallback={<p className="result-count">{result.total} recipes</p>}>
        {facets instanceof Error ? (
          <p className="result-count">{result.total} recipes (filters unavailable)</p>
        ) : (
          <Filters facets={facets} resultCount={result.total} />
        )}
      </Suspense>

      {/* Say why an allergen filter returned fewer recipes than expected. Silently
          dropping them would look like a bug; explaining it is the whole point. */}
      {result.withheld > 0 && (
        <p className="notice">
          {result.withheld} {result.withheld === 1 ? 'recipe is' : 'recipes are'} hidden because
          their ingredient data is incomplete, so we cannot confirm they are free of the allergens
          you excluded.
        </p>
      )}

      {result.recipes.length === 0 ? (
        <div className="empty">
          <p>No recipes match these filters.</p>
          <p>Try removing a tag or widening the time limit.</p>
        </div>
      ) : (
        <div className="grid">
          {result.recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
