# Review — how this project works, and why it is built this way

This document has two jobs.

1. **Explain the whole project** to someone who has not written much TypeScript
   or full-stack code. Nothing is assumed; every folder, file and concept is
   introduced before it is used.
2. **Record the decisions and trade-offs.** Every choice that could reasonably
   have gone the other way is written down, with the reason and the cost.

Read part 1 top to bottom the first time. Part 2 is a reference.

---

# Part 1 — Understanding the project

## 1. What the app does

It is a recipe browser. Two screens:

- **`/recipes`** — a grid of recipe cards you can search, filter and sort.
- **`/recipes/:id`** — one recipe, with its ingredients, steps, tags, calculated
  nutrition, and a control to scale it up or down by serving count.

## 2. The 30-second mental model

There are **two programs** running at once, plus **one file of data**.

```
   YOUR BROWSER                  frontend-app                   backend-app                db/data.json
  ┌──────────────┐  page req   ┌──────────────┐   HTTP req   ┌──────────────┐   reads    ┌──────────────┐
  │              │────────────▶│   Next.js    │─────────────▶│   Express    │───────────▶│   the recipe │
  │  localhost   │             │   :3000      │              │   :8080      │            │   data       │
  │  :3000       │◀────────────│              │◀─────────────│              │◀───────────│              │
  └──────────────┘   HTML      └──────────────┘   JSON       └──────────────┘            └──────────────┘
```

- **`backend-app`** is the **API**. It is a small web server that knows nothing
  about buttons or colours. You ask it a question over HTTP — "give me recipes
  tagged vegan, sorted by calories" — and it answers with **JSON** (a plain text
  format for structured data). It is the only thing that ever touches the data file.
- **`frontend-app`** is the **UI**. It asks the API for data and turns that data
  into HTML pages. It is the only thing the browser talks to.
- **`db/data.json`** is a file pretending to be a database. In a real product
  this would be Postgres; here it is a fixture the brief gave us.

The reason to split them at all: they change for different reasons. Redesigning a
button should not risk breaking the calorie maths, and vice versa. The split also
means you could later put a phone app in front of the same API without touching it.

## 3. What TypeScript is, in one minute

JavaScript is the language browsers and Node.js run. **TypeScript is JavaScript
plus type annotations** — labels saying what shape a value has:

```ts
// JavaScript: nothing here says what a recipe is.
function getCalories(recipe) {
  return recipe.nutrition.perServing.calories;
}

// TypeScript: the shape is declared, so mistakes are caught before you run it.
function getCalories(recipe: RecipeDetail): number {
  return recipe.nutrition.perServing.calories;
}
```

If you typed `recipe.nutrion` (a typo), TypeScript underlines it in your editor
immediately, rather than the page crashing at 2am in front of a user. The types
are erased before the code actually runs — they are a checking tool, not a runtime
feature.

Both apps run in **`strict` mode**, TypeScript's most demanding setting. In
practice the rule that shows up most is: **anything that might be missing must be
handled**. You cannot read `ingredient.name` on a value that might be `undefined`
without saying what happens when it is. That is not bureaucracy — it is exactly
the class of bug this dataset is full of (see §4).

## 4. The data we were given — and its three problems

`backend-app/db/data.json` has two lists.

**`recipes`** (15 of them) look like this:

```json
{
  "id": "1",
  "title": "Classic Margherita Pizza",
  "servings": 4,
  "prepTime": "20 minutes",
  "ingredients": [
    { "ingredientId": "tomato", "amount": "2", "unit": "cups" }
  ],
  "instructions": ["Prepare pizza dough with flour", "..."],
  "tags": ["italian", "vegetarian", "dinner"]
}
```

**`ingredients`** (46 of them) look like this:

```json
{
  "id": "tomato",
  "name": "Diced Tomatoes",
  "nutrition": { "calories": 25, "protein": 1.5, "carbs": 5, "fat": 0.2 },
  "commonAllergens": [],
  "dietary": ["vegan", "gluten-free"]
}
```

Notice the recipe does **not** contain nutrition. It contains an
`ingredientId` — a pointer. To learn that a Margherita has 880 kcal per serving,
you must **join** the two lists: for each line item, look up the ingredient by id,
then do maths. That join is the core of this exercise, and it has three problems.

### Problem 1 — the nutrition numbers have no stated unit

`"calories": 25` for diced tomatoes. Per what? Per gram? Per cup? Per tomato?

