import type { Nutrition } from './types';

/**
 * Mirrors nutrition.parseAmount on the backend so scaling runs in the browser
 * with no round trip. Keep the two in step.
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

/** Kitchen fractions, including eighths: scaling by 5/4 lands on 7/8 often. */
const FRACTIONS: [number, string][] = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
];

/** Tight enough that 3/8 is never rounded to 1/3, which differ by only 0.042. */
const FRACTION_TOLERANCE = 0.02;

/** Renders quantities the way a recipe would: "1 1/2" rather than "1.5". */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';

  const whole = Math.floor(value);
  const remainder = value - whole;

  if (remainder <= FRACTION_TOLERANCE) return String(whole);

  // Nearest, not first: several fractions can sit inside the tolerance.
  const nearest = FRACTIONS.reduce((best, f) =>
    Math.abs(remainder - f[0]) < Math.abs(remainder - best[0]) ? f : best,
  );
  if (Math.abs(remainder - nearest[0]) <= FRACTION_TOLERANCE) {
    return whole > 0 ? `${whole} ${nearest[1]}` : nearest[1];
  }

  // Not near a common fraction, so fall back to a short decimal.
  return String(Math.round(value * 100) / 100);
}

/**
 * Units measured on a scale, where fractions read wrongly: "312 1/2 ml" is not
 * how anyone writes a quantity. Volume and count units keep fractions, which is
 * how recipes write them ("1/2 cup", "1 1/2 onions").
 */
const DECIMAL_UNITS = new Set([
  'g', 'gram', 'grams', 'kg', 'ml', 'l', 'oz', 'lb', 'lbs',
]);

/** At most 2 decimals, with trailing zeros dropped: 250, 187.5, 1.88. */
function formatDecimal(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return String(Math.round(value * 100) / 100);
}

/**
 * Scales an amount for display. Unparseable amounts (e.g. "to taste") pass
 * through unchanged.
 */
export function scaleAmount(amount: string, factor: number, unit = ''): string {
  const parsed = parseAmount(amount);
  if (parsed === null) return amount;

  const scaled = parsed * factor;
  return DECIMAL_UNITS.has(unit.trim().toLowerCase())
    ? formatDecimal(scaled)
    : formatQuantity(scaled);
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
