import type { Nutrition, NutritionSummary, ResolvedIngredient } from './types';

/**
 * Ingredient nutrition is assumed to be per 100g. data.json does not state this;
 * the values match standard per-100g references (chicken breast 165, beef 250).
 */
const NUTRITION_BASIS_GRAMS = 100;

/**
 * Approximate grams per unit, one figure per unit for every ingredient. A cup of
 * flour and a cup of milk really differ by about 2x, so totals are estimates and
 * are labelled as such in the UI. A `gramsPerUnit` field per ingredient would fix it.
 */
const UNIT_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  oz: 28.35,
  lb: 453.6,
  lbs: 453.6,
  cup: 240,
  cups: 240,
  tbsp: 15,
  tsp: 5,
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

/** Handles "2", "2.5", "3/4" and "1 1/2". Returns null for anything unreadable. */
export function parseAmount(amount: string): number | null {
  const text = amount.trim();
  if (!text) return null;

  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (mixed) {
    const d = Number(mixed[3]);
    return d === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / d;
  }

  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (fraction) {
    const d = Number(fraction[2]);
    return d === 0 ? null : Number(fraction[1]) / d;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Null when the amount is unreadable or the unit is not in UNIT_GRAMS. */
export function toGrams(amount: string, unit: string): number | null {
  const quantity = parseAmount(amount);
  if (quantity === null) return null;

  const perUnit = UNIT_GRAMS[unit.trim().toLowerCase()];
  return perUnit === undefined ? null : quantity * perUnit;
}

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
 * Sums the line items. Ingredients with no nutrition (missing row or unknown
 * unit) are skipped and named in `skipped` rather than counted as zero, so the
 * caller can show a total and say what it excludes.
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

  // Guards against a servings: 0 in the data producing Infinity.
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
