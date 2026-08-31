import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, fetchRecipe } from '@/lib/api';
import { ErrorBox } from '@/components/ErrorBox';
import { ServingScaler } from '@/components/ServingScaler';
import { formatDate } from '@/lib/format';
import type { RecipeDetail } from '@/lib/types';

type Params = Promise<{ id: string }>;

/**
 * Fetch once and return either the recipe or the error, so the page can tell a
 * genuine 404 apart from "the API is down" — those deserve different screens.
 *
 * Wrapped in React's `cache` because Next calls `generateMetadata` and the page
 * component separately: without it, one page view would hit the API twice.
 */
const load = cache(async (id: string): Promise<RecipeDetail | ApiError> => {
  try {
    return await fetchRecipe(id);
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const recipe = await load(id);
  if (recipe instanceof ApiError) {
    // A 404 and an unreachable API are different failures; the tab title says which.
    return { title: recipe.status === 404 ? 'Recipe not found' : 'Recipe unavailable' };
  }
  return { title: `${recipe.title} · Recipe Manager`, description: recipe.description };
}

export default async function RecipePage({ params }: { params: Params }) {
  const { id } = await params;
  const recipe = await load(id);

  if (recipe instanceof ApiError) {
    // A missing recipe is Next's own not-found screen; anything else is our problem.
    if (recipe.status === 404) notFound();
    return <ErrorBox title="Could not load this recipe" message={recipe.message} />;
  }

  return (
    <div className="stack">
      <p className="result-count">
        <Link href="/recipes">← All recipes</Link>
      </p>

      <header className="detail-header stack" style={{ gap: 12 }}>
        <div>
          <h2>{recipe.title}</h2>
          <p>{recipe.description}</p>
        </div>

        <div className="chips">
          {recipe.dietary.map((term) => (
            <span key={term} className="chip static" aria-label={`Dietary: ${term}`}>
              {term}
            </span>
          ))}
          {recipe.tags
            .filter((tag) => !recipe.dietary.includes(tag))
            .map((tag) => (
              <span key={tag} className="chip static">
                {tag}
              </span>
            ))}
        </div>

        <div className="meta">
          <span>Prep {recipe.prepTime}</span>
          <span>Cook {recipe.cookTime}</span>
          <span>{recipe.totalTimeMinutes} min total</span>
          <span>{recipe.difficulty}</span>
          <span>Added {formatDate(recipe.dateAdded)}</span>
        </div>

        {recipe.allergens.length > 0 && (
          <div className="chips">
            {recipe.allergens.map((allergen) => (
              <span key={allergen} className="chip warn">
                contains {allergen}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="detail-grid">
        {/* Interactive half: ingredients + nutrition move together with servings. */}
        <ServingScaler recipe={recipe} />

        <section className="panel">
          <h3>Instructions</h3>
          <ol className="steps">
            {recipe.instructions.map((step, index) => (
              // Steps have no ids and their order is their identity, so the index
              // is a legitimate key here: the list is never reordered or filtered.
              <li key={index}>{step}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
