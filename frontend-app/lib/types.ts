/**
 * The API contract, from the client's side.
 *
 * TRADE-OFF: this duplicates `backend-app/src/types.ts` by hand. A shared
 * workspace package would guarantee they stay in step, but it adds monorepo
 * tooling to a two-app take-home. Copying is the cheaper choice at this size;
 * the moment a third consumer appears, extract a `packages/shared` instead.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ResolvedIngredient {
  ingredientId: string;
  amount: string;
  unit: string;
  name: string;
  category: string | null;
  dietary: string[];
  allergens: string[];
  nutrition: Nutrition | null;
  grams: number | null;
  missing: boolean;
}

export interface NutritionSummary {
  total: Nutrition;
  perServing: Nutrition;
  complete: boolean;
  skipped: string[];
}

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
  /** Ingredient ids with no row in the ingredients table. */
  unknownIngredients: string[];
  /** False when an ingredient was left out of the calorie total. */
  nutritionComplete: boolean;
}

export interface RecipeDetail extends RecipeSummary {
  ingredients: ResolvedIngredient[];
  instructions: string[];
  nutrition: NutritionSummary;
}

export interface RecipeListResponse {
  recipes: RecipeSummary[];
  total: number;
  /** Recipes an allergen filter withheld because their ingredient data is incomplete. */
  withheld: number;
}

/**
 * What the create form sends. Times are plain minutes here; the server turns them
 * into the "20 minutes" strings the rest of the data uses. `id` and `dateAdded`
 * are the server's to assign.
 */
export interface NewRecipeInput {
  title: string;
  description: string;
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  difficulty: Difficulty;
  ingredients: { ingredientId: string; amount: string; unit: string }[];
  instructions: string[];
  tags: string[];
}

export interface Facets {
  tags: string[];
  ingredients: { id: string; name: string }[];
  difficulties: Difficulty[];
  dietary: string[];
  allergens: string[];
}

export type SortField =
  | 'title'
  | 'prepTime'
  | 'totalTime'
  | 'difficulty'
  | 'calories'
  | 'dateAdded';
