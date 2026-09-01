# Backend — `backend-app/`

Express + TypeScript. One job: answer questions about recipes over HTTP. Seven
source files, ~900 lines, no database. Companion: [Frontend.md](./Frontend.md),
[Review.md](./Review.md).

---

## 1. Dependency order

Each file imports only from the ones below it. Nothing reaches back up.

```
server.ts      boot, CORS, 404/500 nets
  ├─ routes.ts        URL/body → trusted values, JSON out
  │    ├─ validation.ts    POST body → NewRecipeInput | field errors
  │    └─ recipes.ts       join, derive, filter, sort          ← the logic
  │         ├─ nutrition.ts    amount + unit → grams → kcal    (pure)
  │         └─ db.ts           data.json → in-memory Store
  └─ db.ts            also imported directly, to load() before listen()

types.ts       shapes only, zero runtime code — imported by everything
```

**Why layered at this size:** each layer has exactly one reason to change.

| Change | Touches |
|---|---|
| Move to Postgres | `db.ts` (`load()` only) |
| More accurate gram conversions | `nutrition.ts` |
| New filter | `recipes.ts` + one line in `routes.ts` |
| Auth, rate limiting | `server.ts` |

---

## 2. How a response is built up

`data.json` is two tables. A recipe holds **ids**, not nutrition:

```json
{ "ingredientId": "tomato", "amount": "2", "unit": "cups" }
```

Everything the API returns comes from resolving that pointer, in this order:

```
RawRecipe                  ← a row in data.json
   │ resolveIngredients()    join each line against ingredientsById
   ▼                         unknown id → { missing: true, nutrition: null }
ResolvedIngredient[]       + name, grams, per-line nutrition, allergens, dietary
   │ summariseNutrition()  → total, perServing, complete, skipped[]
   │ deriveDietary()       → vegan / vegetarian / … claims
   ▼
RecipeSummary              card payload — no instructions, no ingredient list
   │ + ingredients + instructions + full nutrition
   ▼
RecipeDetail               detail payload
```

`GET /api/recipes` returns 15 summaries; `GET /api/recipes/1` returns one detail.
Splitting the two keeps the list payload small — a card needs a calorie count, not
every instruction step.

---

## 3. The three data problems everything else reacts to

These are the reason the code looks the way it does.

| Problem | How it is handled |
|---|---|
| Nutrition has **no stated unit** | Assumed per 100 g (`NUTRITION_BASIS_GRAMS`); the values match standard per-100 g references — chicken 165, beef 250 |
| Recipes measure **volume**, nutrition measures **weight** | One gram figure per unit (`UNIT_GRAMS`). A cup of flour vs a cup of milk differ ~2×, so totals are **estimates** and are labelled as such |
| **8 ingredient ids have no row** — `basil`, `butter`, `soy_sauce`, `brown_sugar`, `white_sugar`, `carrot`, `ginger`, `broccoli` | Never throw. Flag `missing: true`, name it in `skipped`, and refuse to make claims the data cannot support |

---

## 4. File by file

### `types.ts` — the vocabulary (155 lines, no logic)

Two vocabularies, deliberately separate:

- **`Raw*`** mirrors `data.json` exactly, ugly bits included — `amount` is a
  *string* (`"1/3"`), `prepTime` is `"20 minutes"`, `difficulty` is a free string.
- **Everything else** is the API contract: `RecipeSummary`, `RecipeDetail`,
  `ResolvedIngredient`, `NutritionSummary`, `Facets`, `RecipeQuery`.

**Tradeoff:** the split lets the fixture format and the wire format evolve
independently — replacing `data.json` touches `Raw*` and `db.ts` and nothing else.
The cost is a mapping layer (`toSummary`) that one shared type would not need.

### `db.ts` — the data seam (48 lines)

```ts
export interface Store {
  recipes: RawRecipe[];
  ingredients: RawIngredient[];
  ingredientsById: Map<string, RawIngredient>;
}
```

- `load()` reads and parses **once**, then serves the cache. The file cannot change
  while the server runs, so re-reading 25 KB per request is pure waste.
- Builds a `Map` index so the join is O(1) per line item instead of a scan of 46
  ingredients. Invisible at this size; free to write; correct the moment it grows.
- `assertDatabase()` is a deliberately light shape check, not a schema library — it
  catches "file missing or corrupt", the only failure a fixture actually has. The
  `asserts value is Database` signature narrows the type for the rest of the call.
- `insertRecipe()` pushes to the in-memory array only. **`data.json` is never
  written.** Added recipes vanish on restart, which the create form says out loud.

