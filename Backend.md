# Backend guide

A file-by-file tour of `backend-app/`. Companion to [Frontend.md](./Frontend.md)
and [Review.md](./Review.md).

The backend is **seven source files (~920 lines) plus three test files**. It has one
job: answer questions about recipes over HTTP. It draws nothing, knows nothing
about buttons or colours, and never talks to a browser directly — only to the
frontend.

---

## 1. The map

```
backend-app/
├── db/
│   └── data.json         the "database" — 15 recipes, 46 ingredients (given to us)
└── src/
    ├── types.ts     152  ← the vocabulary. No logic at all.
    ├── db.ts         55  ← reads data.json into memory, once
    ├── nutrition.ts 152  ← the maths: amounts, units, calories
    ├── recipes.ts   238  ← the real logic: joining, filtering, sorting
    ├── validation.ts 139 ← checks the one endpoint that accepts a body
    ├── routes.ts    137  ← the HTTP surface. Guards the front door.
    ├── server.ts     53  ← startup, CORS, safety nets
    ├── nutrition.test.ts   85  ← 10 tests: parsing, conversion, summing
    └── recipes.test.ts    157  ← 19 tests: filtering, dietary claims, allergen safety
```

### The layers, and why the order matters

The files are listed above in dependency order: **each one only knows about the
ones above it.** `nutrition.ts` has never heard of HTTP. `db.ts` has never heard
of filtering. Nothing "reaches back up".

```
                                                       ┌──────────────┐
   a request arrives  ──────────────────────────────▶  │  server.ts   │  ports, CORS, safety nets
                                                       └──────┬───────┘
                                                              ▼
                                                       ┌──────────────┐
                                                       │  routes.ts   │  URL → clean, trusted values
                                                       └──────┬───────┘
                                                              ▼
                                                       ┌──────────────┐
                                                       │  recipes.ts  │  join, filter, sort
                                                       └──┬────────┬──┘
                                                          ▼        ▼
                                              ┌──────────────┐  ┌──────────────┐
                                              │ nutrition.ts │  │    db.ts     │
                                              │  (maths)     │  │  (the data)  │
                                              └──────────────┘  └──────┬───────┘
                                                                       ▼
                                                                  data.json
```

Why bother with layers on a project this small? Because each layer has exactly one
reason to change:

| If this changes… | …only this file changes |
|---|---|
| The data moves to Postgres | `db.ts` |
| The gram conversions get more accurate | `nutrition.ts` |
| A new filter is added | `recipes.ts` + one line in `routes.ts` |
| The API adds authentication | `server.ts` |

That is the whole payoff. Nothing else has to be touched.

---

## 2. `types.ts` — the vocabulary

**152 lines, zero logic.** It only declares *shapes*. Nothing here runs.

Its important idea is that there are **two different vocabularies**, and mixing
them up is the mistake this file prevents.

```
     WHAT IS IN THE FILE                  WHAT THE API SENDS OUT
     ───────────────────                  ──────────────────────
     RawRecipe          ─── join ───▶     RecipeSummary   (cards)
     RawIngredient          + maths       RecipeDetail    (one recipe)
                                          ResolvedIngredient
                                          NutritionSummary
```

- **`Raw*` types** mirror `data.json` exactly. Ugly bits included: `amount` is a
  *string* (`"1/3"`), `difficulty` is a plain string, times are `"20 minutes"`.
- **Everything else** is the API contract — what the frontend actually receives,
  after the joining and the maths are done.

Keeping them separate means the data file's format and the API's format can evolve
independently. If `data.json` is replaced tomorrow, only the `Raw*` types and
`db.ts` change; the frontend never notices.

### `RecipeSummary` vs `RecipeDetail`

The same idea applied to payload size:

```ts
RecipeSummary   // title, times, difficulty, tags, calories/serving …
RecipeDetail extends RecipeSummary {
  ingredients: ResolvedIngredient[];   // + the full ingredient list
  instructions: string[];              // + every step
  nutrition: NutritionSummary;         // + the full breakdown
}
```

