import { describe, expect, it } from 'vitest';
import { parseAmount, summariseNutrition, toGrams } from './nutrition';
import type { ResolvedIngredient } from './types';

/** Builds a line item; only the fields each test cares about need supplying. */
function line(overrides: Partial<ResolvedIngredient> = {}): ResolvedIngredient {
  return {
    ingredientId: 'x',
    amount: '1',
    unit: 'g',
    name: 'X',
    category: null,
    dietary: [],
    allergens: [],
    grams: 100,
    nutrition: { calories: 100, protein: 10, carbs: 10, fat: 10 },
    missing: false,
    ...overrides,
  };
}

describe('parseAmount', () => {
  it('reads plain numbers and decimals', () => {
    expect(parseAmount('2')).toBe(2);
    expect(parseAmount('2.5')).toBe(2.5);
  });

  it('reads the fractions the data actually contains', () => {
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('1/3')).toBeCloseTo(0.333, 2);
    expect(parseAmount('1 1/2')).toBe(1.5);
  });

  it('returns null rather than NaN for anything unreadable', () => {
    expect(parseAmount('to taste')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1/0')).toBeNull();
  });
});

describe('toGrams', () => {
  it('converts the units used in the data', () => {
    expect(toGrams('2', 'cups')).toBe(480);
    expect(toGrams('1', 'lb')).toBeCloseTo(453.6, 1);
    expect(toGrams('1/3', 'cup')).toBeCloseTo(80, 1);
  });

  it('is case and whitespace tolerant', () => {
    expect(toGrams('1', ' CUP ')).toBe(240);
  });

  it('returns null for units it does not know', () => {
    expect(toGrams('2', 'sprigs')).toBeNull();
    expect(toGrams('lots', 'cups')).toBeNull();
  });
});

describe('summariseNutrition', () => {
  it('sums line items and divides by servings', () => {
    const result = summariseNutrition([line(), line()], 4);
    expect(result.total.calories).toBe(200);
    expect(result.perServing.calories).toBe(50);
    expect(result.complete).toBe(true);
  });

  it('skips uncountable ingredients instead of treating them as zero', () => {
    const result = summariseNutrition([line(), line({ ingredientId: 'basil', nutrition: null })], 1);
    expect(result.total.calories).toBe(100);
    expect(result.complete).toBe(false);
    expect(result.skipped).toEqual(['basil']);
  });

  // A servings: 0 in the data must not render as Infinity on the page.
  it('does not divide by zero', () => {
    const result = summariseNutrition([line()], 0);
    expect(Number.isFinite(result.perServing.calories)).toBe(true);
    expect(result.perServing.calories).toBe(100);
  });

  it('reports an empty recipe as complete rather than broken', () => {
    const result = summariseNutrition([], 4);
    expect(result.total.calories).toBe(0);
    expect(result.complete).toBe(true);
  });
});
