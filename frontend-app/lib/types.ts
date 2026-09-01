/**
 * The API contract. Hand-mirrored from backend-app/src/types.ts, so the two can
 * drift — change both together. Extract a shared package if a third consumer
 * appears.
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

/** POST body. Times are plain minutes; `id` and `dateAdded` are server-assigned. */
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