A card in a grid needs a title and a calorie count. It does not need every
instruction step. So `GET /api/recipes` sends the small one (×15) and
`GET /api/recipes/1` sends the big one (×1).

---

## 3. `db.ts` — reading the data

**55 lines. Job: turn a file on disk into something the rest of the app can query.**

Three decisions live here.

### It reads the file once and keeps it

```ts
let cache: Store | null = null;

export async function load(): Promise<Store> {
  if (cache) return cache;
  // ...read, parse, index...
  return cache;
}
```

Re-reading and re-parsing 25 KB of JSON on every request would be pure waste. The
data never changes while the server runs, so it is read on the first call and
handed back instantly on every call after.

### It builds a lookup index

```ts
ingredientsById: new Map(parsed.ingredients.map((i) => [i.id, i]))
```

A **`Map`** is a lookup table: give it `"tomato"`, get that ingredient back
immediately. Without it, finding `"tomato"` means scanning all 46 ingredients, and
a 5-ingredient recipe does 5 scans.

At this size nobody would ever notice the difference. It is one line, it is the
right habit, and it is the difference between "fast" and "slow" the moment the
data grows.

### It checks the file is shaped like a database

```ts
function assertDatabase(value: unknown): asserts value is Database {
  if (!isRecord(value) || !Array.isArray(value.recipes) || !Array.isArray(value.ingredients)) {
    throw new Error('data.json must be an object with `recipes` and `ingredients` arrays');
  }
}
```

A deliberately light check, not a full schema validator. It catches the failure
that actually matters — the file is missing or corrupt — without adding a
validation library for a fixture that never changes.

That `asserts value is Database` return type is a TypeScript feature worth
knowing: it tells the compiler *"if this function returns without throwing, the
value is definitely a `Database` from here on."* After the call, the rest of the
function can use `parsed.recipes` safely.

### The `Store` it hands back

```ts
export interface Store {
  recipes: RawRecipe[];
  ingredients: RawIngredient[];
  ingredientsById: Map<string, RawIngredient>;
}
```

**This is the seam.** Every other file talks to `Store`, never to the filesystem.
Swapping `data.json` for Postgres means rewriting `load()` and changing nothing
else in the project.

---

## 4. `nutrition.ts` — the maths

**152 lines. Four pure functions plus one lookup table.**

"Pure" means: same input → same output, no side effects, no network, no clock. It
makes these the easiest functions in the project to reason about and to test.

### The two assumptions it is built on

Both are written at the top of the file, because they are not derivable from the
data and nobody should have to re-guess them.

**1. Nutrition is per 100 grams.** `data.json` never says so. But chicken breast
165, ground beef 250, mozzarella 280 are all the standard per-100 g figures, so
that is the basis.

```ts
const NUTRITION_BASIS_GRAMS = 100;
```

**2. Units convert to grams via a fixed table.**

```ts
const UNIT_GRAMS: Record<string, number> = {
  g: 1, ml: 1, oz: 28.35, lb: 453.6,
  cup: 240, cups: 240, tbsp: 15, tsp: 5,
  medium: 120, large: 180, clove: 5, leaves: 0.5, head: 500, ...
};
```

This is the honest weak point of the whole app. **A cup is a volume; a gram is a
weight**, and the relationship depends on the ingredient — a cup of flour is
~120 g, a cup of milk is ~240 g. Same cup, double the weight. The table uses one
number per unit for every ingredient, so the totals are **estimates**, and the UI
says so rather than pretending otherwise.

The proper fix is a `gramsPerUnit` field on each ingredient row. Every conversion
in the app funnels through one function, so that change would be contained.

### `parseAmount` — the string problem

`amount` is a **string** in the data, because it holds things like `"1/3"`. So it
has to be parsed rather than just read:

| Input | Output | Why |
|---|---|---|
| `"2"` | `2` | plain number |
| `"2.5"` | `2.5` | decimal |
| `"1/3"` | `0.333…` | fraction |
| `"1 1/2"` | `1.5` | mixed number |
| `"to taste"` | `null` | unparseable |

That `null` is the important case. It is the function's way of saying **"I have no
answer"**, and because of TypeScript's strict mode the caller is *forced* to
handle it. It cannot be accidentally treated as zero.

