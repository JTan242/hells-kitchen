import { Router, type NextFunction, type Request, type Response } from 'express';
import { createRecipe, getFacets, getRecipe, listRecipes } from './recipes';
import type { Difficulty, RecipeQuery, SortField, SortOrder } from './types';
import { validateNewRecipe } from './validation';

const SORT_FIELDS: SortField[] = [
  'title',
  'prepTime',
  'totalTime',
  'difficulty',
  'calories',
  'dateAdded',
];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * Express types every query param as `string | string[] | undefined`. The readers
 * below narrow that at the boundary, so nothing deeper handles unknown input.
 */

/** Accepts both ?tags=a&tags=b and ?tags=a,b. */
function readList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value])
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

function readString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function readPositiveInt(value: unknown): number | undefined {
  const text = readString(value);
  if (text === undefined) return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Unrecognised values fall back rather than 400, so a junk sort key still renders. */
function readEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  const text = readString(value);
  return allowed.includes(text as T) ? (text as T) : fallback;
}

function parseQuery(req: Request): RecipeQuery {
  return {
    search: readString(req.query.search),
    tags: readList(req.query.tags),
    ingredients: readList(req.query.ingredients),
    difficulty: readList(req.query.difficulty).filter((d): d is Difficulty =>
      DIFFICULTIES.includes(d as Difficulty),
    ),
    dietary: readList(req.query.dietary),
    excludeAllergens: readList(req.query.excludeAllergens),
    maxTotalTime: readPositiveInt(req.query.maxTotalTime),
    sort: readEnum<SortField>(req.query.sort, SORT_FIELDS, 'title'),
    order: readEnum<SortOrder>(req.query.order, ['asc', 'desc'], 'asc'),
  };
}

/** Express 4 ignores rejected promises, which would hang the request. */
function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Separate from /recipes so the filter controls stay populated when nothing matches. */
router.get(
  '/facets',
  wrap(async (_req, res) => {
    res.json(await getFacets());
  }),
);

router.get(
  '/recipes',
  wrap(async (req, res) => {
    const { recipes, withheld } = await listRecipes(parseQuery(req));
    // An envelope leaves room for paging fields without breaking clients.
    res.json({ recipes, total: recipes.length, withheld });
  }),
);

/** Added recipes are in-memory only — see db.insertRecipe. */
router.post(
  '/recipes',
  wrap(async (req, res) => {
    const { value, errors } = validateNewRecipe(req.body);

    if (errors || !value) {
      // All failing fields at once, keyed to match the form's input names.
      res.status(400).json({
        error: { message: 'Some fields need attention', code: 'VALIDATION', fields: errors },
      });
      return;
    }

    const recipe = await createRecipe(value);
    res.status(201).location(`/api/recipes/${recipe.id}`).json(recipe);
  }),
);

router.get(
  '/recipes/:id',
  wrap(async (req, res) => {
    // `noUncheckedIndexedAccess` types route params as possibly undefined.
    const recipe = await getRecipe(req.params.id ?? '');
    if (!recipe) {
      res.status(404).json({ error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json(recipe);
  }),
);
