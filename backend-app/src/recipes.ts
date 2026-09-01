import { insertRecipe, load, type Store } from './db';
import { scaleNutrition, summariseNutrition, toGrams } from './nutrition';
import type {
  Difficulty,
  Facets,
  NewRecipeInput,
  RawRecipe,
  RecipeDetail,
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

/** "20 minutes" -> 20, and 0 for anything without a number. */
export function parseMinutes(value: string): number {
  const match = /(\d+(?:\.\d+)?)/.exec(value ?? '');
  return match ? Number(match[1]) : 0;
}

/** "brown_sugar" -> "Brown Sugar", used when an ingredient has no row. */
function humanise(id: string): string {
  return id
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Joins ingredient references against the table. Unknown ids do not throw: they
 * come back flagged `missing` with null nutrition. data.json has 8 such ids.
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
 * Dietary claims are the intersection across ingredients, which is only sound
 * when every ingredient resolves. With a missing row we fall back to the recipe's
 * own tags, so an incomplete list can never produce a false "vegan".
 */
function deriveDietary(recipe: RawRecipe, ingredients: ResolvedIngredient[]): string[] {
  const claims = new Set(recipe.tags.filter((tag) => DIETARY_TERMS.includes(tag)));

  if (ingredients.length > 0 && ingredients.every((i) => !i.missing)) {
    for (const term of DIETARY_TERMS) {
      if (ingredients.every((i) => i.dietary.includes(term))) claims.add(term);
    }
  }

  // The data only ever tags the stricter term.
  if (claims.has('vegan')) claims.add('vegetarian');
  return [...claims];
}

/** Takes resolved ingredients so callers perform the join once. */
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
  const ingredients = resolveIngredients(recipe, store);
  return {
    ...toSummary(recipe, ingredients),
    ingredients,
    instructions: recipe.instructions,
    nutrition: summariseNutrition(ingredients, recipe.servings),
  };
}

/** Every word must match, across title, description, tags and ingredients. */
function matchesSearch(recipe: RawRecipe, summary: RecipeSummary, term: string): boolean {
  const haystack = [
    summary.title,
    summary.description,
    ...summary.tags,
    ...summary.ingredientNames,
    // Underscores stripped so "brown sugar" matches the id `brown_sugar`.
    ...recipe.ingredients.map((i) => i.ingredientId.replace(/_/g, ' ')),
  ]
    .join(' ')
    .toLowerCase();

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
    // Title breaks ties so equal values keep a stable order.
    return (result || a.title.localeCompare(b.title)) * direction;
  };
}

/**
 * Filters and sorts server-side, so the client never holds the full dataset.
 * Facets are AND (each choice narrows) except difficulty, which is OR because a
 * recipe only has one.
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
    if (!query.tags.every((tag) => summary.tags.includes(tag))) continue;
    if (!query.ingredients.every((id) => ingredientIds.has(id))) continue;
    if (!query.dietary.every((term) => summary.dietary.includes(term))) continue;
    if (query.difficulty.length && !query.difficulty.includes(summary.difficulty)) continue;
    if (query.maxTotalTime !== undefined && summary.totalTimeMinutes > query.maxTotalTime) continue;

    if (filteringAllergens) {
      if (query.excludeAllergens.some((a) => summary.allergens.includes(a))) continue;
      // A recipe with an unknown ingredient may contain the allergen without
      // being able to declare it, so it is withheld rather than implied safe.
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

/** Continues the fixture's numeric id sequence. In-memory only — see db.insertRecipe. */
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
    ingredients: input.ingredients,
    instructions: input.instructions,
    tags: input.tags,
    dateAdded: new Date().toISOString(),
  };

  await insertRecipe(recipe);
  return toDetail(recipe, store);
}

/** Filter options built from the data, so the UI never hardcodes a list. */
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