**Why it matters:** every other file talks to `Store`, never to the filesystem.

### `nutrition.ts` — the maths (132 lines, all pure functions)

| Function | Does |
|---|---|
| `parseAmount("1 1/2")` → `1.5` | Handles `"2"`, `"2.5"`, `"3/4"`, `"1 1/2"`; **`null`** for `"to taste"` |
| `toGrams("2", "cups")` → `480` | `null` if the amount is unreadable *or* the unit is not in `UNIT_GRAMS` |
| `scaleNutrition(per100g, grams)` | `grams / 100 × each macro` |
| `summariseNutrition(items, servings)` | Sums, divides, and reports what it could not count |

Two decisions worth defending:

**`null`, not `0`, for "I don't know."** Strict mode then *forces* the caller to
handle it, so an unparseable amount can never silently become zero calories.

**Never show a confidently wrong number.** `summariseNutrition` returns
`complete: false` and `skipped: ["butter", "white_sugar"]` alongside the totals, so
the UI can print `"≥ 880 kcal, excludes 2 ingredients"`. It also guards
`servings > 0 ? servings : 1` — a `servings: 0` in the data would render `Infinity`.

**Known weak point:** `UNIT_GRAMS` holds one number per unit for every ingredient.
The real fix is a `gramsPerUnit` field per ingredient; every conversion funnels
through `toGrams`, so that change stays contained to this file.

### `recipes.ts` — the logic (251 lines, the biggest file)

| Function | Does |
|---|---|
| `resolveIngredients` | The join. Unknown id → `missing: true`, name humanised from the id (`brown_sugar` → `Brown Sugar`) |
| `deriveDietary` | Intersection across ingredients — vegan only if *every* ingredient is |
| `toSummary` / `toDetail` | Assemble the two payloads (both take already-resolved ingredients, so the join runs once) |
| `matchesSearch` | Every word must appear in title + description + tags + ingredient names + ids |
| `comparator` | Six sort fields, asc/desc, **title as tiebreaker** so equal rows keep a stable order |
| `listRecipes` | Filter loop + sort → `{ recipes, withheld }` |
| `getRecipe` | Returns `null` for an unknown id rather than throwing |
| `createRecipe` | Assigns the next numeric id and `dateAdded`; stores times as `"20 minutes"` so nothing downstream needs a special case |
| `getFacets` | Every tag / ingredient / diet / allergen present in the data |

**Dietary claims only derive when the data is complete.**

```ts
if (ingredients.length > 0 && ingredients.every((i) => !i.missing)) { /* derive */ }
```

If a recipe contains butter and `butter` has no row, an intersection over the
*remaining* ingredients would happily conclude "vegan". That is a false claim about
food someone avoids for real reasons, so an incomplete list falls back to the
author's own tags. One inference is layered on top: `vegan ⇒ vegetarian`, because
the data only ever tags the stricter term.

**Filter semantics differ on purpose:**

| Filter | Logic | Why |
|---|---|---|
| tags, ingredients, dietary | **AND** | Each extra choice should narrow. That is what a filter is for. |
| difficulty | **OR** | A recipe has one difficulty; AND across two always returns zero, which reads as a broken UI. |
| excludeAllergens | **NONE — *and* the data must be complete** | ↓ |

**The allergen filter is the one place the app refuses to guess.**

```ts
if (filteringAllergens) {
  if (query.excludeAllergens.some((a) => summary.allergens.includes(a))) continue;
  if (summary.unknownIngredients.length > 0) { withheld += 1; continue; }
}
```

Chicken Stir-Fry contains soy sauce; `soy_sauce` has no row, so the recipe reports
**zero allergens** — and "exclude gluten" showed it as safe. That was a real bug,
not a hypothetical. Recipes that cannot account for every ingredient are now
withheld and counted in `withheld`, which the UI explains.
**Tradeoff:** two valid results are lost; the alternative loses trust.

`getFacets` is what makes the filter UI data-driven — the frontend can never offer
an option that matches nothing, and a new tag in the data appears in the UI with no
code change on either side.

### `validation.ts` — the write boundary (135 lines)

The same boundary job as `routes.ts`, split out because the body is nested and
inlining it would have doubled that file.

- **Every bad field reported at once**, keyed `title`, `ingredients.0.amount`. The
  keys match the form's input names, so the UI drops each message beside its input.
  Failing on the first error would make the user resubmit to discover the next one.
- `Number(body.servings)`, not `parseInt` — `parseInt("4abc")` returns `4`.
- `isParseableAmount` deliberately mirrors `nutrition.parseAmount`, so `"1/3"` is
  accepted at the door and still parses downstream.
