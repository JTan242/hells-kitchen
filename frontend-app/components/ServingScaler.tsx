'use client';

import { useState } from 'react';
import { scaleAmount, scaleNutrition } from '@/lib/format';
import type { RecipeDetail } from '@/lib/types';

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 99;

/**
 * Ingredients and nutrition in one component because one control drives both:
 * changing the serving count has to move the quantities and the calorie numbers
 * together, and splitting them would mean lifting the same state into a parent
 * for no gain.
 *
 * All the maths is client-side (see lib/format.ts) so adjusting servings is
 * instant rather than a request per click.
 */
export function ServingScaler({ recipe }: { recipe: RecipeDetail }) {
  const [servings, setServings] = useState(recipe.servings);

  // Per-serving values are by definition unaffected by the serving count, so the
  // factor applies to totals and ingredient quantities only.
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
                {/* Being explicit beats silently dropping it from the totals. */}
                {ingredient.missing && (
                  <span className="chip warn" style={{ marginLeft: 8 }}>
                    no nutrition data
                  </span>
                )}
              </span>
              <span className="qty">
                {scaleAmount(ingredient.amount, factor)} {ingredient.unit}
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
