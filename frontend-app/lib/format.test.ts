import { describe, expect, it } from 'vitest';
import { formatQuantity, parseAmount, scaleAmount, scaleNutrition } from './format';

describe('parseAmount', () => {
  it('reads numbers, decimals and fractions', () => {
    expect(parseAmount('2')).toBe(2);
    expect(parseAmount('2.5')).toBe(2.5);
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('1 1/2')).toBe(1.5);
  });

  it('returns null rather than NaN for unreadable amounts', () => {
    expect(parseAmount('to taste')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1/0')).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('renders common kitchen fractions', () => {
    expect(formatQuantity(0.5)).toBe('1/2');
    expect(formatQuantity(1 / 3)).toBe('1/3');
    expect(formatQuantity(0.75)).toBe('3/4');
    expect(formatQuantity(1.5)).toBe('1 1/2');
  });

  // Scaling by 5/4 lands on eighths constantly; without them 1.875 read "1.88".
  it('renders eighths', () => {
    expect(formatQuantity(0.125)).toBe('1/8');
    expect(formatQuantity(1.875)).toBe('1 7/8');
    expect(formatQuantity(2.625)).toBe('2 5/8');
  });

  // 3/8 (0.375) and 1/3 (0.333) are only 0.042 apart, so a first-match search
  // inside a loose tolerance would label 3/8 as 1/3.
  it('picks the nearest fraction, not the first within tolerance', () => {
    expect(formatQuantity(0.375)).toBe('3/8');
    expect(formatQuantity(0.625)).toBe('5/8');
  });

  it('keeps whole numbers whole', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(1)).toBe('1');
  });

  it('falls back to a decimal when no fraction is close', () => {
    expect(formatQuantity(0.3)).toBe('0.3');
    expect(formatQuantity(1.45)).toBe('1.45');
  });

  it('handles zero and invalid input', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(-1)).toBe('0');
    expect(formatQuantity(NaN)).toBe('0');
  });
});

describe('scaleAmount', () => {
  it('scales the fractions the data actually contains', () => {
    expect(scaleAmount('1/3', 3)).toBe('1');
    expect(scaleAmount('1/2', 2)).toBe('1');
    expect(scaleAmount('2', 0.5)).toBe('1');
  });

  // 4 -> 5 servings on "1 1/2 lb" of chicken.
  it('scales a mixed number to a readable fraction', () => {
    expect(scaleAmount('1 1/2', 5 / 4)).toBe('1 7/8');
  });

  it('leaves unparseable amounts untouched', () => {
    expect(scaleAmount('to taste', 2)).toBe('to taste');
  });

  // Weight and metric units are read off a scale; "312 1/2 ml" is not a quantity
  // anyone writes.
  it('renders scale-measured units as decimals', () => {
    expect(scaleAmount('250', 1.25, 'ml')).toBe('312.5');
    expect(scaleAmount('150', 1.25, 'g')).toBe('187.5');
    expect(scaleAmount('1.5', 5 / 4, 'lb')).toBe('1.88');
    expect(scaleAmount('400', 5 / 6, 'ml')).toBe('333.33');
  });

  it('drops trailing zeros rather than showing 250.00', () => {
    expect(scaleAmount('200', 1.25, 'g')).toBe('250');
    expect(scaleAmount('8', 1.25, 'oz')).toBe('10');
  });

  it('keeps fractions for volume and count units', () => {
    expect(scaleAmount('1', 1.25, 'cups')).toBe('1 1/4');
    expect(scaleAmount('2', 1.25, 'cloves')).toBe('2 1/2');
    expect(scaleAmount('1', 0.5, 'tbsp')).toBe('1/2');
  });

  it('is case and whitespace tolerant about the unit', () => {
    expect(scaleAmount('150', 1.25, ' G ')).toBe('187.5');
  });
});

describe('scaleNutrition', () => {
  it('scales every macro and rounds to one decimal', () => {
    const scaled = scaleNutrition({ calories: 100, protein: 10, carbs: 20, fat: 5 }, 1.5);
    expect(scaled).toEqual({ calories: 150, protein: 15, carbs: 30, fat: 7.5 });
  });
});
