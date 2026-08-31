import { describe, expect, it } from 'vitest';
import { validateNewRecipe } from './validation';

/** A recipe that should always pass; tests override one field at a time. */
function valid(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Test Bake',
    description: 'Something simple',
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    difficulty: 'easy',
    ingredients: [{ ingredientId: 'flour', amount: '2', unit: 'cups' }],
    instructions: ['Mix', 'Bake'],
    tags: ['baking'],
    ...overrides,
  };
}

describe('validateNewRecipe', () => {
  it('accepts a well-formed recipe', () => {
    const { value, errors } = validateNewRecipe(valid());
    expect(errors).toBeUndefined();
    expect(value?.title).toBe('Test Bake');
  });

  it('rejects a non-object body', () => {
    expect(validateNewRecipe('nope').errors).toBeDefined();
    expect(validateNewRecipe(null).errors).toBeDefined();
    expect(validateNewRecipe([]).errors).toBeDefined();
  });

  it('reports every bad field at once, not just the first', () => {
    const { errors } = validateNewRecipe({ title: '', servings: 0, ingredients: [] });
    expect(Object.keys(errors ?? {}).length).toBeGreaterThan(2);
    expect(errors?.title).toBeDefined();
    expect(errors?.servings).toBeDefined();
    expect(errors?.ingredients).toBeDefined();
  });

  it('requires a title', () => {
    expect(validateNewRecipe(valid({ title: '   ' })).errors?.title).toBeDefined();
  });

  it('requires at least one ingredient and one instruction', () => {
    expect(validateNewRecipe(valid({ ingredients: [] })).errors?.ingredients).toBeDefined();
    expect(validateNewRecipe(valid({ instructions: [] })).errors?.instructions).toBeDefined();
    // Blank strings are not instructions.
    expect(validateNewRecipe(valid({ instructions: ['  ', ''] })).errors?.instructions).toBeDefined();
  });

  it('rejects servings that are not whole positive numbers', () => {
    for (const servings of [0, -1, 2.5, 'four', null, 101]) {
      expect(validateNewRecipe(valid({ servings })).errors?.servings).toBeDefined();
    }
  });

  // "4abc" would pass a parseInt-based check; Number() correctly rejects it.
  it('does not accept a number with trailing junk', () => {
    expect(validateNewRecipe(valid({ servings: '4abc' })).errors?.servings).toBeDefined();
  });

  it('allows a zero cook time but not a zero prep time', () => {
    expect(validateNewRecipe(valid({ cookTimeMinutes: 0 })).errors).toBeUndefined();
    expect(validateNewRecipe(valid({ prepTimeMinutes: 0 })).errors?.prepTimeMinutes).toBeDefined();
  });

  it('accepts the fraction amounts the data itself uses', () => {
    for (const amount of ['1/3', '1/2', '2.5', '1 1/2', '2']) {
      const body = valid({ ingredients: [{ ingredientId: 'flour', amount, unit: 'cup' }] });
      expect(validateNewRecipe(body).errors).toBeUndefined();
    }
  });

  it('rejects amounts it could never convert', () => {
    for (const amount of ['lots', '', '1/0', 'two']) {
      const body = valid({ ingredients: [{ ingredientId: 'flour', amount, unit: 'cup' }] });
      expect(validateNewRecipe(body).errors).toBeDefined();
    }
  });

  it('flags the specific ingredient row that is wrong', () => {
    const { errors } = validateNewRecipe(
      valid({
        ingredients: [
          { ingredientId: 'flour', amount: '2', unit: 'cups' },
          { ingredientId: '', amount: '1', unit: 'cup' },
        ],
      }),
    );
    expect(errors?.['ingredients.1.ingredientId']).toBeDefined();
    expect(errors?.['ingredients.0.ingredientId']).toBeUndefined();
  });

  it('only accepts known difficulties, case-insensitively', () => {
    expect(validateNewRecipe(valid({ difficulty: 'EASY' })).errors).toBeUndefined();
    expect(validateNewRecipe(valid({ difficulty: 'trivial' })).errors?.difficulty).toBeDefined();
  });

  it('normalises tags to lowercase and drops duplicates', () => {
    const { value } = validateNewRecipe(valid({ tags: ['Dinner', 'dinner', ' ITALIAN '] }));
    expect(value?.tags).toEqual(['dinner', 'italian']);
  });

  it('treats tags as optional', () => {
    const { value, errors } = validateNewRecipe(valid({ tags: undefined }));
    expect(errors).toBeUndefined();
    expect(value?.tags).toEqual([]);
  });

  it('trims surrounding whitespace', () => {
    const { value } = validateNewRecipe(valid({ title: '  Spaced  ' }));
    expect(value?.title).toBe('Spaced');
  });
});
