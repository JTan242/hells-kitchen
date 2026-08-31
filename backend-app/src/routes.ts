import { Router, type Request, type Response, type NextFunction } from 'express';
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
 * Express hands us `string | string[] | undefined` for every query param. These
 * helpers narrow that to something the service layer can trust, so validation
 * lives at the HTTP boundary and nothing below it deals in unknown input.
 */
function readList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((v): v is string => typeof v === 'string')
    // Accept both ?tags=a&tags=b and ?tags=a,b so the URL stays hand-editable.
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

/** Unknown values fall back to the default instead of 400-ing: a junk sort key
 *  should still render a page of recipes rather than an error screen. */
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

/** Wraps an async handler so a rejected promise reaches the error middleware
 *  instead of hanging the request. Express 4 does not do this for us. */
function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Filter options for the UI. Separate from /recipes so the controls stay
 *  populated even when the current filters match nothing. */
router.get(
  '/facets',
  wrap(async (_req, res) => {
    res.json(await getFacets());
  }),
);

router.get(
  '/recipes',
  wrap(async (req, res) => {
    const query = parseQuery(req);
    const { recipes, withheld } = await listRecipes(query);
    // Envelope rather than a bare array: leaves room to add paging metadata
    // without breaking clients. `withheld` lets the UI explain why an allergen
    // filter returned fewer recipes than the user might expect.
    res.json({ recipes, total: recipes.length, withheld });
  }),
);

/**
 * The one endpoint that writes. Added recipes live in memory only - see
 * `insertRecipe` in db.ts for why - and the UI says so on the form.
 */
router.post(
  '/recipes',
  wrap(async (req, res) => {
    const { value, errors } = validateNewRecipe(req.body);

    if (errors || !value) {
      // Every failing field at once, so the form can show them all rather than
      // making the user resubmit to discover the next problem.
      res.status(400).json({
        error: { message: 'Some fields need attention', code: 'VALIDATION', fields: errors },
      });
      return;
    }

    const recipe = await createRecipe(value);
    // 201 plus a Location header: the standard way to say "created, and it lives here".
    res.status(201).location(`/api/recipes/${recipe.id}`).json(recipe);
  }),
);

router.get(
  '/recipes/:id',
  wrap(async (req, res) => {
    // `noUncheckedIndexedAccess` makes route params `string | undefined`; Express
    // guarantees this one exists, but we normalise rather than assert.
    const recipe = await getRecipe(req.params.id ?? '');
    if (!recipe) {
      res.status(404).json({ error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
      return;
    }
    res.json(recipe);
  }),
);