### `toGrams` — amount + unit → weight

```ts
toGrams("2", "cups")   →  2 × 240   =  480 g
toGrams("1/3", "cup")  →  0.333 × 240 =  80 g
toGrams("2", "sprigs") →  null            (unit not in the table)
```

### `scaleNutrition` — the actual calculation

```
2 cups of tomato                    →  2 × 240 g          =  480 g
480 g of something at 25 kcal/100g  →  480/100 × 25       =  120 kcal
```

### `summariseNutrition` — adding it up honestly

Sums every line item, divides by servings, and returns **two extra fields that
matter more than the numbers**:

```ts
{
  total:      { calories: 3521, ... },
  perServing: { calories: 880,  ... },
  complete: false,              // ← something could not be counted
  skipped: ["basil"],           // ← and here is what
}
```

Two things routinely fail — an ingredient has no row in the table (the data has
eight of these), or its unit is not convertible. **Neither throws.** Both are
skipped and *named*, so the UI can show a total and simultaneously say what is
missing from it.

That is the principle the whole app follows: **never show a confidently wrong
number.** `"880 kcal, excluding 1 ingredient"` is useful. `"880 kcal"` alone,
when it is silently incomplete, is not.

It also guards the division:

```ts
const divisor = servings > 0 ? servings : 1;
```

A `servings: 0` in the data would otherwise produce `Infinity` and render as
garbage on the page.

---

## 5. `recipes.ts` — the real logic

**238 lines. The biggest file, and the one doing the actual work.** Everything
here is about turning raw rows into answers.

### The core problem it solves: the join

A recipe does **not** contain nutrition. It contains a *pointer*:

```json
{ "ingredientId": "tomato", "amount": "2", "unit": "cups" }
```

To learn anything nutritional you must look up `"tomato"` in the ingredients
table. That lookup is called a **join**, and `resolveIngredients` is where it
happens:

```
   recipe line item          ingredients table            resolved
   ────────────────          ─────────────────            ────────
   tomato, 2, cups    ──▶    { name: "Diced Tomatoes",    { name: "Diced Tomatoes",
                                nutrition: {25,...} }        grams: 480,
                                                             nutrition: {120,...},
                                                             missing: false }

   basil, 10, leaves  ──▶    ✗ not in the table           { name: "Basil",
                                                             grams: 5,
                                                             nutrition: null,
                                                             missing: true }
```

**The second row is the trap in this dataset.** Eight ingredient ids — `basil`,
`broccoli`, `brown_sugar`, `butter`, `carrot`, `ginger`, `soy_sauce`,
`white_sugar` — are referenced by recipes but have no row. The obvious code:

```ts
ingredients.find(i => i.id === line.ingredientId).nutrition.calories   // 💥 crashes
```

`.find()` returns `undefined` when there is no match, and you cannot read
`.nutrition` off `undefined`. TypeScript's strict mode makes this *impossible to
write*, which is the single best argument for having used it here.

Missing ingredients also get a readable name from their id, so the UI has
something sensible to print:

```ts
humanise("brown_sugar")  →  "Brown Sugar"
```

### `deriveDietary` — and the one place the logic gets careful

Deciding whether a recipe is vegan is an **intersection**: it is vegan only if
*every* ingredient is vegan. One knob of butter and the claim is gone.

But that reasoning is only sound if we know every ingredient — **and eight are
missing.** If a recipe contains butter, and `butter` has no row, an intersection
over the remaining ingredients would happily conclude "vegan".

That is not a rounding error. It is a false claim about food someone may have a
real reason to avoid. So:

```ts
const complete = ingredients.length > 0 && ingredients.every((i) => !i.missing);
if (complete) {
  // safe to derive
}
```

**Derivation only runs when every ingredient resolves.** Otherwise the recipe's
own author-written tags are used unchanged. A gap in the data can never invent a
dietary claim.

One inference is added on top:

```ts
if (claims.has('vegan')) claims.add('vegetarian');
```

The data only ever tags the stricter one, so without this a "vegetarian" filter
would hide vegan recipes.

