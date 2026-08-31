import { insertRecipe, load, type Store } from './db';
import { scaleNutrition, summariseNutrition, toGrams } from './nutrition';
import type {
  Difficulty,
  Facets,
  RawRecipe,
  RecipeDetail,
  NewRecipeInput,
  RawRecipeIngredient,
  RecipeListResult,
  RecipeQuery,
  RecipeSummary,
  ResolvedIngredient,
} from './types';

const DIFFICULTY_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
const DIETARY_TERMS = ['vegan', 'vegetarian', 'gluten-free', 'keto', 'high-protein'];

/** `difficulty` is a free string in the data; anything unexpected becomes "medium". */
function toDifficulty(value: string): Difficulty {
  const v = value.toLowerCase();
  return v === 'easy' || v === 'medium' || v === 'hard' ? v : 'medium';
}

/** "20 minutes" -> 20. Returns 0 for anything we cannot read a number out of. */
export function parseMinutes(value: string): number {
  const match = /(\d+(?:\.\d+)?)/.exec(value ?? '');
  return match ? Number(match[1]) : 0;
}

/** "brown_sugar" -> "Brown Sugar", for ingredients with no row in the table. */
function humanise(id: string): string {
  return id
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Joins a recipe's ingredient references against the ingredients table and works
 * out what each line item contributes. Unknown ids do not throw: they come back
 * flagged `missing` with null nutrition, because a recipe with an incomplete
 * ingredient table is still a recipe worth showing.
 */
function resolveIngredients(recipe: RawRecipe, store: Store): ResolvedIngredient[] {
  return recipe.ingredients.map((line) => {
    const info = store.ingredientsById.get(line.ingredientId);
    const grams = toGrams(line.amount, line.unit);

    return {
      ...line,
      name: info?.name ?? humanise(line.ingredientId),
      category: info?.category ?? null,
      dietary: info?.dietary ?? [],
      allergens: info?.commonAllergens ?? [],
      grams,
      nutrition: info && grams !== null ? scaleNutrition(info.nutrition, grams) : null,
      missing: !info,
    };
  });
}

/**
 * Which dietary claims a recipe can make.
 *
 * Derived claims are the intersection across ingredients - one non-vegan
 * ingredient makes the whole recipe non-vegan. That logic is only sound when we
 * know every ingredient, so when any row is missing we fall back to trusting the
 * recipe's own tags rather than inferring "vegan" from an incomplete list.
 */
function deriveDietary(recipe: RawRecipe, ingredients: ResolvedIngredient[]): string[] {
  const authored = recipe.tags.filter((tag) => DIETARY_TERMS.includes(tag));
  const claims = new Set(authored);

  const complete = ingredients.length > 0 && ingredients.every((i) => !i.missing);
  if (complete) {
    for (const term of DIETARY_TERMS) {
      if (ingredients.every((i) => i.dietary.includes(term))) claims.add(term);
    }
  }

  // Anything vegan is also vegetarian; the data only ever tags the stricter one.
  if (claims.has('vegan')) claims.add('vegetarian');
  return [...claims];
}

function toSummary(recipe: RawRecipe, ingredients: ResolvedIngredient[]): RecipeSummary {
  const nutrition = summariseNutrition(ingredients, recipe.servings);

  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTimeMinutes: parseMinutes(recipe.prepTime) + parseMinutes(recipe.cookTime),
    difficulty: toDifficulty(recipe.difficulty),
    tags: recipe.tags,
    dateAdded: recipe.dateAdded,
    ingredientNames: ingredients.map((i) => i.name),
    dietary: deriveDietary(recipe, ingredients),
    allergens: [...new Set(ingredients.flatMap((i) => i.allergens))],
    caloriesPerServing: nutrition.perServing.calories,
    unknownIngredients: ingredients.filter((i) => i.missing).map((i) => i.ingredientId),
    nutritionComplete: nutrition.complete,
  };
}

function toDetail(recipe: RawRecipe, store: Store): RecipeDetail {
  // Resolve once and reuse. The join is the expensive part of building a recipe.
  const ingredients = resolveIngredients(recipe, store);
  return {
    ...toSummary(recipe, ingredients),
    ingredients,
    instructions: recipe.instructions,
    nutrition: summariseNutrition(ingredients, recipe.servings),
  };
}

/**
 * Free-text search across the fields a cook would actually type: the name, the
 * blurb, the tags, and the ingredients (both display name and id, so "brown_sugar"
 * and "brown sugar" both hit).
 */
