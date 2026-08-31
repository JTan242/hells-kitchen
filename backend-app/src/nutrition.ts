import type { Nutrition, NutritionSummary, ResolvedIngredient } from './types';

/**
 * ASSUMPTION: the `nutrition` block on each ingredient is "per 100 g".
 * data.json doesn't say so, but the numbers line up with standard per-100 g
 * references (chicken breast 165 kcal, ground beef 250 kcal, mozzarella 280 kcal),
 * so that's the basis every calculation here uses.
 */
const NUTRITION_BASIS_GRAMS = 100;

/**
 * ASSUMPTION: recipes measure by volume and by count, but nutrition is by weight,
 * so we need a bridge. These are rough average weights, not per-ingredient
 * densities — a cup of flour (~120 g) and a cup of milk (~240 g) genuinely differ,
 * and we deliberately use one number for both. That makes totals an *estimate*,
 * which is why the API labels them as such rather than pretending to be exact.
 *
 * The real fix is a `gramsPerUnit` field on each ingredient row; this table is
 * the stand-in until the data has one.
 */
const UNIT_GRAMS: Record<string, number> = {
  // weight / volume
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  oz: 28.35,
  lb: 453.6,
  lbs: 453.6,
  // cooking volume (water-ish density)
  cup: 240,
  cups: 240,
  tbsp: 15,
  tsp: 5,
  // counted items — average edible weight
  small: 80,
  medium: 120,
  large: 180,
  whole: 120,
  piece: 40,
  pieces: 40,
  clove: 5,
  cloves: 5,
  leaf: 0.5,
  leaves: 0.5,
  sheet: 3,
  sheets: 3,
  head: 500,
  bunch: 60,
  can: 400,
  slice: 30,
  slices: 30,
  pinch: 0.5,
};

/**
 * Parses the `amount` string. It is a string in the data because it holds things
 * like "1/3" and "2.5", so we handle plain decimals, fractions ("3/4") and mixed
 * numbers ("1 1/2"). Anything else returns null and is treated as uncountable.
 */
export function parseAmount(amount: string): number | null {
  const text = amount.trim();
  if (!text) return null;

  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (mixed) {
    const [, whole, num, den] = mixed;
    const d = Number(den);
    return d === 0 ? null : Number(whole) + Number(num) / d;
  }

  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (fraction) {
    const [, num, den] = fraction;
    const d = Number(den);
    return d === 0 ? null : Number(num) / d;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Converts an amount + unit into grams, or null when we can't. */
export function toGrams(amount: string, unit: string): number | null {
  const quantity = parseAmount(amount);
  if (quantity === null) return null;

  const perUnit = UNIT_GRAMS[unit.trim().toLowerCase()];
  return perUnit === undefined ? null : quantity * perUnit;
}

/** Scales a per-100 g nutrition block to the given weight. */
export function scaleNutrition(per100g: Nutrition, grams: number): Nutrition {
  const factor = grams / NUTRITION_BASIS_GRAMS;
  return {
    calories: per100g.calories * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/**
 * Sums the line items of a recipe.
 *
 * Two things routinely go wrong and neither should throw: an ingredient id has
 * no row in the ingredients table (data.json has 8 of these), or its unit isn't
 * convertible. Both are skipped and reported in `skipped`, so the UI can show a
 * total *and* say what it's missing instead of showing a confidently wrong number.
 */
export function summariseNutrition(
  ingredients: ResolvedIngredient[],
  servings: number,
): NutritionSummary {
  const total: Nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const skipped: string[] = [];

  for (const item of ingredients) {
    if (!item.nutrition) {
      skipped.push(item.ingredientId);
      continue;
    }
    total.calories += item.nutrition.calories;
    total.protein += item.nutrition.protein;
    total.carbs += item.nutrition.carbs;
    total.fat += item.nutrition.fat;
  }

  // Guard against a bad `servings` value rather than emitting Infinity/NaN.
  const divisor = servings > 0 ? servings : 1;

  return {
    total: {
      calories: round(total.calories),
      protein: round(total.protein),
      carbs: round(total.carbs),
      fat: round(total.fat),
    },
    perServing: {
      calories: round(total.calories / divisor),
      protein: round(total.protein / divisor),
      carbs: round(total.carbs / divisor),
      fat: round(total.fat / divisor),
    },
    complete: skipped.length === 0,
    skipped,
  };
}
