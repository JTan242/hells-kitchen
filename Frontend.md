# Frontend guide

A file-by-file tour of `frontend-app/`. Companion to [Review.md](./Review.md),
which covers the whole project; this one goes deeper on the UI only.

Three questions answered here:

1. [What does each component do?](#3-the-components) → §3
2. [Why are there four `page.tsx` files and how do they differ?](#2-the-four-pagetsx-files) → §2
3. [Which files display things, and which take user input?](#4-display-vs-input) → §4

---

## 1. The map

```
frontend-app/
│
├── app/                          ← ROUTING. Folder names become URLs.
│   ├── layout.tsx                    the frame around every page (header, fonts)
│   ├── page.tsx                      URL:  /            → redirects to /recipes
│   ├── globals.css                   all styling, one file
│   ├── error.tsx                     shown if a page crashes unexpectedly
│   ├── not-found.tsx                 shown for URLs that do not exist
│   └── recipes/
│       ├── page.tsx               ← URL:  /recipes      the list screen
│       ├── new/
│       │   └── page.tsx           ← URL:  /recipes/new  the create form
│       └── [id]/
│           └── page.tsx           ← URL:  /recipes/1    the detail screen
│
├── components/                   ← REUSABLE UI PIECES. No URLs of their own.
│   ├── RecipeCard.tsx                one card in the grid
│   ├── Filters.tsx                   the whole filter/search/sort bar
│   ├── ServingScaler.tsx             ingredients + nutrition + the −/+ control
│   ├── RecipeForm.tsx                the add-a-recipe form
│   └── ErrorBox.tsx                  a failure message with a way out
│
└── lib/                          ← LOGIC AND DATA. Renders nothing.
    ├── api.ts                        the only code that calls the backend
    ├── types.ts                      the shapes the API returns
    └── format.ts                     number/date formatting and scaling maths
```

The three folders have a strict job split, and it is worth internalising because
it tells you where to put new code:

| Folder | Job | Rule of thumb |
|---|---|---|
| `app/` | **Which URL shows what.** Fetches data, decides page-level layout. | One folder per URL segment. |
| `components/` | **Reusable UI.** Given data as input, produces markup. | Never fetches. Data arrives as props. |
| `lib/` | **Everything that is not UI.** Network calls, maths, types. | No JSX in here at all. |

### The special filenames in `app/`

Inside `app/`, four filenames are reserved — Next.js looks for them by name.
Everything else in there is just a normal file.

| Filename | Meaning |
|---|---|
| `page.tsx` | **"This folder is a visitable URL, and this is its content."** |
| `layout.tsx` | **"Wrap everything below me in this."** Persists across navigations. |
| `error.tsx` | **"If something below me throws, show this instead."** |
| `not-found.tsx` | **"Show this for a URL/record that does not exist."** |

A folder in square brackets — `[id]` — is a **wildcard**. `app/recipes/[id]/`
matches `/recipes/1`, `/recipes/2`, `/recipes/anything`, and the matched value
is handed to the page as a parameter called `id`.

### How the pieces nest on screen

Opening `/recipes/1` builds this tree:

```
app/layout.tsx                       ← header bar + page frame
└── app/recipes/[id]/page.tsx        ← fetches recipe 1, lays out the screen
    ├── (its own header markup)          title, description, chips, meta
    ├── components/ServingScaler.tsx  ← ingredients + nutrition   [INTERACTIVE]
    └── (its own <ol> of steps)          instructions
```

And `/recipes`:

```
app/layout.tsx
└── app/recipes/page.tsx             ← fetches the list, lays out the screen
    ├── components/Filters.tsx       ← search/sort/chips             [INTERACTIVE]
    └── components/RecipeCard.tsx    ← one per recipe (×15)
```

`layout.tsx` is in both trees and is written once. That is the whole point of it.

---

## 2. The four `page.tsx` files

This is the part that confuses everyone coming to Next.js. **The name `page.tsx`
carries no meaning about the content.** It means one thing only:

> "The folder I am sitting in is a real URL, and I am what you see at it."

So the four files are unrelated screens that happen to share a filename. Their
folder is their identity:

| File | URL | Purpose | Lines |
|---|---|---|---|
| [`app/page.tsx`](frontend-app/app/page.tsx) | `/` | Redirect to `/recipes` | 6 |
| [`app/recipes/page.tsx`](frontend-app/app/recipes/page.tsx) | `/recipes` | The list screen | 77 |
| [`app/recipes/new/page.tsx`](frontend-app/app/recipes/new/page.tsx) | `/recipes/new` | The create form | 38 |
| [`app/recipes/[id]/page.tsx`](frontend-app/app/recipes/%5Bid%5D/page.tsx) | `/recipes/1` | The detail screen | 112 |

If it helps, mentally rename them: `HomePage`, `RecipeListPage`, `NewRecipePage`,
`RecipeDetailPage`. Next just insists all four be called `page.tsx` and locates
them by folder instead.

**Why `/recipes/new` is not mistaken for a recipe with the id "new":** Next
prefers a literal folder over a wildcard one, so `new/` always wins over `[id]/`.
Ordering in the filesystem does not matter; specificity does.

### `app/page.tsx` — the front door

The entire file:

```tsx
export default function Home() {
  redirect('/recipes');
}
```

The app has one meaningful entry point, so `/` does not render anything — it
sends you to `/recipes`. Returning a real HTTP redirect (307) is better than
rendering a "click here" page.

### `app/recipes/page.tsx` — the list screen

**Input:** the URL's query string — `?search=chicken&dietary=vegan&sort=calories`
**Output:** the filter bar plus a grid of cards

The shape of the file:

```tsx
export default async function RecipesPage({ searchParams }) {
  const params = await searchParams;              // 1. read the URL

  const [result, facets] = await Promise.all([    // 2. ask the API (both at once)
    fetchRecipes(toQuery(params)).catch(...),
    fetchFacets().catch(...),
  ]);

  if (result instanceof Error) return <ErrorBox ... />;   // 3. bail out on failure

  return (                                        // 4. hand data to components
    <div className="stack">
      <Filters facets={facets} resultCount={result.total} />
      <div className="grid">
        {result.recipes.map(r => <RecipeCard key={r.id} recipe={r} />)}
      </div>
    </div>
  );
}
```

Four things worth noticing:

- **`async` and `await` directly in a component.** You cannot do that in ordinary
  React. It works here because this runs *on the server* (see §3.0) — it is
  allowed to wait for a database or an API before producing any HTML.
- **`Promise.all`** runs both requests concurrently. Two sequential `await`s
  would double the wait for no reason.
- **`toQuery`** converts the page's own query string into one for the API. The
  filter names match on both sides deliberately, so it is a pass-through — adding
  a new filter needs no change here.
- **A dead `/api/facets` does not kill the page.** The recipes still render, with
  a "filters unavailable" note. Losing a control should not lose the content.

### `app/recipes/[id]/page.tsx` — the detail screen

**Input:** the `id` from the URL — `/recipes/1` gives `id = "1"`
**Output:** the recipe header, the scaler, and the instructions

The interesting logic is the error handling, which distinguishes two failures
that look the same from a distance:

```tsx
const recipe = await load(id);

if (recipe instanceof ApiError) {
  if (recipe.status === 404) notFound();          // recipe does not exist
  return <ErrorBox ... />;                        // API is down / broken
}
```

- **404** → `notFound()`, which renders `app/not-found.tsx` **and sends a real
  HTTP 404 status**. That matters for search engines and monitoring.
- **Anything else** → the error box, with a link back to the list.

Two smaller details:

- **`generateMetadata`** is an extra export that sets the browser tab title
  (`"Classic Margherita Pizza · Recipe Manager"`). Next runs it as a separate
  pass from the page body, which is why the fetch is wrapped in React's `cache()`
  — without it, one page view would hit the API twice.
- **Duplicate chips are filtered out** ([line 68](frontend-app/app/recipes/%5Bid%5D/page.tsx#L68)).
  `vegetarian` is often both a derived dietary claim and an author tag; it shows once.

### Why the list page is 77 lines and the detail page is 112

Not because the detail screen is harder — because it has more *markup*. It draws
a header, a chip row, a meta row, an allergen row and an instruction list inline.
The list page delegates almost everything to two components.

Neither file does any filtering, sorting, or nutrition maths. All of that lives in
the backend. That is why both are as short as they are.

---

## 3. The components

### 3.0 First: server components vs client components

This distinction explains everything else in this section, so it comes first.

By default, **a component runs on the server**. It executes once, on the machine
running Next.js, produces HTML, and sends that HTML to the browser. Its
JavaScript is never downloaded. It cannot use `useState`, `onClick`, or anything
that reacts to a user, because by the time the user sees it, it has finished
running and is gone.

Add the line `'use client'` at the top and it becomes a **client component**: its
code is downloaded and re-run in the browser, so it can hold state and respond to
events. The cost is bytes over the wire and work on the user's device.

The rule this project follows: **server by default; client only where something
must react to a click or a keystroke.**

```
                        server                            client
                        (HTML only, no JS shipped)        ('use client', ships JS)
  ┌─────────────────────────────────────────┬──────────────────────────────┐
  │  app/layout.tsx                         │  components/Filters.tsx      │
  │  app/page.tsx                           │  components/ServingScaler.tsx│
  │  app/recipes/page.tsx                   │  app/error.tsx               │
  │  app/recipes/[id]/page.tsx              │                              │
  │  app/not-found.tsx                      │                              │
  │  components/RecipeCard.tsx              │                              │
  │  components/ErrorBox.tsx                │                              │
  └─────────────────────────────────────────┴──────────────────────────────┘
```

Seven server, three client. That ratio is why the whole app is ~107 KB of
JavaScript.

### 3.1 `RecipeCard.tsx` — one card in the grid

**Server component. 46 lines. Pure display.**

Receives one `RecipeSummary` and renders a clickable card: title, description, up
to three tags, and a meta row (total time, difficulty, servings, calories).

It takes no input and holds no state. The whole card is wrapped in a `<Link>`, so
clicking anywhere on it navigates to the detail page — that link is the only
"interaction", and links need no JavaScript.

Two deliberate touches, both about not lying with numbers:

**Calories are hidden when they come back as `0`**, because 0 means "we could not
calculate this", and printing `0 kcal` would be a lie.

**An incomplete figure is marked**, because it is not comparable to a complete
one:

```tsx
const estimated = !recipe.nutritionComplete;
// renders "≥ 158 kcal*" with a tooltip, instead of a bare "158 kcal"
```

Without this, sorting by calories ranked Chocolate Chip Cookies as the
second-lightest recipe — butter and both sugars are missing from the data, so its
total only counted flour and chocolate chips.

### 3.2 `Filters.tsx` — the entire control bar

**Client component. 276 lines — the biggest UI file. This is where user input lives.**

Renders nine controls, plus a clear-all button:

| Control | Type | URL parameter it writes |
|---|---|---|
| Search box | text input | `?search=` |
| Sort by | dropdown | `?sort=` |
| Order | dropdown | `?order=` |
| Max minutes | number input | `?maxTotalTime=` |
| Diet chips | toggle buttons | `?dietary=` |
| Difficulty chips | toggle buttons | `?difficulty=` |
| Tags chips | toggle buttons | `?tags=` |
| Exclude allergens chips | toggle buttons | `?excludeAllergens=` |
| Must contain | dropdown + removable chips | `?ingredients=` |
| Clear all filters | button | wipes them all |

#### The one big idea: state lives in the URL

Clicking the "vegan" chip does **not** set a variable. It navigates:

```
/recipes                    →    /recipes?dietary=vegan
```

The server component above then re-runs with the new query and renders new
results. The flow:

```
  user clicks a chip
         │
         ▼
  toggle('dietary', 'vegan')          ← builds the new query string
         │
         ▼
  router.replace('/recipes?dietary=vegan')
         │
         ▼
  app/recipes/page.tsx re-runs on the server
         │
         ▼
  new HTML for the grid streams back
```

Three things come free from this and are not available with ordinary React state:

- The **back button works** — it steps back through your filter changes.
- A filtered view is a **shareable link**.
- The **first paint is already correct** — open a filtered URL and the server
  renders filtered results immediately, with no flash of unfiltered content.

#### The one exception: the search box

Every other control writes to the URL the instant you touch it. The text box
cannot, or typing "chicken" would fire seven requests and the results would
flicker. So it keeps a local `useState` and **debounces**: it waits 250 ms after
you stop typing before navigating.

```tsx
const [search, setSearch] = useState(params.get('search') ?? '');

useEffect(() => {
  const timer = setTimeout(() => { /* ...navigate... */ }, 250);
  return () => clearTimeout(timer);      // typing again cancels the pending nav
}, [search, pathname, router]);
```

The `isFirstRender` guard stops it from firing a redundant navigation the moment
the page loads.

#### `IngredientPicker` — the odd one out

Every other filter is a chip row, but there are 46 ingredients — a chip row would
swamp the page. So this is a native `<select>` that adds one ingredient at a time,
with the chosen ones shown below as removable chips.

Native `<select>` means it is type-to-search, works properly on mobile, and needs
no dependency. The select always resets to its placeholder because it is an *add*
action, not a display of state — the chips are the state.

It also needs its own component rather than reusing `FilterGroup`, because the
ingredient facet is `{ id, name }[]` (filter by id, display the name) while every
other facet is a plain `string[]`.

#### `FilterGroup` — the small helper at the bottom

The same chip row is needed four times (diet, difficulty, tags, allergens), so it
is written once as a small component at the bottom of the file and called four
times with different data. It returns `null` when it has no options, so an empty
group leaves no empty heading behind.

Its chips carry `aria-pressed`, which does double duty: it tells screen readers
the button is a toggle and whether it is on, **and** it drives the CSS highlight
(`.chip[aria-pressed="true"]`). One source of truth, so the visual state and the
announced state can never disagree.

### 3.3 `ServingScaler.tsx` — ingredients, nutrition, and the −/+ control

**Client component. 118 lines. The other place user input lives.**

Holds one number:

```tsx
const [servings, setServings] = useState(recipe.servings);
```

Everything else is derived from it:

```tsx
const factor = servings / recipe.servings;
```

Then:

- **every ingredient quantity** is multiplied by `factor`
- **the nutrition total** is multiplied by `factor`
- **the per-serving figures are not scaled** — that is the entire point of
  per-serving. 4 servings or 8, one serving contains the same thing.

Why ingredients and nutrition are in the *same* component: one control drives
both. Splitting them would mean lifting the identical state into a parent and
passing it down twice, for no gain.

Why the maths is in the browser rather than the API: it is multiplication. A
network round trip every time you tap `+` would be slower and no more correct.

The formatting is handled by `lib/format.ts`, which renders results the way a
recipe would write them — halving `1 cup` gives `1/2`, not `0.5`.

This component also shows the missing-ingredient disclosure: ingredients with no
nutrition data get a "no nutrition data" chip, and the footnote says how many
were excluded from the total.

### 3.4 `RecipeForm.tsx` — the only place the app writes

**Client component. 340 lines — now the biggest UI file.**

Everything else in this app reads. This one sends a `POST`, which brings two
problems the read screens never had.

**Where does validation live?** On the server, and only there. The form sends
what the user typed and renders whatever `fields` come back on a 400:

```tsx
catch (error) {
  if (error instanceof ApiError) setErrors(error.fields);
}
```

The error keys the server sends (`title`, `ingredients.0.amount`) match how the
form names its inputs, so each message lands next to the input it belongs to.
Duplicating the rules in the browser would give two sets that can disagree — and
the browser's copy can be bypassed anyway. The native `required` and `min`
attributes still catch the obvious cases first, saving a round trip without
becoming a second source of truth.

**How do you edit a list of things?** Ingredients and instructions are arrays, so
each is a list of rows with add and remove buttons. The one rule worth noting:
**the last row can never be removed**, because a form with no inputs is a dead
end with no way back.

Ingredients are picked from a `<select>` built from the same facets the filter bar
uses, so a new recipe can only reference ingredients that exist and its nutrition
always resolves. Units are a `<input list>` datalist instead — suggestions, not a
restriction — so an unrecognised unit flows into the existing "could not convert"
handling rather than being blocked.

On success the server returns the created recipe in full, so the form navigates
straight to `/recipes/{id}` with no second request.

### 3.5 `ErrorBox.tsx` — a failure with a way out

**Server component. 26 lines. Pure display.**

Takes a `title` and a `message` and renders them with a link back to the recipe
list. Used by both the list page and the detail page.

It exists so failure looks the same everywhere, and so **every dead end has an
exit**. A user who hits an error should never have to reach for the back button.

It does not decide *what* the message says — [`lib/api.ts`](frontend-app/lib/api.ts)
does that, turning a connection refusal into "Cannot reach the recipe API at
http://localhost:8080. Is the backend running?" rather than the browser's
unhelpful "fetch failed".

---

## 4. Display vs input

Your third question, answered directly.

### Files that only display

They receive data and produce markup. Nothing here reacts to a user.

| File | Displays |
|---|---|
| `app/layout.tsx` | Header bar, site title, page frame |
| `app/recipes/page.tsx` | Page structure for the list; the empty state; the "recipes withheld" notice |
| `app/recipes/[id]/page.tsx` | Recipe header, tags, meta row, allergens, instructions |
| `components/RecipeCard.tsx` | One card |
| `components/ErrorBox.tsx` | An error message |
| `app/not-found.tsx` | The 404 screen |
| `app/globals.css` | All visual styling |

### Files that take user input

Only three, and only two matter day to day.

| File | Input it accepts | What happens |
|---|---|---|
| **`components/Filters.tsx`** | typing, dropdowns, number entry, chip clicks, clear-all | Rewrites the URL → server re-fetches → new results |
| **`components/ServingScaler.tsx`** | `−` / `+` / reset clicks | Recomputes quantities and calories in the browser |
| **`components/RecipeForm.tsx`** | every field of a new recipe | POSTs to the API; renders per-field errors from the 400 |
| `app/error.tsx` | "Try again" click | Re-runs the failed render |

That is the whole inventory. Everything else on screen is either static or a
plain `<Link>`.

### Why the split falls where it does

Notice that **input handling is concentrated in `components/`, and data fetching
is concentrated in `app/`.** They do not overlap:

```
   app/*/page.tsx                 components/Filters.tsx
   ─────────────────              ──────────────────────────
   reads the URL                  writes the URL
   fetches from the API           never fetches
   runs on the server             runs in the browser
   ships no JavaScript            ships JavaScript
```

The URL is the seam between them. The filter component's only job is to *change
the URL*; the page's only job is to *read the URL and fetch*. Neither imports the
other's concerns, which is why you can add a filter by touching one component and
one backend file, and nothing in between.

---

## 5. "I want to change X — which file?"

| Goal | File |
|---|---|
| Change colours, spacing, dark mode | `app/globals.css` (colours are variables at the top) |
| Change what a card shows | `components/RecipeCard.tsx` |
| Add or remove a filter control | `components/Filters.tsx` (+ the backend to honour it) |
| Change how incomplete calories are marked | `components/RecipeCard.tsx` |
| Add a sort option | `SORT_OPTIONS` in `components/Filters.tsx` + `comparator` in `backend-app/src/recipes.ts` |
| Change the detail page layout | `app/recipes/[id]/page.tsx` |
| Change how quantities are written (`1/2` vs `0.5`) | `lib/format.ts` |
| Change the header or site title | `app/layout.tsx` |
| Point at a different backend | `NEXT_PUBLIC_API_URL`, read in `lib/api.ts` |
| Change an error message | `lib/api.ts` for the wording, `components/ErrorBox.tsx` for the look |
| Change the create form | `components/RecipeForm.tsx`; the rules it obeys are in `backend-app/src/validation.ts` |
| Add a new screen | a new folder under `app/` with a `page.tsx` in it |

---

## 6. Two traces, end to end

**You type "chicken" into the search box.**

1. `Filters.tsx` updates its local `search` state. The box shows what you typed
   immediately.
2. A 250 ms timer starts. Each further keystroke cancels and restarts it.
3. The timer fires. `router.replace('/recipes?search=chicken')`.
4. The URL changes, so `app/recipes/page.tsx` re-runs **on the server**.
5. It calls `GET /api/recipes?search=chicken`; the backend does the filtering.
6. New HTML for the grid streams back. Only the changed part re-renders.

**You open a recipe and press `+`.**

1. `ServingScaler.tsx` sets `servings` from 4 to 5.
2. `factor` becomes `5/4 = 1.25`.
3. React re-renders the ingredient list and the calorie total.
4. **No network request at all.** It is instant.

The contrast is the design in miniature: **anything that changes *which* recipes
you see goes through the URL and the server; anything that changes how *one*
recipe is presented stays in the browser.**
