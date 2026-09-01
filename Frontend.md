# Frontend — `frontend-app/`

Next.js 15 App Router + TypeScript. Three screens, five components, no state
library. Companion: [Backend.md](./Backend.md), [Review.md](./Review.md).

---

## 1. The three folders, and the rule each obeys

```
app/          which URL shows what. Fetches data. Server-side.
components/   reusable UI. Never fetches — data arrives as props.
lib/          no JSX at all. Network, types, formatting maths.
```

```
app/
├── layout.tsx        the frame around every page (header, font)
├── page.tsx          /              → redirect('/recipes')
├── globals.css       all styling, one file
├── error.tsx         a page threw          ['use client']
├── not-found.tsx     no such URL / recipe
└── recipes/
    ├── page.tsx         /recipes       list + filters
    ├── new/page.tsx     /recipes/new   create form
    └── [id]/page.tsx    /recipes/1     detail

components/  RecipeCard · Filters · ServingScaler · RecipeForm · ErrorBox
lib/         api.ts · types.ts · format.ts
```

**Reserved filenames.** Inside `app/`, four names mean something to Next:
`page.tsx` ("this folder is a visitable URL"), `layout.tsx` ("wrap everything
below me"), `error.tsx`, `not-found.tsx`. A folder in brackets — `[id]` — is a
wildcard, and the matched value is handed to the page as a param. Next prefers a
literal folder over a wildcard, so `/recipes/new` is never read as a recipe with
the id `"new"`.

**The four `page.tsx` files are unrelated screens** that share a filename; their
folder is their identity. Mentally: `HomePage`, `RecipeListPage`, `NewRecipePage`,
`RecipeDetailPage`.

---

## 2. Server vs client components — the decision behind everything else

By default a component **runs on the server**: it executes once, produces HTML,
and ships no JavaScript. It cannot use `useState` or `onClick`, because by the time
the user sees it, it has finished running.

`'use client'` at the top makes it a **client component**: its code is downloaded
and re-run in the browser, so it can hold state. The cost is bytes and device work.

**The rule this project follows: server by default; client only where something
must react to a click or a keystroke.**

| Server (HTML only) | Client (`'use client'`) |
|---|---|
| `layout` · `page` · `recipes/page` · `recipes/[id]/page` · `recipes/new/page` · `not-found` · `RecipeCard` · `ErrorBox` | `Filters` · `ServingScaler` · `RecipeForm` · `error` |

Eight server, four client. Measured from `next build`: **102 kB shared baseline,
103–108 kB first-load per route** — the route-specific cost is 1.3–2.6 kB, because
only those four components ship any JS at all. Note that client components are
still rendered to HTML on the server first; the JS is downloaded to *hydrate* them,
not to draw the first paint.

The build also confirms the rendering strategy: `/` and `/_not-found` are static;
all three recipe routes are **dynamic, server-rendered on demand**, which is what
`cache: 'no-store'` and reading `searchParams` buy you.

---

## 3. How a page is constructed

### `/recipes` — the list

```
1  layout.tsx renders the shell (header, font, <main>)
2  recipes/page.tsx  await searchParams          ← the URL is the input
3                    Promise.all([               ← both requests concurrently
                       fetchRecipes(toQuery(params)),   lib/api.ts
                       fetchFacets(),
                     ])
4                    result instanceof Error? → <ErrorBox/> and stop
5                    <Filters facets resultCount/>   ← in <Suspense>, hydrates in browser
6                    withheld > 0? → the "hidden recipes" notice
7                    recipes.length === 0 ? <empty state> : <RecipeCard/> × n
8  HTML streams to the browser; only Filters ships JS
```

Points an interviewer tends to pull on:

- **`async`/`await` directly in a component.** Impossible in ordinary React; fine
  here because this function runs on the server and may wait before emitting HTML.
- **`Promise.all`** — the two requests are independent, so sequential `await`s
  would double the wait for nothing.
- **`toQuery` is a pass-through.** The UI and the API use the same filter names on
  purpose, and the API ignores what it does not recognise, so adding a filter needs
  no change in this file.
- **A dead `/api/facets` does not kill the page.** Both fetches `.catch()` into the
  value, and only a failed *recipes* fetch bails out; a failed facets fetch renders
  "filters unavailable" above a working grid. Losing a control should not lose the
  content.
- **`<Suspense>`** is required because `Filters` calls `useSearchParams()`.

### `/recipes/1` — the detail

```
1  layout.tsx
2  [id]/page.tsx   await params → id
3                  load(id)  ← react cache(): dedupes across generateMetadata + body
4                  ApiError && status === 404 → notFound()   → not-found.tsx + real 404
                   ApiError otherwise         → <ErrorBox/>  (API down)
5                  header: title, dietary chips, tags, meta row, allergen warnings
6                  <ServingScaler recipe/>    ← the only interactive part
7                  <ol> of instructions
```

- **The two failures are separated deliberately.** A missing recipe and an
  unreachable API look the same from a distance but need different screens — and
  `notFound()` sends a *real* HTTP 404, which matters for crawlers and monitoring.
- **`generateMetadata`** sets the tab title and runs as a separate pass from the
  page body, which is why `load` is wrapped in React's `cache()` — without it one
  page view would hit the API twice.
- Tags that duplicate a derived dietary claim are filtered out, so `vegetarian`
  shows once.

### `/recipes/new` — the form

```
1  layout.tsx
2  new/page.tsx  await fetchFacets()   ← server-side, so the form has its options
                                          on first paint with no loading flash
3               facets instanceof Error → <ErrorBox/>
4               <RecipeForm facets/>   ← everything interactive lives here
```

---

## 4. `lib/` — the non-UI layer everything sits on

### `api.ts` — the only code that talks to the backend

- One `request<T>()` helper, so base URL, caching and error shaping are decided
  once. `NEXT_PUBLIC_API_URL` overrides `http://localhost:8080`.
- **`ApiError`** carries `status` and `fields`, which is what lets pages branch on
  404 and the form render per-field messages.
- `fetch` only rejects on *transport* failure, so that branch becomes
  `"Cannot reach the recipe API at … Is the backend running?"` rather than the
  browser's unhelpful `"fetch failed"`.
- `cache: 'no-store'` — results are filter-dependent, so stale data is worse than a
  round trip.

### `types.ts` — the contract, restated

A hand-copy of the backend's API types. **Tradeoff:** duplication, versus a shared
package or monorepo tooling for two apps that ship together. The duplication is
visible and cheap; the alternative is build config nobody asked for. It is the
thing I would change first if the project grew.

### `format.ts` — display maths

`parseAmount` (mirrors the backend's), `formatQuantity`, `scaleAmount`,
`scaleNutrition`, `formatDate`.

**Why quantities are formatted, not printed:** halving `1 cup` should give `1/2`,
not `0.5`. `formatQuantity` snaps to the nearest common fraction within 0.05 and
falls back to a two-decimal number otherwise. Unparseable amounts like `"to taste"`
pass through untouched.

**Known duplication:** `parseAmount` exists here *and* in the backend, on purpose —
scaling has to run in the browser to be instant. The two must be kept in step, and
this copy is the one with no test coverage.

---

## 5. The components

### `RecipeCard.tsx` — server, 45 lines, pure display

One `RecipeSummary` in, one clickable card out. The whole card is a `<Link>`, so
navigation needs no JavaScript. Two touches, both about not lying with numbers:

- **`0 kcal` is hidden entirely** — 0 means "nothing was calculable", and printing
  it would be a lie.
- **An incomplete total renders `≥ 158 kcal*`** with a tooltip naming how many
  ingredients are excluded. Without this, sorting by calories ranked Chocolate Chip
  Cookies second-lightest, because butter and both sugars are missing from the data.

### `Filters.tsx` — client, 260 lines, the biggest control surface

Nine controls: search, sort, order, max minutes, and chip rows for diet,
difficulty, tags and allergens, plus an ingredient picker and clear-all.

**The one big idea: filter state lives in the URL, not in React state.**

```
click "vegan" chip
   → toggle('dietary','vegan') builds the next query string
   → router.replace('/recipes?dietary=vegan', { scroll: false })
   → app/recipes/page.tsx re-runs ON THE SERVER with the new params
   → new grid HTML streams back
```

Two things come free that plain React state cannot give you: a filtered view is a
**shareable link**, and the **first paint is already correct** — no flash of
unfiltered content.

Note `router.replace`, not `push`: filter changes do not stack history entries,
so the back button leaves the page rather than unwinding filters one at a time.

**Cost, stated honestly:** every chip click is a network round trip. Fine for 15
recipes on localhost; at scale it wants optimistic UI or client-side caching.

**The one exception — the search box.** It keeps local `useState` and **debounces
250 ms**, because writing to the URL per keystroke would fire seven requests for
"chicken" and flicker the results. An `isFirstRender` ref stops it navigating on
mount, and `params` is deliberately excluded from the effect deps — including it
would restart the debounce on every URL change, including the ones the effect
itself causes.

**`FilterGroup`** — the same chip row is needed four times, so it is one small
component called four times with different data. It returns `null` when empty, so
no orphan heading. Its chips use `aria-pressed` for both the screen-reader state
*and* the CSS highlight (`.chip[aria-pressed="true"]`) — one source of truth, so
visual and announced state cannot disagree.

**`IngredientPicker`** — the odd one out. 46 ingredients would swamp a chip row, so
it is a native `<select>` that adds one at a time, with selections shown below as
removable chips. Native means type-to-search, correct mobile behaviour, no
dependency. The select always resets to its placeholder because it is an *add*
action; the chips are the state. It needs its own component because the ingredient
facet is `{ id, name }[]` (filter by id, display the name) while every other facet
is a plain `string[]`.

### `ServingScaler.tsx` — client, 112 lines

Holds exactly one piece of state, and derives everything from it:

```tsx
const [servings, setServings] = useState(recipe.servings);
const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
```

- Every **ingredient quantity** and the **nutrition total** scale by `factor`.
- **Per-serving figures do not scale** — that is the definition of per-serving.
  4 servings or 8, one serving contains the same thing.
- **Ingredients and nutrition live in the same component** because one control
  drives both; splitting them would mean lifting identical state to a parent and
  passing it down twice for no gain.
- **The maths runs in the browser.** It is multiplication — a round trip per tap
  would be slower and no more correct.
- Missing ingredients get a "no nutrition data" chip and the footnote says how many
  were excluded, matching the backend's `skipped`.

### `RecipeForm.tsx` — client, 334 lines, the only place the app writes

**Validation lives on the server, and only there.** The form sends what the user
typed and renders whatever `fields` come back on a 400:

```tsx
catch (error) {
  const fields = error instanceof ApiError ? error.fields : {};
  setErrors(Object.keys(fields).length ? fields : { _: '…' });
}
```

The server's keys (`title`, `ingredients.0.amount`) match how the form names its
inputs, so each message lands beside its own field. **Tradeoff:** an extra round
trip to learn a field is empty, versus two copies of the rules that can drift — and
the browser's copy is bypassable anyway. Native `required`/`min`/`max` still catch
the obvious cases first, without becoming a second source of truth.

Other decisions:

- **`Field` is declared at module scope, not inside the render body.** A component
  defined inline is a fresh type each render, which remounts its children and loses
  input focus while typing. This is the kind of bug that only shows up when you
  actually use the form.
- **The last row can never be removed** — a form with zero inputs is a dead end.
- **Ingredients are a `<select>` built from the same facets the filter bar uses**,
  so a new recipe can only reference ingredients that exist and its nutrition
  always resolves. **Units are a `<datalist>`** — suggestions, not a restriction —
  so an unknown unit flows into the existing "could not convert" handling instead
  of being blocked.
- **The POST returns the full recipe**, so success navigates straight to
  `/recipes/{id}` with no second fetch.
- The form states up front that added recipes are in memory only.

### `ErrorBox.tsx` — server, 14 lines

`title` + `message` + a link back to the list. It exists so failure looks the same
everywhere and **every dead end has an exit**. It does not decide the wording —
`lib/api.ts` does.

---

## 6. Where input lives, and why the split falls there

| Takes user input | What happens |
|---|---|
| `Filters.tsx` | Rewrites the URL → server re-fetches → new results |
| `ServingScaler.tsx` | Recomputes quantities and calories in the browser |
| `RecipeForm.tsx` | POSTs; renders per-field errors from the 400 |
| `app/error.tsx` | "Try again" re-runs the failed render |

Everything else is static markup or a plain `<Link>`.

**Input handling is concentrated in `components/`; data fetching is concentrated in
`app/`. They never overlap.**

```
app/*/page.tsx              components/Filters.tsx
reads the URL               writes the URL
fetches from the API        never fetches
runs on the server          runs in the browser
ships no JS                 ships JS
```

**The URL is the seam.** The filter component's only job is to change it; the
page's only job is to read it and fetch. Neither imports the other's concerns —
which is why adding a filter touches one component and one backend file, and
nothing in between.

---

## 7. Two traces

**Typing "chicken" into the search box**

```
1  Filters sets local search state — the box updates instantly
2  a 250 ms timer starts; each further keystroke cancels and restarts it
3  timer fires → router.replace('/recipes?search=chicken')
4  the URL changed → app/recipes/page.tsx re-runs ON THE SERVER
5  it calls GET /api/recipes?search=chicken — the backend does the filtering
6  new grid HTML streams back; only the changed part re-renders
```

**Pressing `+` on a recipe**

```
1  ServingScaler sets servings 4 → 5
2  factor becomes 1.25
3  React re-renders the ingredient list and the totals
4  no network request at all
```

That contrast is the whole design in miniature: **anything that changes *which*
recipes you see goes through the URL and the server; anything that changes how
*one* recipe is presented stays in the browser.**
