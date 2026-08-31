import { describe, expect, it } from 'vitest';
import { createRecipe, getRecipe, listRecipes, parseMinutes } from './recipes';
import type { NewRecipeInput, RecipeQuery } from './types';

/** Most tests vary one filter, so start from "no filters at all". */
function query(overrides: Partial<RecipeQuery> = {}): RecipeQuery {
  return {
    tags: [],
    ingredients: [],
    difficulty: [],
    dietary: [],
    excludeAllergens: [],
    sort: 'title',
    order: 'asc',
    ...overrides,
  };
}

describe('parseMinutes', () => {
  it('reads the number out of the time strings the data uses', () => {
    expect(parseMinutes('20 minutes')).toBe(20);
    expect(parseMinutes('0 minutes')).toBe(0);
  });

  it('falls back to 0 rather than NaN', () => {
    expect(parseMinutes('a while')).toBe(0);
  });
});

/**
 * The rule that matters most: a gap in the ingredient data must never become a
 * dietary claim. `deriveDietary` is not exported, so this goes through the public
 * surface, which is what actually needs to be right.
 */
describe('dietary claims', () => {
  it('does not invent a claim for a recipe with unknown ingredients', async () => {
    // Chocolate Chip Cookies is missing butter and both sugars. Whatever it
    // claims must come from its own tags, never from the ingredients that remain.
    const recipe = await getRecipe('2');
    expect(recipe).not.toBeNull();
    expect(recipe!.unknownIngredients.length).toBeGreaterThan(0);
    expect(recipe!.dietary).not.toContain('vegan');
  });

  it('treats vegan recipes as vegetarian too', async () => {
    const { recipes } = await listRecipes(query({ dietary: ['vegan'] }));
    expect(recipes.length).toBeGreaterThan(0);
    for (const recipe of recipes) expect(recipe.dietary).toContain('vegetarian');
  });
});

/**
 * The allergen filter is the one place a wrong answer could actually harm someone,
 * so it gets the most attention.
 */
describe('allergen filtering', () => {
  it('excludes recipes that declare the allergen', async () => {
    const { recipes } = await listRecipes(query({ excludeAllergens: ['dairy'] }));
    for (const recipe of recipes) expect(recipe.allergens).not.toContain('dairy');
  });

  it('withholds recipes whose ingredient data is incomplete', async () => {
    // Chicken Stir-Fry contains soy sauce but reports no allergens, because
    // `soy_sauce` has no row. It must not be presented as gluten-free.
    const { recipes, withheld } = await listRecipes(query({ excludeAllergens: ['gluten'] }));
    expect(recipes.map((r) => r.id)).not.toContain('3');
    expect(withheld).toBeGreaterThan(0);
    for (const recipe of recipes) expect(recipe.unknownIngredients).toEqual([]);
  });

  it('withholds nothing when no allergen filter is applied', async () => {
    const { recipes, withheld } = await listRecipes(query());
    expect(withheld).toBe(0);
    expect(recipes).toHaveLength(15);
  });
});

describe('filter combination', () => {
  it('ANDs tags: each extra tag narrows the result', async () => {
    const one = await listRecipes(query({ tags: ['italian'] }));
    const two = await listRecipes(query({ tags: ['italian', 'vegetarian'] }));
    expect(two.recipes.length).toBeLessThanOrEqual(one.recipes.length);
    for (const recipe of two.recipes) {
      expect(recipe.tags).toContain('italian');
      expect(recipe.tags).toContain('vegetarian');
    }
  });

  it('ORs difficulty, because a recipe only has one', async () => {
    const { recipes } = await listRecipes(query({ difficulty: ['easy', 'hard'] }));
    expect(recipes.length).toBeGreaterThan(0);
    for (const recipe of recipes) expect(['easy', 'hard']).toContain(recipe.difficulty);
  });

  it('matches ingredients by id', async () => {
    const { recipes } = await listRecipes(query({ ingredients: ['chicken_breast'] }));
    expect(recipes.length).toBeGreaterThan(0);
    for (const recipe of recipes) expect(recipe.ingredientNames).toContain('Chicken Breast');
  });

  it('returns an empty list for a tag nothing has', async () => {
    const { recipes } = await listRecipes(query({ tags: ['not-a-real-tag'] }));
    expect(recipes).toEqual([]);
  });
});