### `listRecipes` — filtering and sorting

The heart of `GET /api/recipes`. For each of the 15 recipes it builds a summary,
then applies each filter as a "skip if not matching" check:

```ts
if (query.search && !matchesSearch(...)) continue;
if (!query.tags.every((tag) => summary.tags.includes(tag))) continue;
if (!query.dietary.every((term) => summary.dietary.includes(term))) continue;
if (query.difficulty.length && !query.difficulty.includes(summary.difficulty)) continue;
if (query.excludeAllergens.some((a) => summary.allergens.includes(a))) continue;
if (query.maxTotalTime !== undefined && summary.totalTimeMinutes > query.maxTotalTime) continue;
```

Behaviours worth knowing, because they differ deliberately:

| Filter | Logic | Why |
|---|---|---|
| tags, ingredients, dietary | **AND** — must match all | Each extra choice should *narrow*. That is what a filter is for. |
| difficulty | **OR** — any one matches | A recipe has exactly one difficulty. AND across two would always return zero, which reads as a broken UI. |
| excludeAllergens | **NONE** — must match none, *and* the data must be complete | See below. |

### The allergen filter is the one place the app refuses to guess

Every other incomplete-data case in this app costs accuracy. This one could cost
someone an allergic reaction, so it behaves differently:

```ts
if (filteringAllergens) {
  if (query.excludeAllergens.some((a) => summary.allergens.includes(a))) continue;
  if (summary.unknownIngredients.length > 0) { withheld += 1; continue; }
}
```

Chicken Stir-Fry contains soy sauce. `soy_sauce` has no row in the ingredients
table, so the recipe reports **zero allergens** — and before this rule existed,
filtering "exclude gluten" showed it as safe. It was a real bug, not a
hypothetical.

Now any recipe that cannot account for all its ingredients is withheld from
allergen-filtered results and counted in `withheld`, which the UI turns into
*"2 recipes are hidden because their ingredient data is incomplete."* Withholding
loses two valid results; the alternative loses trust.

### `matchesSearch` — what "search" actually searches

Not just the title. It builds one big lowercase string out of everything a cook
might type, then requires **every word** to appear somewhere in it:

```
title + description + tags + ingredient names + ingredient ids
```

Including the raw ids (with `_` swapped for a space) means `"brown sugar"` and
`"brown_sugar"` both hit. Requiring every word means `"chicken rice"` narrows
rather than widens.

### `comparator` — sorting

Six sort fields, ascending or descending. The only subtlety is the tiebreaker:

```ts
return (result || a.title.localeCompare(b.title)) * direction;
```

When two recipes tie — and with only three difficulty values, many do — they fall
back to alphabetical order. Without this, the order of equal items would be
arbitrary and could shuffle between requests.

### `getFacets` — where the filter UI gets its options

Returns every tag, ingredient, diet and allergen **that actually appears in the
data**. The frontend builds its filter chips from this, which means:

- The UI can never offer an option that matches nothing.
- Adding a recipe with a new tag makes that tag appear in the UI with **no code
  change** on either side.

---

## 6. `routes.ts` — the HTTP surface

**137 lines. Job: translate between the messy outside world and clean internal values.**

### The four endpoints

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /api/health` | `{ status: "ok" }` | Is the server alive? |
| `GET /api/facets` | all filter options | Separate from `/recipes` so the controls stay populated even when the filters match nothing |
| `GET /api/recipes` | `{ recipes: [...], total: n, withheld: n }` | Filtered and sorted; `withheld` counts recipes the allergen filter could not vouch for |
| `GET /api/recipes/:id` | one full recipe, or 404 | |
| `POST /api/recipes` | 201 + the created recipe, or 400 | The only endpoint that writes |

### `POST /api/recipes`

The only write. Three decisions worth knowing:

**Validation lives in `validation.ts`, not here.** A recipe body is a nested
structure, so checking it would have doubled the size of `routes.ts`. It is the
same boundary job, just big enough to deserve its own file.

**Every bad field is reported at once**, not just the first:

```json
{ "error": { "message": "Some fields need attention", "code": "VALIDATION",
  "fields": { "title": "Title is required",
              "ingredients.0.amount": "Use a number or a fraction, e.g. 2 or 1/3" } } }
