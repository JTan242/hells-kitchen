import { Suspense } from 'react';
import Link from 'next/link';
import { fetchFacets, fetchRecipes } from '@/lib/api';
import { Filters } from '@/components/Filters';
import { RecipeCard } from '@/components/RecipeCard';
import { ErrorBox } from '@/components/ErrorBox';

/** Next 15 passes search params as a promise; every value can also be an array. */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Pass-through: UI and API use the same filter names, and the API ignores
 *  anything it does not recognise. */
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

  // Independent requests, so they run concurrently.
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

      {/* useSearchParams requires a Suspense boundary. */}
      <Suspense fallback={<p className="result-count">{result.total} recipes</p>}>
        {facets instanceof Error ? (
          <p className="result-count">{result.total} recipes (filters unavailable)</p>
        ) : (
          <Filters facets={facets} resultCount={result.total} />
        )}
      </Suspense>

      {/* Explains why an allergen filter returned fewer recipes than expected. */}
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
