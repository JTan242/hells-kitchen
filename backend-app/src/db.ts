import { promises as fs } from 'fs';
import path from 'path';
import type { Database, RawIngredient, RawRecipe } from './types';

const DATA_PATH = path.join(__dirname, '../db/data.json');

/** The only interface the rest of the app uses; swapping the data source means changing this file alone. */
export interface Store {
  recipes: RawRecipe[];
  ingredientsById: Map<string, RawIngredient>;
  ingredients: RawIngredient[];
}

let cache: Store | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertDatabase(value: unknown): asserts value is Database {
  if (!isRecord(value) || !Array.isArray(value.recipes) || !Array.isArray(value.ingredients)) {
    throw new Error('data.json must be an object with `recipes` and `ingredients` arrays');
  }
}

/** Reads and indexes data.json on first call, then serves from memory. */
export async function load(): Promise<Store> {
  if (cache) return cache;

  const parsed: unknown = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  assertDatabase(parsed);

  cache = {
    recipes: parsed.recipes,
    ingredients: parsed.ingredients,
    ingredientsById: new Map(parsed.ingredients.map((i) => [i.id, i])),
  };
  return cache;
}

/**
 * Appends to the in-memory store only; data.json is never written to.
 * Added recipes are therefore lost on restart, which the create form states.
 */
export async function insertRecipe(recipe: RawRecipe): Promise<void> {
  const store = await load();
  store.recipes.push(recipe);
}
