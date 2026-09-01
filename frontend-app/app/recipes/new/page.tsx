import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchFacets } from '@/lib/api';
import { ErrorBox } from '@/components/ErrorBox';
import { RecipeForm } from '@/components/RecipeForm';

export const metadata: Metadata = {
  title: 'Add a recipe · Recipe Manager',
  description: 'Add a recipe to the collection.',
};

/** Fetches facets server-side so the form has its options on first render. */
export default async function NewRecipePage() {
  const facets = await fetchFacets().catch((error: unknown) => error as Error);

  if (facets instanceof Error) {
    return <ErrorBox title="Could not load the form" message={facets.message} />;
  }

  return (
    <div className="stack">
      <p className="result-count">
        <Link href="/recipes">← All recipes</Link>
      </p>

      <header className="detail-header">
        <h2>Add a recipe</h2>
        <p>Nutrition is calculated from the ingredients you choose.</p>
      </header>

      <RecipeForm facets={facets} />
    </div>
  );
}
