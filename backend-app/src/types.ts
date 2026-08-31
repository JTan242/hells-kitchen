/**
 * Domain + API types.
 *
 * "Raw*" types mirror db/data.json exactly. Everything else is what the API
 * hands back to the frontend, which is deliberately a richer shape: the
 * frontend should never have to re-do joins or maths that belong on the server.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A row in data.json `ingredients` — nutrition is per 100g (see nutrition.ts). */
export interface RawIngredient {
  id: string;
  name: string;
  category: string;
  nutrition: Nutrition;
  commonAllergens: string[];
  dietary: string[];
}

/** How a recipe references an ingredient: an id plus an amount + unit. */
export interface RawRecipeIngredient {
  ingredientId: string;
  amount: string;
  unit: string;
}

/** A row in data.json `recipes`. */
export interface RawRecipe {
  id: string;
  title: string;
  description: string;
  servings: number;
  prepTime: string;
  cookTime: string;
  difficulty: string;
  ingredients: RawRecipeIngredient[];
  instructions: string[];
  tags: string[];
  dateAdded: string;
}

export interface Database {
  recipes: RawRecipe[];
  ingredients: RawIngredient[];
}

/** A recipe ingredient after being joined against the ingredients table. */
export interface ResolvedIngredient extends RawRecipeIngredient {
  /** Falls back to a humanised form of `ingredientId` when the row is missing. */
  name: string;
  category: string | null;
  dietary: string[];
  allergens: string[];
  /** Nutrition contributed by *this line item* (amount x unit), not per 100g. */
  nutrition: Nutrition | null;
  /** Grams this line item was estimated to weigh; null when we couldn't convert. */
  grams: number | null;
  /** True when `ingredientId` has no row in the ingredients table. */
  missing: boolean;
}

export interface NutritionSummary {
  total: Nutrition;
  perServing: Nutrition;
  /** False when at least one ingredient could not be counted. */
  complete: boolean;
  /** Ingredient ids that were skipped, so the UI can be honest about it. */
  skipped: string[];
}

/** Shape returned by GET /api/recipes — enough to render a card, nothing more. */
export interface RecipeSummary {
  id: string;
  title: string;
  description: string;
  servings: number;
  prepTime: string;
  cookTime: string;
  totalTimeMinutes: number;
  difficulty: Difficulty;
  tags: string[];
  dateAdded: string;
  ingredientNames: string[];
  dietary: string[];
  allergens: string[];
  caloriesPerServing: number;
  /**
   * Ingredient ids with no row in the ingredients table. Non-empty means we do
   * not actually know everything this recipe contains — which is why the
   * allergen filter refuses to vouch for it (see listRecipes).
   */
  unknownIngredients: string[];
  /** False when any ingredient was left out of the calorie total. */
  nutritionComplete: boolean;
}

/** Shape returned by GET /api/recipes/:id. */
export interface RecipeDetail extends RecipeSummary {
  ingredients: ResolvedIngredient[];
  instructions: string[];
  nutrition: NutritionSummary;
}

export type SortField =
  | 'title'
  | 'prepTime'
  | 'totalTime'
  | 'difficulty'
  | 'calories'
  | 'dateAdded';

export type SortOrder = 'asc' | 'desc';

export interface RecipeQuery {
  search?: string;
  tags: string[];
  ingredients: string[];
  difficulty: Difficulty[];
  dietary: string[];
  excludeAllergens: string[];
  maxTotalTime?: number;
  sort: SortField;
  order: SortOrder;
}

/** Every value the filter UI needs to build its controls, derived from the data. */
/**
 * What POST /api/recipes accepts, after validation.
 *
 * Deliberately not the same as RawRecipe: times arrive as plain minutes rather
 * than "20 minutes" strings, and the server owns `id` and `dateAdded` - a client
 * must not be able to choose either.
 */
export interface NewRecipeInput {
  title: string;
  description: string;
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  difficulty: Difficulty;
  ingredients: RawRecipeIngredient[];
  instructions: string[];
  tags: string[];
}

/** Envelope for GET /api/recipes. */
export interface RecipeListResult {
  recipes: RecipeSummary[];
  /** How many recipes an allergen filter withheld for having unknown ingredients. */
  withheld: number;
}

export interface Facets {
  tags: string[];
  ingredients: { id: string; name: string }[];
  difficulties: Difficulty[];
  dietary: string[];
  allergens: string[];
}

export interface ApiError {
  error: { message: string; code: string };
}