function matchesSearch(recipe: RawRecipe, summary: RecipeSummary, term: string): boolean {
  const haystack = [
    summary.title,
    summary.description,
    ...summary.tags,
    ...summary.ingredientNames,
    ...recipe.ingredients.map((i) => i.ingredientId.replace(/_/g, ' ')),
  ]
    .join(' ')
    .toLowerCase();

  // Every word must appear somewhere, so "chicken rice" narrows rather than widens.
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function comparator(query: RecipeQuery): (a: RecipeSummary, b: RecipeSummary) => number {
  const direction = query.order === 'desc' ? -1 : 1;

  return (a, b) => {
    let result: number;
    switch (query.sort) {
      case 'prepTime':
        result = parseMinutes(a.prepTime) - parseMinutes(b.prepTime);
        break;
      case 'totalTime':
        result = a.totalTimeMinutes - b.totalTimeMinutes;
        break;
      case 'difficulty':
        result = DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty];
        break;
      case 'calories':
        result = a.caloriesPerServing - b.caloriesPerServing;
        break;
      case 'dateAdded':
        result = Date.parse(a.dateAdded) - Date.parse(b.dateAdded);
        break;
      default:
        result = a.title.localeCompare(b.title);
    }
    // Title is the tiebreaker so equal values (lots of "easy" recipes) stay stable.
    return (result || a.title.localeCompare(b.title)) * direction;
  };
}

/**
 * Filtering runs on the server so the client never has to hold the full dataset.
 * With 15 recipes that is overkill today; with 15,000 it is the difference between
 * a query and a download, and the API shape would not have to change.
 */
export async function listRecipes(query: RecipeQuery): Promise<RecipeListResult> {
  const store = await load();
  const filteringAllergens = query.excludeAllergens.length > 0;

  const results: RecipeSummary[] = [];
  let withheld = 0;
  for (const recipe of store.recipes) {
    const summary = toSummary(recipe, resolveIngredients(recipe, store));
    const ingredientIds = new Set(recipe.ingredients.map((i) => i.ingredientId));

    if (query.search && !matchesSearch(recipe, summary, query.search)) continue;
    // Multi-select filters are AND within a facet: each extra choice narrows.
    if (!query.tags.every((tag) => summary.tags.includes(tag))) continue;
    if (!query.ingredients.every((id) => ingredientIds.has(id))) continue;
    if (!query.dietary.every((term) => summary.dietary.includes(term))) continue;
    // ...except difficulty, where picking two means "either is fine".
    if (query.difficulty.length && !query.difficulty.includes(summary.difficulty)) continue;
    if (query.maxTotalTime !== undefined && summary.totalTimeMinutes > query.maxTotalTime) continue;

    if (filteringAllergens) {
      if (query.excludeAllergens.some((a) => summary.allergens.includes(a))) continue;
      // An allergen filter is the one place a gap in the data can do harm. A
      // recipe with an unknown ingredient may well contain the allergen and
      // simply not be able to say so - Chicken Stir-Fry reports no allergens
      // because `soy_sauce` has no row. Withhold it rather than imply it is safe,
      // and report the count so the UI can explain the absence.
      if (summary.unknownIngredients.length > 0) {
        withheld += 1;
        continue;
      }
    }

    results.push(summary);
  }

  return { recipes: results.sort(comparator(query)), withheld };
}

export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  const store = await load();
  const recipe = store.recipes.find((r) => r.id === id);
  return recipe ? toDetail(recipe, store) : null;
}

/**
 * Adds a recipe and returns it in the same shape as GET /api/recipes/:id, so the
 * client can navigate straight to it without a second request.
 *
 * The server owns `id` and `dateAdded`. Ids are numeric strings in the fixture,
 * so we continue the sequence rather than inventing a different format.
 */
export async function createRecipe(input: NewRecipeInput): Promise<RecipeDetail> {
  const store = await load();

  const highest = store.recipes.reduce((max, r) => {
    const n = Number(r.id);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const recipe: RawRecipe = {
    id: String(highest + 1),
    title: input.title,
    description: input.description,
    servings: input.servings,
    // Stored in the fixture's own format so nothing downstream needs a special case.
    prepTime: `${input.prepTimeMinutes} minutes`,
    cookTime: `${input.cookTimeMinutes} minutes`,
    difficulty: input.difficulty,
    ingredients: input.ingredients as RawRecipeIngredient[],
    instructions: input.instructions,
    tags: input.tags,
    dateAdded: new Date().toISOString(),
  };

  await insertRecipe(recipe);
  return toDetail(recipe, store);
}

/** Filter options built from the data itself, so the UI never hardcodes a list. */
export async function getFacets(): Promise<Facets> {
  const store = await load();
  const summaries = store.recipes.map((r) => toSummary(r, resolveIngredients(r, store)));

  const sorted = (values: string[]): string[] => [...new Set(values)].sort();

  return {
    tags: sorted(summaries.flatMap((s) => s.tags)),
    ingredients: [...store.ingredientsById.values()]
      .map((i) => ({ id: i.id, name: i.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    difficulties: ['easy', 'medium', 'hard'],
    dietary: sorted(summaries.flatMap((s) => s.dietary)),
    allergens: sorted(store.ingredients.flatMap((i) => i.commonAllergens)),
  };
}
