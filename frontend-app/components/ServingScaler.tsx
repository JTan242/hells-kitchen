'use client';

import { useState } from 'react';
import { scaleAmount, scaleNutrition } from '@/lib/format';
import type { RecipeDetail } from '@/lib/types';

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 99;

/**
 * Ingredients and nutrition together, since one serving control drives both.
 * Scaling maths runs client-side (lib/format.ts), so there is no request per tap.
 */
export function ServingScaler({ recipe }: { recipe: RecipeDetail }) {
  const [servings, setServings] = useState(recipe.servings);

  // Per-serving figures do not scale by definition; totals and quantities do.
  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
  const total = scaleNutrition(recipe.nutrition.total, factor);
  const perServing = recipe.nutrition.perServing;

  const clamp = (value: number) => Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, value));

  return (
    <div className="stack">
      <section className="panel">
        <h3>Ingredients</h3>

        <div className="scaler">
          <span className="result-count">Servings</span>
          <div className="stepper">
            <button
              type="button"
              onClick={() => setServings((s) => clamp(s - 1))}
              disabled={servings <= MIN_SERVINGS}
              aria-label="Decrease servings"
            >
              −
            </button>
            <output aria-live="polite">{servings}</output>
            <button
              type="button"
              onClick={() => setServings((s) => clamp(s + 1))}
              disabled={servings >= MAX_SERVINGS}
              aria-label="Increase servings"
            >
              +
            </button>
          </div>
          {servings !== recipe.servings && (
            <button type="button" className="link-button" onClick={() => setServings(recipe.servings)}>
              Reset to {recipe.servings}
            </button>
          )}
        </div>

        <ul className="ingredient-list">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.ingredientId}>
              <span>
                {ingredient.name}
                {/* Flagged rather than silently dropped from the totals. */}
                {ingredient.missing && (
                  <span className="chip warn" style={{ marginLeft: 8 }}>
                    no nutrition data
                  </span>
                )}
              </span>
              <span className="qty">
                {scaleAmount(ingredient.amount, factor, ingredient.unit)} {ingredient.unit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>Nutrition</h3>
        <div className="nutrition">
          <div>
            <strong>{Math.round(perServing.calories)}</strong>
            <span>kcal / serving</span>
          </div>
          <div>
            <strong>{perServing.protein}g</strong>
            <span>protein</span>
          </div>
          <div>
            <strong>{perServing.carbs}g</strong>
            <span>carbs</span>
          </div>
          <div>
            <strong>{perServing.fat}g</strong>
            <span>fat</span>
          </div>
        </div>

        <p className="note">
          {servings} {servings === 1 ? 'serving' : 'servings'} ={' '}
          <strong>{Math.round(total.calories)} kcal</strong> total.
        </p>

        <p className="note">
          Estimated from ingredient weights (see README).
          {!recipe.nutrition.complete && (
            <> Excludes {recipe.nutrition.skipped.length} ingredient(s) with no nutrition data.</>
          )}
        </p>
      </section>
    </div>
  );
}