- A cook time of `0` is legal (Greek Salad); a prep time of `0` is not.

### `routes.ts` — the HTTP surface (124 lines)

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{ status: "ok" }` |
| `GET /api/facets` | All filter options — separate from `/recipes` so the controls stay populated when nothing matches |
| `GET /api/recipes` | `{ recipes, total, withheld }` |
| `GET /api/recipes/:id` | One `RecipeDetail`, or 404 |
| `POST /api/recipes` | 201 + the created recipe, or 400 with `fields` |

**Its real job is narrowing untrusted input.** Express types every query param as
`string | string[] | undefined` — honest, but unusable. Four readers fix that:

```ts
readList("italian,vegan")  → ["italian","vegan"]   // also handles ?tags=a&tags=b
readPositiveInt("abc")     → undefined
readEnum("bogus", SORT_FIELDS, "title") → "title"
```

Past this file nothing deals in unknown input; `recipes.ts` gets a clean
`RecipeQuery` where every field is the type it claims to be.

**Judgement call:** `?sort=bogus` silently becomes `?sort=title` rather than a 400.
A junk sort key should still show you recipes. This does *not* extend to filters —
an unrecognised tag genuinely matches nothing, so an empty list is the correct
answer. Fall back only where a sensible default exists.

**`wrap()`** — Express 4 ignores rejected promises, so an async handler that throws
leaves the request hanging until the browser times out. Four lines forwarding
`.catch(next)` to the error handler prevent a whole class of invisible failure.

**The envelope** — `{ recipes, total, withheld }` rather than a bare array is what
made `withheld` free to add, and leaves room for `page` / `hasMore` later without
breaking any existing client.

### `server.ts` — boot and safety nets (49 lines)

```ts
app.use(cors(corsOptions));   // let :3000 call :8080
app.use(express.json());
app.use('/api', router);      // ← why there is nothing at http://localhost:8080/
```

- **CORS unset permits any origin** — right locally, wrong in production. Set
  `ALLOWED_ORIGIN` to restrict; the startup log prints which mode it booted in.
- **404 handler** returns the same JSON envelope as everything else. Express's
  default is an HTML page, which would force the client to parse HTML to find out
  what went wrong.
- **500 handler** logs the real error, returns a generic message. Stack traces and
  file paths never leave the process.
- **`load()` before `listen()`** — a missing or corrupt `data.json` fails at boot
  with a clear message rather than on some user's first request.

---

## 5. One request, end to end

`GET /api/recipes?dietary=vegan&sort=calories&order=desc`

```
1  server.ts    CORS → /api → router
2  routes.ts    parseQuery() → { dietary:["vegan"], sort:"calories", order:"desc", … }
3  recipes.ts   load() → cached Store (no disk read)
                per recipe: resolveIngredients → nutrition → deriveDietary → toSummary
                filter loop: dietary must include "vegan"
4  recipes.ts   sort by calories desc, title as tiebreaker
5  routes.ts    res.json({ recipes, total, withheld })
```

`GET /api/recipes/9999` follows the same path until step 3, where `getRecipe`
returns `null` and `routes.ts` turns that into
`404 { error: { message: "Recipe not found", code: "NOT_FOUND" } }`.

`POST /api/recipes` diverges at step 2 into `validateNewRecipe` → either a 400 with
`fields`, or `createRecipe` → `insertRecipe` → 201 with the full `RecipeDetail`, so
the frontend can navigate to the new page without a second request.

---

## 6. Tests — 49 across three files (`npm test`, Vitest)

The logic is pure enough to call directly: no mocks, no fixtures, no test database.

- **`nutrition.test.ts` (10)** — `parseAmount("1 1/2") === 1.5`,
  `parseAmount("to taste") === null` (not `NaN`), unknown units → `null`,
  `servings: 0` must not produce `Infinity`.
- **`validation.test.ts` (15)** — required fields, `"1/3"` accepted and `"lots"`
  rejected, `"4abc"` not passing as a number, zero cook time allowed and zero prep
  time not, per-row error keys (`ingredients.1.ingredientId`).
- **`recipes.test.ts` (24)** — through the public functions only. The two that
  matter most: *a recipe with unknown ingredients is never labelled vegan*, and
  *the allergen filter withholds Chicken Stir-Fry*. Plus AND-vs-OR semantics,
  search narrowing, sort order, `getRecipe` returning `null`, and `createRecipe`
  round-tripping into listings.

**Known gap:** `frontend-app/lib/format.ts` — the fraction rendering has real edge
cases and no coverage.