```

The keys match the form's input names, so the UI drops each message next to the
input it belongs to. Making the user resubmit to discover the next problem would
be worse.

**The server owns `id` and `dateAdded`.** `NewRecipeInput` is deliberately not
`RawRecipe`: times arrive as plain minutes (`prepTimeMinutes: 20`) rather than
`"20 minutes"`, and a client cannot choose its own id.

Added recipes go to the in-memory store only — see `insertRecipe` in `db.ts`.

### Its real job: guarding the boundary

Everything arriving over the network is untrusted. A query parameter can be
missing, doubled (`?tags=a&tags=b`), or nonsense (`?sort=<script>`). Express types
all of them as `string | string[] | undefined`, which is honest but unusable.

The four small helpers narrow that mess into values the rest of the app can trust:

```ts
readList("italian,vegan")   →  ["italian", "vegan"]
readList(["a", "b"])        →  ["a", "b"]         // ?tags=a&tags=b
readList(undefined)         →  []
readPositiveInt("30")       →  30
readPositiveInt("abc")      →  undefined
readEnum("bogus", SORT_FIELDS, "title")  →  "title"
```

**Past this file, nothing deals in unknown input.** `recipes.ts` receives a clean
`RecipeQuery` object where every field is exactly the type it claims to be. That
is the entire point of having a boundary layer.

### One judgement call: junk falls back, it does not fail

```ts
readEnum(req.query.sort, SORT_FIELDS, 'title')
```

`?sort=bogus` **silently becomes `?sort=title`** rather than returning a
`400 Bad Request`. A junk sort key should still show you a page of recipes. The
strict alternative is defensible and, in practice, just annoying.

Note this differs from the *filters*: an unrecognised tag genuinely matches
nothing, so it correctly returns an empty list. Falling back only applies where
there is a sensible default.

### `wrap` — a small but load-bearing helper

```ts
function wrap(handler) {
  return (req, res, next) => { handler(req, res).catch(next); };
}
```

Express 4 does not understand `async` functions. If one rejects, Express never
finds out — **the request just hangs until the browser times out**. This forwards
the rejection to the error handler in `server.ts`. Four lines that prevent a whole
class of invisible failure.

### The envelope

```ts
res.json({ recipes, total: recipes.length, withheld });
```

Returning an envelope rather than a bare `[...]` is what made `withheld` free to
add, and leaves room for `page` / `pageSize` / `hasMore` later without breaking
any existing client.

---

## 7. `server.ts` — startup and safety nets

**53 lines. The thinnest file, and mostly setup.**

```ts
app.use(cors(corsOptions));   // let the browser call :8080 from a page on :3000
app.use(express.json());      // parse JSON request bodies
app.use('/api', router);      // everything in routes.ts lives under /api
```

`cors()` is the one that trips people up. Browsers block a page served from
`localhost:3000` from calling `localhost:8080` unless the server explicitly
permits it. This is that permission.

Unset, it permits **any** origin — right for local development, wrong in
production. Setting `ALLOWED_ORIGIN` to the deployed frontend URL restricts it:

```ts
const corsOptions = ALLOWED_ORIGIN
  ? { origin: ALLOWED_ORIGIN.split(',').map((o) => o.trim()) }
  : {};
```

The startup log prints which mode it is in, so a misconfigured deploy is visible
in the first line of the logs.

Note `app.use('/api', router)` — this is why there is **nothing at
`http://localhost:8080/`**. The routes are mounted under `/api`, and the root
falls through to the catch-all below.

### Two safety nets

```ts
// 1. unknown route → the same JSON envelope as every other error
app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
});

// 2. anything that threw → logged in full, but the response says nothing specific
app.use((err, _req, res, _next) => {
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL' } });
});
```

- The **404** matters because Express's default is an HTML error page. The
  frontend would have to parse HTML to find out what went wrong. Every failure
  from this API is JSON in the same shape.
- The **500** logs the real error where you can see it, but the response is
  deliberately generic. Stack traces and file paths never leave the process.