The file never says. I compared the values against standard nutrition references:
chicken breast 165, ground beef 250, mozzarella 280 — those are all the well-known
**per-100-gram** figures. So the app assumes **nutrition is per 100 g** and every
calculation is built on that. It is written down at the top of
[nutrition.ts](backend-app/src/nutrition.ts) so nobody has to re-derive it.

### Problem 2 — recipes measure in cups, nutrition measures in grams

A recipe says `2 cups`. Nutrition is per 100 g. Something has to convert. The data
uses 19 different units: `cups`, `tbsp`, `oz`, `lb`, `g`, `ml`, and counted things
like `medium`, `whole`, `cloves`, `leaves`, `head`, `bunch`.

There is no perfectly correct conversion, because **a cup is a volume and a gram is
a weight**, and the relationship between them depends on the ingredient. A cup of
flour is about 120 g; a cup of milk is about 240 g. Same cup, double the weight.

The app uses **one gram figure per unit** for all ingredients. That makes the
totals *estimates*. This is a deliberate accuracy-for-simplicity trade (see
[D4](#d4-one-gram-value-per-unit-not-per-ingredient)), and the UI says
"Estimated from ingredient weights" rather than presenting a false precision.

### Problem 3 — eight ingredients do not exist

This is the trap in the fixture. Recipes reference these ids:

`basil`, `broccoli`, `brown_sugar`, `butter`, `carrot`, `ginger`, `soy_sauce`,
`white_sugar`

None of them have a row in the `ingredients` list. The naive join —
`ingredients.find(i => i.id === line.ingredientId).nutrition.calories` — **crashes**
on all eight, because `.find()` returns `undefined` and you cannot read
`.nutrition` off `undefined`.

The app handles this in three layers:

1. **It does not crash.** The lookup result is treated as possibly-missing
   everywhere (TypeScript's strict mode forces this).
2. **The ingredient still appears** in the recipe. "10 leaves of Basil" is useful
   information even when we have no calorie data for basil.
3. **The gap is disclosed, and acted on.** The API returns
   `nutrition.complete: false`, a `skipped` list, and `unknownIngredients` on
   every recipe. The UI shows a "no nutrition data" chip next to the ingredient,
   writes the calorie figure as `≥ 158 kcal*` rather than a bare number, and
   **the allergen filter withholds such recipes entirely** (see
   [D17](#d17-the-allergen-filter-withholds-recipes-it-cannot-vouch-for)).

That last point is the one worth internalising: **the app never shows a confidently
wrong number.** It shows the best total it can and says what is missing from it.

## 5. The backend, file by file

Everything lives in `backend-app/src/`. The files are ordered here from
"knows nothing" to "knows everything", which is also the direction data flows.

```
data.json  →  db.ts  →  nutrition.ts  →  recipes.ts  →  routes.ts  →  server.ts  →  the network
             (load)     (maths)         (logic)        (HTTP)       (startup)
```

### [`types.ts`](backend-app/src/types.ts) — the vocabulary

No logic at all. It defines the shapes everything else uses. The important
distinction:

- **`RawRecipe`, `RawIngredient`** — exactly what is in the JSON file.
- **`RecipeSummary`, `RecipeDetail`, `ResolvedIngredient`** — what the API sends
  out, after joining and calculating.

Keeping these separate matters. If the data file's format changes tomorrow, only
the `Raw*` types and the code that reads them change — the API contract the
frontend depends on stays put.

`RecipeSummary` vs `RecipeDetail` is the same idea applied to payload size. A card
in a grid needs a title, a time and a calorie count. It does not need every
instruction step. So the list endpoint sends `RecipeSummary` and only the detail
endpoint sends the full `RecipeDetail`.

### [`db.ts`](backend-app/src/db.ts) — reading the file

Reads `data.json` once, keeps it in memory, and hands out a `Store`:

```ts
export interface Store {
  recipes: RawRecipe[];
  ingredients: RawIngredient[];
  ingredientsById: Map<string, RawIngredient>;   // ← the useful bit
}
```

`ingredientsById` is a **Map** — a lookup table from id to ingredient. Without it,
finding `"tomato"` means scanning the whole 46-item array, and a recipe with 5
ingredients does 5 scans. With it, each lookup is instant. At this size nobody
would notice; the habit is what matters, and it costs one line to build.

Two other things happen here:

- **The file is read once and cached.** Re-reading and re-parsing 25 KB of JSON on
  every request would be pure waste.
- **The shape is checked on load.** `assertDatabase` confirms the file really has
  `recipes` and `ingredients` arrays. If someone corrupts the file, the server
  refuses to start with a clear message, rather than failing strangely on the
  first user request.

### [`nutrition.ts`](backend-app/src/nutrition.ts) — the maths

Four small pure functions. "Pure" means: same input, same output, no side effects —
which makes them the easiest code in the project to reason about and to test.

**`parseAmount(amount)`** — turns the `amount` *string* into a number. It is a
string in the data because it holds things like `"1/3"` and `"2.5"`. So this
handles decimals (`"2.5"` → `2.5`), fractions (`"1/3"` → `0.333…`) and mixed
numbers (`"1 1/2"` → `1.5`). Anything unrecognisable returns `null` — the code's
way of saying "no answer", which the caller is then forced to handle.

**`toGrams(amount, unit)`** — multiplies the parsed amount by the unit's gram
value from the conversion table. Unknown unit → `null`.

**`scaleNutrition(per100g, grams)`** — the actual calculation:

```
2 cups of tomato  →  2 × 240 g       = 480 g
480 g at 25 kcal per 100 g  →  480/100 × 25  = 120 kcal
```

**`summariseNutrition(ingredients, servings)`** — adds up the line items, divides
by servings, and returns `complete` / `skipped` alongside the numbers. Anything it
cannot count is skipped and named rather than silently dropped or treated as zero.

It also guards `servings > 0` before dividing. A `servings: 0` in the data would
otherwise produce `Infinity` and render as garbage.

### [`recipes.ts`](backend-app/src/recipes.ts) — the business logic

The biggest file, and the one doing the real work.

**`resolveIngredients`** performs the join described in §4. For each line item it
looks up the ingredient, converts to grams, calculates that item's contribution,
and flags `missing: true` when there is no row. Missing ingredients get a
readable name from their id — `brown_sugar` becomes "Brown Sugar" — so the UI has
something sensible to print.

**`deriveDietary`** decides whether a recipe can call itself vegan, gluten-free and
so on. The logic is an **intersection**: a recipe is vegan only if *every*
ingredient is vegan. One knob of butter and the claim is gone.

There is a subtlety here worth calling out. That logic is only sound if we know
every ingredient — and eight are missing. If a recipe contains butter and butter
has no row, an intersection over the remaining ingredients could conclude "vegan".
That is worse than useless; it is a wrong claim about food someone may have an
actual reason to avoid. So: **derivation only runs when every ingredient
resolves.** Otherwise the recipe's own author-written tags are used unchanged.

It also adds one inference: vegan implies vegetarian. The data only ever tags the
stricter one, so without this a vegetarian filter would hide vegan recipes.

**`listRecipes`** applies the filters and sorts. Two behaviours to know:

- **Most filters are AND.** Picking `italian` and `vegetarian` shows recipes that
  are both. Each extra choice narrows the list, which is what a filter is for.
- **Difficulty is OR.** Picking `easy` and `medium` means "either is fine",
  because nothing can be two difficulties at once and AND would return zero.

**`getFacets`** returns the list of every tag, ingredient, diet and allergen that
actually appears in the data. The filter UI is built from this, so the controls
can never offer an option that matches nothing, and adding a recipe with a new tag
makes that tag appear in the UI with no code change.

### [`routes.ts`](backend-app/src/routes.ts) — the HTTP surface

Four endpoints:

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{ status: "ok" }` — is the server up? |
| `GET /api/facets` | every available filter option |
| `GET /api/recipes` | `{ recipes: [...], total: n }` — filtered and sorted |
| `GET /api/recipes/:id` | one full recipe, or 404 |

This file's real job is **guarding the boundary**. Everything arriving over the
network is untrusted: a query parameter can be missing, doubled
(`?tags=a&tags=b`), or nonsense (`?sort=<script>`). Express types these as
`string | string[] | undefined`, and the small `readList` / `readString` /
`readEnum` helpers narrow that to values the rest of the app can trust. Past this
file, nothing deals in unknown input.

One judgement call: an unrecognised `sort` value **falls back to the default**
instead of returning an error. A junk sort key should still show you a page of
recipes; a `400 Bad Request` there would be technically defensible and practically
annoying.

`GET /api/recipes` returns `{ recipes, total }` rather than a bare array, so
pagination fields can be added later without breaking existing clients.

### [`server.ts`](backend-app/src/server.ts) — startup and safety nets

Wires up CORS (so the browser is allowed to call `:8080` from a page served by
`:3000`), mounts the routes, and adds two catch-alls:

- **Unknown route** → a JSON 404 in the same envelope as every other error, so the
  frontend never has to parse an HTML error page.
- **Unhandled error** → logged in full on the server, but the response is a
  generic "Internal server error". Stack traces and file paths never leave the
  process.

It also **loads the data before it starts listening**. If `data.json` is missing,
the server exits at boot with a clear message rather than accepting traffic and
failing on the first request.

## 6. The frontend, file by file

### First: what Next.js actually does

Next.js is React with a router and a server attached. Two ideas do most of the work.

**File-based routing.** The folder structure *is* the URL structure:

```
app/page.tsx                →  /
app/recipes/page.tsx        →  /recipes
app/recipes/[id]/page.tsx   →  /recipes/1, /recipes/2, …   ([id] = wildcard)
```

**Server Components vs Client Components.** By default a component runs **on the
server**: it can `await` a fetch directly, and only its finished HTML is sent to
the browser. Its JavaScript is never downloaded. Add `'use client'` at the top and
it becomes a **Client Component**: it ships to the browser and can use state,
effects and event handlers.

The rule of thumb this project follows: **server by default, client only where
something must react to a click or a keystroke.** Three of the four components are
server components. Only [`Filters.tsx`](frontend-app/components/Filters.tsx) and
[`ServingScaler.tsx`](frontend-app/components/ServingScaler.tsx) are client
components, because those are the two things a user interacts with.

### [`lib/types.ts`](frontend-app/lib/types.ts) — the contract, restated

A hand-written copy of the API types from the backend. See
[D2](#d2-duplicated-types-instead-of-a-shared-package) for why this is duplicated
rather than shared.

### [`lib/api.ts`](frontend-app/lib/api.ts) — the only code that calls the backend

Every request funnels through one `request<T>()` function, so the base URL, the
error handling and the caching policy are each decided exactly once.

The error handling is the interesting part. `fetch` only rejects on a *transport*
failure, which almost always means the backend is not running. So that case gets
a sentence a human can act on:

> Cannot reach the recipe API at http://localhost:8080. Is the backend running?

A non-2xx response is different — the server answered, it just said no — so that
becomes an `ApiError` carrying the HTTP `status`, which lets the detail page tell
"this recipe does not exist" apart from "the API is broken" and show a different
screen for each.

`cache: 'no-store'` tells Next not to cache responses. Results depend on filters
and are cheap to fetch; showing stale results after a filter change would be worse
than the round trip.

### [`lib/format.ts`](frontend-app/lib/format.ts) — display helpers

`parseAmount` again (mirrored from the backend — see
[D5](#d5-amount-parsing-exists-on-both-sides)), plus:

**`formatQuantity`** — renders a scaled number the way a recipe would write it.
Halving `"1"` cup gives `1/2`, not `0.5`. Scaling `"2.5"` by 1.5 gives `3 3/4`, not
`3.75`. It snaps to the familiar kitchen fractions (¼, ⅓, ½, ⅔, ¾) and only falls
back to a decimal when nothing is close.

**`scaleAmount`** — scales an amount string, and **leaves unparseable amounts
untouched**. If a future recipe says `"to taste"`, it stays `"to taste"` rather
than becoming `NaN`.

### [`app/layout.tsx`](frontend-app/app/layout.tsx) — the shell

The header and page frame wrapped around every route. Written once, applied
everywhere.

### [`app/recipes/page.tsx`](frontend-app/app/recipes/page.tsx) — the list

A server component. It reads the URL's query string, forwards it to the API,
and renders the results. The whole thing is about 60 lines because the filtering
happens on the server side of the API, not here.

It fetches the recipes and the filter options **in parallel** with
`Promise.all`, since neither depends on the other. Doing them one after the other
would double the wait for no reason.

Note also that a failure to load the *filter options* does not take down the page:
the recipes still render, with a "filters unavailable" note. Losing a control
should not lose the content.

### [`components/Filters.tsx`](frontend-app/components/Filters.tsx) — the controls

The one genuinely interesting frontend decision: **filter state lives in the URL,
not in React state.**

Clicking the "vegan" chip does not set a variable — it navigates to
`/recipes?dietary=vegan`. The server component above re-runs with the new query
and renders new results.

Three things fall out of that for free:

- The **back button works.** It steps back through your filter changes.
- A filtered view is a **shareable link.** Paste it to someone and they see what
  you see.
- The **first paint is already correct.** Open a filtered URL and the server
  renders the filtered results directly — no flash of unfiltered content.

The cost is a navigation on every filter change. Next makes this cheap by
re-rendering only the changed part of the page, and `router.replace` is used
rather than `push` so filter tweaks do not each become a separate history entry.

The search box is the one control with local state, because it needs
**debouncing**: it waits 250 ms after you stop typing before firing a request.
Without it, typing "chicken" would fire seven requests and the results would flicker.

### [`components/ServingScaler.tsx`](frontend-app/components/ServingScaler.tsx) — the scaler

Owns a `servings` number and renders both the ingredient list and the nutrition
panel, because one control drives both — changing the serving count has to move
the quantities and the calorie total together.

The maths is:

```
factor = chosen servings / original servings
```

Every ingredient amount is multiplied by `factor`. So is the nutrition **total**.
The **per-serving** figures are deliberately *not* scaled — that is the point of
per-serving: 4 servings or 8, one serving contains the same thing.

This runs in the browser. It could have been an API call with a `?servings=`
parameter, but that would mean a network round trip every time you tap `+`, to
compute a multiplication. See [D6](#d6-scaling-is-client-side).

### [`app/recipes/[id]/page.tsx`](frontend-app/app/recipes/[id]/page.tsx) — the detail page

Fetches one recipe and lays out the header, the scaler and the instructions.
Three details worth noting:

- **404 and "API down" are different screens.** A missing recipe calls Next's
  `notFound()`, which renders the not-found page *and returns a real HTTP 404*.
  Any other failure shows the error box with a "back to all recipes" way out.
- **The fetch is wrapped in React's `cache()`.** Next calls `generateMetadata`
  (for the page `<title>`) and the page component as separate passes; without
  `cache()` a single page view would hit the API twice.
- **Duplicate chips are filtered out.** `vegetarian` is often both a derived
  dietary claim and an author tag; it is shown once.

### Error pages

[`app/error.tsx`](frontend-app/app/error.tsx) catches anything a page did not
handle itself and offers a "try again" button.
[`app/not-found.tsx`](frontend-app/app/not-found.tsx) handles unknown URLs. Neither
should ever be hit in normal use — they exist so an unexpected throw shows a
recoverable screen rather than a blank page.

### [`app/globals.css`](frontend-app/app/globals.css) — the styling

Plain CSS, no framework. All the colours are CSS **custom properties** (variables)
declared once at the top:

```css
:root { --bg: #f7f6f3; --text: #22201d; --accent: #b4451f; }
```

A `prefers-color-scheme: dark` block redefines just those variables, which is the
entire dark mode implementation — every rule downstream already refers to the
variables. The layout uses CSS Grid with `auto-fill`, so the card grid reflows from
three columns to one as the window narrows without any media queries.

## 7. Following one request all the way through

**You open `/recipes?dietary=vegan&sort=calories&order=desc`.**

1. The browser asks the Next.js server (`:3000`) for that URL.
2. Next matches `app/recipes/page.tsx` and runs it **on the server**.
3. The page turns the query string into an API URL and calls
   `GET http://localhost:8080/api/recipes?dietary=vegan&sort=calories&order=desc`
   (in parallel with `/api/facets`).
4. Express matches the route. `routes.ts` narrows the query params into a clean
   `RecipeQuery` object.
5. `recipes.ts` loads the cached store, and for each of the 15 recipes: joins its
   ingredients, converts each to grams, sums the nutrition, derives its dietary
   claims, then keeps it only if it is vegan.
6. The survivors are sorted by calories, descending. Express sends
   `{ recipes: [...], total: 2 }` as JSON.
7. Back in Next, the page maps those into `RecipeCard` components and produces
   HTML.
8. The browser receives finished HTML — the cards are visible before any
   JavaScript runs. Then React "hydrates" the two client components so the filter
   chips and search box become interactive.

**You click the "vegan" chip to turn it off.**

1. `Filters.tsx` builds the new query string and calls `router.replace`.
2. The URL changes; Next re-runs the server component with the new params.
3. Steps 3–7 repeat, and only the changed part of the page is re-rendered.

**You open a recipe and press `+` on servings.**

No network at all. `ServingScaler` recomputes `factor`, and React re-renders the
ingredient quantities and the calorie total. It is instant.

---

# Part 2 — Decisions and trade-offs

Each entry: what was chosen, what it cost, and when you would revisit it.

### D1. TypeScript everywhere, in strict mode

The scaffold was plain JavaScript. Converting both apps was a deliberate cost —
config files, type definitions, and every "possibly undefined" the compiler
insisted on handling.

**Why:** the brief lists types as a bonus and "TypeScript/JavaScript best
practices" as a criterion. More concretely, this dataset has eight dangling
ingredient references, and strict mode makes it *impossible* to write the naive
`.find(...).nutrition` that crashes on them. The type system found that bug class
before a single line ran.

**Cost:** more upfront ceremony, a build step on the backend.
**Revisit:** never, for anything with more than one contributor.

### D2. Duplicated types instead of a shared package

`frontend-app/lib/types.ts` is a hand-maintained copy of the API types in
`backend-app/src/types.ts`.

**Alternatives:** an npm workspace with a `packages/shared`, or generating the
client types from an OpenAPI spec. Both guarantee the two sides cannot drift.

**Why not:** either adds monorepo tooling — workspace configs, build ordering, a
shared `tsconfig` — to a two-app take-home. That is real complexity for a contract
that is currently four interfaces and changes rarely.

**Cost:** the two files can silently disagree. If the backend renames a field, the
frontend compiles fine and breaks at runtime.
**Revisit:** immediately, if a third consumer appears or the API starts changing
weekly. This is the first thing I would extract.

### D3. Nutrition is calculated per request, not precomputed

Every list request recalculates nutrition for all 15 recipes.

**Why:** with 15 recipes and 46 ingredients this is microseconds, and it means
there is exactly one code path producing nutrition figures — no cache to
invalidate, no risk of stale numbers after a data edit.

**Cost:** it is O(recipes × ingredients) per request. At 15,000 recipes this
becomes the bottleneck.
**Revisit:** at that scale, compute nutrition once at load time and store it on
the `Store`, or push filtering into a real database query.

### D4. One gram value per unit, not per ingredient

`cups: 240` applies to flour, milk and rice alike, even though their real weights
differ by a factor of two.

**Alternatives:** a per-ingredient density table (correct, but requires research
for all 46 and would still be guesswork), or refusing to show nutrition for
volume-measured ingredients (correct and useless).

**Why:** it produces figures that are directionally right for every recipe, in
20 lines, with no invented data. The important part is that it is *labelled* an
estimate rather than presented as fact.

**Cost:** flour-heavy recipes overestimate. The Margherita's 880 kcal/serving is
high, largely because 2.5 cups of flour is counted as 600 g rather than ~300 g.
**Revisit:** add a `gramsPerUnit` field to each ingredient row. That is a data
change, and the code already funnels every conversion through one function.

### D5. Amount parsing exists on both sides

`parseAmount` is implemented in `backend-app/src/nutrition.ts` and again in
`frontend-app/lib/format.ts`.

**Why:** the backend needs it to compute nutrition; the frontend needs it to scale
quantities without a network round trip per click. It is ~15 lines of pure
function with no dependencies.

**Cost:** two implementations that could diverge. Mitigated by both being pure,
small, and covered by the same test cases if tests are added.
**Revisit:** it moves into the shared package from D2 the moment that exists.

### D6. Scaling is client-side

Adjusting servings does no network work.

**Alternative:** `GET /api/recipes/:id?servings=8`, which would put all the maths
in one place (D5 disappears).

**Why:** a round trip per `+` tap, to perform a multiplication, is a worse
experience for no accuracy gain. Instant feedback matters on a control people
poke repeatedly.

**Cost:** the duplication in D5.
**Revisit:** if scaling ever becomes non-trivial — pan sizes, non-linear baking
adjustments — that logic belongs on the server, and the round trip becomes worth it.

### D7. Filter state in the URL, not React state

**Why:** shareable links, working back button, correct server-rendered first
paint. All three come free; none are available with `useState`.

**Cost:** a navigation per filter change, and slightly more code than
`useState` — reading and writing `URLSearchParams` instead of setting a variable.

**Revisit:** if filters grew to dozens of controls the URL would get unwieldy, and
a "saved views" feature would serve better.

### D8. Filtering on the server, not the client

The API could have sent all 15 recipes once and let the browser filter them.

**Why:** at 15 recipes that is genuinely simpler. But it is a design that has to be
thrown away the moment the dataset grows, and the server-side version costs about
the same to write today. The API shape does not change between 15 and 15,000 rows.

**Cost:** a request per filter change (mitigated by debouncing the search box).
**Revisit:** not needed; this is the shape that scales.

### D9. AND for most filters, OR for difficulty

Selecting two tags requires both. Selecting two difficulties accepts either.

**Why:** each extra tag should narrow the results — that is what a filter is for.
But a recipe has exactly one difficulty, so AND across two difficulties always
returns zero, which reads as a broken UI.

**Cost:** the two behave differently, which is not visible in the UI.
**Revisit:** an explicit "match any / match all" toggle if users find it surprising.

### D10. Dietary claims are derived only when the data is complete

If any ingredient is missing from the table, derivation is skipped and the
recipe's own tags are used unchanged.

**Why:** the alternative silently produces false claims. A recipe containing
butter, where `butter` has no row, would be labelled vegan by an intersection over
the ingredients that *do* resolve. That is a wrong claim about food someone may
have a real reason to avoid — worse than showing nothing.

**Cost:** some recipes show fewer dietary tags than they could.
**Revisit:** fix the data. Then derivation runs everywhere and this branch is dead
code.

### D11. Missing ingredients are surfaced, not hidden

They appear in the list with a "no nutrition data" chip, and the totals say how
many were excluded.

**Alternatives:** drop them from the list (loses real recipe information), or
count them as zero (silently wrong).

**Why:** "880 kcal, excluding 1 ingredient" is honest and actionable. "880 kcal"
alone is a number the user cannot evaluate.

**Cost:** slightly busier UI.
**Revisit:** no.

### D12. No `loading.tsx` on the recipe routes

Next lets you drop in a `loading.tsx` for an instant loading state. I wrote one,
then removed it.

**Why:** a `loading.tsx` makes Next stream the page shell immediately with a
`200 OK`. When the detail page then discovers the recipe does not exist and calls
`notFound()`, the status is already sent — so `/recipes/9999` returned **HTTP 200**
with 404 content. That is wrong for search engines, monitoring and any API client.
Removing it restored a real 404.

**Cost:** no skeleton UI during navigation. Against a local API the difference is
imperceptible.
**Revisit:** put the loading state back at a finer grain — a Suspense boundary
around just the recipe grid — so the list gets its skeleton without the detail
route inheriting the streaming behaviour.

### D13. Plain CSS, no UI library

**Why:** zero dependencies, every style readable in one file, and full control over
the responsive behaviour. Tailwind or a component library would each add a
toolchain to style four screens.

**Cost:** no design system; consistency is maintained by hand via the custom
properties.
**Revisit:** at roughly a dozen screens, or as soon as more than one person is
writing UI.

### D14. `Promise.all` for independent fetches

The list page fetches recipes and filter options concurrently.

**Why:** they do not depend on each other; sequential `await`s would double the
wait for nothing. Worth mentioning because sequential-by-accident is the single
most common performance mistake in server components.

### D15. The list endpoint returns an envelope

`{ recipes, total }` rather than a bare `[...]`.

**Why:** `total` is needed for the result count today, and the envelope leaves room
for `page` / `pageSize` / `hasMore` later without breaking any client.
**Cost:** one extra level of nesting.

### D16. Upgrading Next.js past the scaffold's pin

The scaffold pinned `next@15.1.6`, which npm flags for a security advisory
([CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478)). Bumped to `15.5.24`,
the patched release on the same major version.

**Why:** shipping a known-vulnerable dependency is not a defensible default, and
the patch is within the same major, so no migration was involved.
**Cost:** a small deviation from the provided scaffold, noted here so it is not a
surprise.

### D17. The allergen filter withholds recipes it cannot vouch for

When `excludeAllergens` is set, a recipe with any unknown ingredient is dropped
from the results and counted in `withheld`, which the UI explains on the page.

**Why:** this was a live bug. Chicken Stir-Fry contains soy sauce, but `soy_sauce`
has no row, so the recipe reported **zero allergens** — filtering "exclude gluten"
showed it as safe. Every other incomplete-data case in this app costs accuracy;
this one could cost someone an allergic reaction, so it is the one place the app
refuses to answer rather than answering approximately.

**Alternatives:** show them with a warning badge (more results, but it moves a
safety judgement onto the user), or leave the old behaviour and document it (what
was there before — a documented bug is still a bug).

**Cost:** 2 of 15 recipes disappear from allergen-filtered results even though
they may well be fine. Mitigated by saying so explicitly rather than silently.
**Revisit:** fix the data; then nothing is ever withheld and this branch is inert.

### D18. Calorie figures are marked when incomplete

A recipe missing nutrition data renders as `≥ 158 kcal*`, not `158 kcal`.

**Why:** sorting by calories ascending used to rank **Chocolate Chip Cookies
second-lightest**, ahead of Greek Salad, because butter and both sugars are
missing. The number was not wrong so much as not comparable, and nothing on the
card said so.

**Cost:** slightly noisier cards.
**Revisit:** an alternative is to exclude incomplete recipes from calorie sorting
entirely. That hides the problem instead of showing it, so marking won.

### D19. Added recipes live in memory, not in `data.json`

`POST /api/recipes` appends to the in-memory store. The fixture file is never
written to.

**Why:** writing to `data.json` looks more "real" until you deploy it. On a
free-tier host the filesystem is ephemeral, so the write survives until the
instance sleeps and then silently vanishes — a reviewer adds a recipe, comes
back, and finds it gone. That reads as a bug. In-memory behaves identically
everywhere, and the form states the limit up front.

**Cost:** added recipes do not survive a restart.
**Revisit:** the moment there is a real datastore. `insertRecipe` in `db.ts` is
the only function that changes.

### D20. Validation lives only on the server

The form sends what the user typed and renders the `fields` object from a 400.

**Why:** one set of rules cannot disagree with itself. A browser-side copy would
be a second source of truth that can drift, and it can be bypassed anyway, so the
server needs the checks regardless. Native `required`/`min` attributes still
catch the obvious cases before a request goes out — that is a convenience, not a
rule, so it cannot drift in a way that matters.

**Cost:** a round trip to learn a field is wrong.
**Revisit:** a shared schema (the D2 package, with zod) would give both sides the
same rules honestly — that is the only version of client validation worth having.

### D21. Create only — no edit or delete

**Why:** the write path exists to demonstrate API design, validation and error
handling. A second and third verb demonstrate the same things again while
tripling the UI. Full CRUD on a fixture is scope without extra credit.

**Cost:** a typo in a new recipe cannot be fixed except by restarting the API.

---

## What is deliberately *not* here

These were all considered and left out to keep the code minimal. Each has an
obvious place to go.

| Feature | Where it would go |
|---|---|
| **Frontend tests** | The backend has 29 Vitest tests. `lib/format.ts` (fraction rendering, quantity scaling) is the remaining gap. |
| **Pagination** | `listRecipes` already returns an envelope; add `page`/`pageSize` to `RecipeQuery` and slice before returning. |
| **Favourites** | `localStorage` in a small client component for a single-user version; a `POST /api/favourites` and a real store for a multi-user one. |
| **Shopping list** | A new endpoint taking recipe ids, reusing `resolveIngredients` and merging line items by `ingredientId`. |
| **Editing / deleting** | The create path is built; `PUT`/`DELETE` would reuse `validation.ts` and `db.ts` the same way. |
| **Durable writes** | `db.ts` is the only file that touches the data source, so a `save()` alongside `load()` is the whole change. |
| **An LLM feature** | A backend route, so the API key never reaches the browser — e.g. "suggest a substitute for an ingredient I don't have", using the ingredient table as context. |

---

## Running and checking it

```bash
# terminal 1
cd backend-app && npm install && npm run dev     # http://localhost:8080

# terminal 2
cd frontend-app && npm install && npm run dev    # http://localhost:3000
```

**Checking nothing is broken:**

```bash
cd backend-app  && npm run typecheck && npm test          # 49 tests
cd frontend-app && npm run typecheck && npm run lint && npm run build
```

**Poking the API directly**, which is often quicker than clicking:

```bash
curl "http://localhost:8080/api/health"
curl "http://localhost:8080/api/recipes?dietary=vegan&sort=calories&order=desc"
curl "http://localhost:8080/api/recipes?search=chicken&excludeAllergens=nuts"
curl "http://localhost:8080/api/recipes/1"      # note nutrition.complete: false
curl "http://localhost:8080/api/recipes/9999"   # 404 with a JSON error envelope
curl "http://localhost:8080/api/facets"
```

**Edge cases worth seeing for yourself:**

- `/recipes/1` — Basil is listed but marked "no nutrition data", and the totals
  say one ingredient was excluded.
- `/recipes/15` — Lemon Garlic Pasta has `"1/3"` and `"1/2"` cup amounts. Scale it
  and watch them stay as readable fractions.
- `/recipes?search=zzz` — the empty state, with the filter controls still populated.
- Stop the backend and reload `/recipes` — you get "Cannot reach the recipe API…",
  not a stack trace.
- `/recipes?excludeAllergens=gluten` — Chicken Stir-Fry is absent, and the page
  says two recipes were withheld and why.
- `/recipes?sort=calories&order=asc` — the incomplete figures carry `≥` and `*`.
