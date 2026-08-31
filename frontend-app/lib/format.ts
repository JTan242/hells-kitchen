import type { Nutrition } from './types';

/**
 * Amount parsing, mirrored from the backend so the serving-size scaler can do its
 * maths in the browser without a round trip per click. It is ~15 lines of pure
 * function; the alternative (a `?servings=` API call on every tap) would be
 * slower and no more correct.
 */
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

const FRACTIONS: [number, string][] = [
  [0.25, '1/4'],
  [0.333, '1/3'],
  [0.5, '1/2'],
  [0.667, '2/3'],
  [0.75, '3/4'],
];

/**
 * Renders a scaled quantity the way a recipe would write it: "1 1/2" beats
 * "1.5", and "0.33" is never a useful thing to read in a kitchen.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';

  const whole = Math.floor(value);
  const remainder = value - whole;

  const match = FRACTIONS.find(([size]) => Math.abs(remainder - size) < 0.05);
  if (match) return whole > 0 ? `${whole} ${match[1]}` : match[1];
  if (remainder < 0.05) return String(whole);

  // Not near a familiar fraction, so fall back to a short decimal.
  return String(Math.round(value * 100) / 100);
}

/** Scales an amount string by a factor, leaving unparseable amounts untouched. */
export function scaleAmount(amount: string, factor: number): string {
  const parsed = parseAmount(amount);
  return parsed === null ? amount : formatQuantity(parsed * factor);
}

export function scaleNutrition(nutrition: Nutrition, factor: number): Nutrition {
  const round = (n: number) => Math.round(n * factor * 10) / 10;
  return {
    calories: round(nutrition.calories),
    protein: round(nutrition.protein),
    carbs: round(nutrition.carbs),
    fat: round(nutrition.fat),
  };
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
