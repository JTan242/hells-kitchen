import Link from 'next/link';
import type { RecipeSummary } from '@/lib/types';

/** Pure presentation, so it stays a server component and ships no JS. */
export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  // An incomplete figure must not read as a real one. Chocolate Chip Cookies is
  // missing butter and both sugars, so its 158 kcal would otherwise rank it as
  // one of the lightest recipes here.
  const estimated = !recipe.nutritionComplete;

  return (
    <Link href={`/recipes/${recipe.id}`} className="card">
      <h3>{recipe.title}</h3>
      <p>{recipe.description}</p>

      <div className="chips">
        {recipe.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="chip static">
            {tag}
          </span>
        ))}
      </div>

      <div className="meta">
        <span>{recipe.totalTimeMinutes} min total</span>
        <span>{recipe.difficulty}</span>
        <span>{recipe.servings} servings</span>
        {/* 0 means nothing could be calculated, so show nothing rather than "0 kcal". */}
        {recipe.caloriesPerServing > 0 && (
          <span
            className={estimated ? 'partial' : undefined}
            title={
              estimated
                ? `Excludes ${recipe.unknownIngredients.length} ingredient(s) with no nutrition data`
                : undefined
            }
          >
            {estimated && '≥ '}
            {Math.round(recipe.caloriesPerServing)} kcal
            {estimated && '*'}
          </span>
        )}
      </div>
    </Link>
  );
}
