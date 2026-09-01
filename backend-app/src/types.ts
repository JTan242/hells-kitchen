/**
 * `Raw*` types mirror db/data.json exactly. Everything else is the API contract,
 * built by joining the two and running the nutrition maths.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Nutrition values are per 100g — see nutrition.ts. */
export interface RawIngredient {
  id: string;
  name: string;
  category: string;
  nutrition: Nutrition;
  commonAllergens: string[];
  dietary: string[];
}

/** `amount` is a string because the data holds fractions like "1/3". */
export interface RawRecipeIngredient {
  ingredientId: string;
  amount: string;
  unit: string;
}

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

/** A recipe ingredient joined against the ingredients table. */
export interface ResolvedIngredient extends RawRecipeIngredient {
  /** Humanised from `ingredientId` when the row is missing. */
  name: string;
  category: string | null;
  dietary: string[];
  allergens: string[];
  /** This line item's contribution, or null if the row or unit was unknown. */
  nutrition: Nutrition | null;
  grams: number | null;
  missing: boolean;
}

export interface NutritionSummary {
  total: Nutrition;
  perServing: Nutrition;
  /** False when an ingredient was left out of the total. */
  complete: boolean;
  /** Ingredient ids omitted from the total. */
  skipped: string[];
}

/** GET /api/recipes — enough to render a card. */
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
   * Ingredient ids with no row in the table. Non-empty means the recipe's
   * contents are not fully known, so the allergen filter will not vouch for it.
   */
  unknownIngredients: string[];
  nutritionComplete: boolean;
}

/** GET /api/recipes/:id. */
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

/**
 * POST /api/recipes body, after validation. Times are plain minutes here;
 * `id` and `dateAdded` are assigned by the server, never the client.
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

export interface RecipeListResult {
  recipes: RecipeSummary[];
  /** Recipes an allergen filter withheld for having unknown ingredients. */
  withheld: number;
}

/** Filter options derived from the data, so the UI hardcodes nothing. */
export interface Facets {
  tags: string[];
  ingredients: { id: string; name: string }[];
  difficulties: Difficulty[];
  dietary: string[];
  allergens: string[];
}