describe('search', () => {
  it('finds recipes by ingredient as well as by name', async () => {
    const { recipes } = await listRecipes(query({ search: 'chicken' }));
    expect(recipes.length).toBeGreaterThan(0);
  });

  it('requires every word, so more words narrow', async () => {
    const one = await listRecipes(query({ search: 'chicken' }));
    const two = await listRecipes(query({ search: 'chicken almond' }));
    expect(two.recipes.length).toBeLessThan(one.recipes.length);
  });

  it('matches an underscored id typed as two words', async () => {
    const { recipes } = await listRecipes(query({ search: 'brown sugar' }));
    expect(recipes.length).toBeGreaterThan(0);
  });
});

describe('sorting', () => {
  it('sorts by calories ascending', async () => {
    const { recipes } = await listRecipes(query({ sort: 'calories', order: 'asc' }));
    const values = recipes.map((r) => r.caloriesPerServing);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('reverses for descending', async () => {
    const { recipes } = await listRecipes(query({ sort: 'totalTime', order: 'desc' }));
    const values = recipes.map((r) => r.totalTimeMinutes);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });
});

describe('getRecipe', () => {
  it('returns the full detail for a known id', async () => {
    const recipe = await getRecipe('1');
    expect(recipe?.title).toBe('Classic Margherita Pizza');
    expect(recipe?.instructions.length).toBeGreaterThan(0);
  });

  it('flags the ingredients it could not resolve', async () => {
    const recipe = await getRecipe('1');
    expect(recipe?.nutrition.complete).toBe(false);
    expect(recipe?.nutrition.skipped).toContain('basil');
    // Still shown, with a readable name derived from the id.
    expect(recipe?.ingredients.find((i) => i.ingredientId === 'basil')?.missing).toBe(true);
  });

  it('returns null for an unknown id instead of throwing', async () => {
    expect(await getRecipe('9999')).toBeNull();
  });
});

describe('createRecipe', () => {
  const input: NewRecipeInput = {
    title: 'Test Soup',
    description: 'For the test suite',
    servings: 2,
    prepTimeMinutes: 5,
    cookTimeMinutes: 15,
    difficulty: 'easy',
    ingredients: [{ ingredientId: 'carrot_unknown', amount: '2', unit: 'cups' }],
    instructions: ['Boil', 'Serve'],
    tags: ['test'],
  };

  it('assigns an id and a timestamp the client cannot choose', async () => {
    const created = await createRecipe({ ...input, title: 'Server Owns Id' });
    expect(created.id).toBeTruthy();
    expect(Date.parse(created.dateAdded)).not.toBeNaN();
  });

  it('stores times in the format the rest of the app already reads', async () => {
    const created = await createRecipe({ ...input, title: 'Time Format' });
    expect(created.prepTime).toBe('5 minutes');
    expect(created.totalTimeMinutes).toBe(20);
  });

  it('makes the recipe retrievable straight away', async () => {
    const created = await createRecipe({ ...input, title: 'Retrievable' });
    const fetched = await getRecipe(created.id);
    expect(fetched?.title).toBe('Retrievable');
  });

  it('includes the new recipe in listings', async () => {
    const before = await listRecipes(query());
    await createRecipe({ ...input, title: 'Listed Soup' });
    const after = await listRecipes(query());
    expect(after.recipes.length).toBe(before.recipes.length + 1);
  });

  // An ingredient the table does not know must flow into the existing handling
  // rather than crashing or silently counting as zero.
  it('handles an unknown ingredient the same way the fixture data does', async () => {
    const created = await createRecipe({ ...input, title: 'Unknown Ingredient' });
    expect(created.unknownIngredients).toContain('carrot_unknown');
    expect(created.nutritionComplete).toBe(false);
    expect(created.ingredients[0]?.missing).toBe(true);
    // Still shown, with a readable name derived from the id.
    expect(created.ingredients[0]?.name).toBe('Carrot Unknown');
  });
});
