import { promises as fs } from 'fs';
import path from 'path';
import type { Database, RawIngredient, RawRecipe } from './types';

const DATA_PATH = path.join(__dirname, '../db/data.json');

/**
 * The whole "database" fits in memory, so we read it once and cache it. Swapping
 * this file for a real datastore later means changing `load()` and nothing else —
 * the rest of the app only ever talks to the Store interface below.
 */
export interface Store {
  recipes: RawRecipe[];
  ingredientsById: Map<string, RawIngredient>;
  ingredients: RawIngredient[];
}

let cache: Store | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A light structural check rather than a full schema validator. It catches the
 * failure that actually matters (the file is missing or is not shaped like our
 * database) without pulling in a validation library for a static fixture.
 */
function assertDatabase(value: unknown): asserts value is Database {
  if (!isRecord(value) || !Array.isArray(value.recipes) || !Array.isArray(value.ingredients)) {
    throw new Error('data.json must be an object with `recipes` and `ingredients` arrays');
  }
}

export async function load(): Promise<Store> {
  if (cache) return cache;

  const file = await fs.readFile(DATA_PATH, 'utf8');
  const parsed: unknown = JSON.parse(file);
  assertDatabase(parsed);

  cache = {
    recipes: parsed.recipes,
    ingredients: parsed.ingredients,
    // Pre-built index so joining a recipe's ingredients is O(1) per line item
    // instead of a scan of the ingredients array.
    ingredientsById: new Map(parsed.ingredients.map((i) => [i.id, i])),
  };
  return cache;
}

/**
 * Adds a recipe to the in-memory store.
 *
 * Deliberately does NOT write to data.json. The file is a fixture, and on a
 * free-tier host the filesystem is ephemeral anyway - a write would survive
 * until the instance sleeps and then silently vanish, which reads as a bug
 * rather than a limitation. In-memory resets on restart, and the UI says so.
 *
 * When this moves to a real datastore, this is the function that changes.
 */
export async function insertRecipe(recipe: RawRecipe): Promise<void> {
  const store = await load();
  store.recipes.push(recipe);
}

/** Test/dev hook: force the next `load()` to re-read from disk. */
export function clearCache(): void {
  cache = null;
}