### It loads the data before it listens

```ts
load()
  .then((store) => { app.listen(PORT, ...); })
  .catch((err) => { console.error(...); process.exit(1); });
```

If `data.json` is missing or corrupt, the server **refuses to start** with a clear
message. The alternative — start fine, then fail on the first user request — turns
a boot-time error into a mysterious runtime one.

---

## 8. One request, all the way down

**`GET /api/recipes?dietary=vegan&sort=calories&order=desc`**

```
1. server.ts    request arrives on :8080, passes CORS, routed to /api
                                                                    │
2. routes.ts    parseQuery() turns the messy query string into:      ▼
                { dietary: ["vegan"], sort: "calories", order: "desc", tags: [], ... }
                                                                    │
3. recipes.ts   load() → the cached Store (no disk read)            ▼
                for each of 15 recipes:
                  ├─ resolveIngredients()  join each line item against the table
                  ├─ nutrition.ts          toGrams() → scaleNutrition() → sum
                  ├─ deriveDietary()       is it vegan? (only if data is complete)
                  └─ keep it?              dietary filter says vegan only → 2 survive
                                                                    │
4. recipes.ts   sort by calories, descending, title as tiebreaker   ▼
                                                                    │
5. routes.ts    wrap in the envelope: { recipes: [...], total: 2 }  ▼
                                                                    │
6. server.ts    sent as JSON                                        ▼
```

**`GET /api/recipes/9999`** takes the same path until step 3, where
`getRecipe()` finds nothing and returns `null`. `routes.ts` turns that into
`404 { error: { message: "Recipe not found", code: "NOT_FOUND" } }`.

---

## 9. "I want to change X — which file?"

| Goal | File |
|---|---|
| Make calorie figures more accurate | `nutrition.ts` — the `UNIT_GRAMS` table |
| Support a new unit (`"pinch"`, `"dash"`) | `nutrition.ts` — add it to `UNIT_GRAMS` |
| Add a filter | `recipes.ts` (`RecipeQuery` + `listRecipes`) and one line in `routes.ts` |
| Add a sort option | `SortField` in `types.ts` + `comparator` in `recipes.ts` + `SORT_FIELDS` in `routes.ts` |
| Change what a card shows | `RecipeSummary` in `types.ts` + `toSummary` in `recipes.ts` |
| Change search behaviour | `matchesSearch` in `recipes.ts` |
| Move off `data.json` to a real database | `db.ts` — `load()` only |
| Add pagination | `listRecipes` in `recipes.ts`; the envelope already has room |
| Change the port | `PORT` env var, read in `server.ts` |
| Add authentication | `server.ts` — middleware before `app.use('/api', router)` |

---

## 10. The tests

`npm test` runs 49 Vitest tests across three files. No mocks, no fixtures, no test
database — the logic is pure enough to call directly.

**`nutrition.test.ts` (10)** covers the parsing and maths:

```ts
parseAmount("1 1/2")          === 1.5
parseAmount("to taste")       === null      // not NaN
toGrams("2", "cups")          === 480
toGrams("2", "sprigs")        === null      // unknown unit
summariseNutrition([...], 0)                // must not produce Infinity
```

**`validation.test.ts` (20)** covers the write path: required fields, fraction
amounts (`1/3` accepted, `lots` rejected), `"4abc"` not passing as a number, a
zero cook time allowed but a zero prep time not, tag normalisation, and errors
being reported per-row (`ingredients.1.ingredientId`) rather than in bulk.

**`recipes.test.ts` (19)** covers the behaviour that would be harmful if wrong,
going through the public functions rather than reaching into private ones:

- *A recipe with unknown ingredients is never labelled vegan.* This is the claim
  §5 explains, and it is the single most important test in the suite.
- *The allergen filter withholds Chicken Stir-Fry* and returns only recipes whose
  ingredient data is complete.
- AND-vs-OR filter semantics, search narrowing, sort ordering, and `getRecipe`
  returning `null` rather than throwing for an unknown id.

The remaining gap is the frontend's `lib/format.ts` — the fraction rendering has
real edge cases and no coverage.
