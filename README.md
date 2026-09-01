# Recipe Manager - Full Stack Take-Home Exercise

## Overview
Create a recipe management application that allows users to view, search, and organize recipes. This exercise tests your ability to build a full-stack web application with a focus on data relationships and user experience.

## Tips
- Use whatever frameworks/tools you're most comfortable with
- Focus on creating a working MVP before adding advanced features
- Be sure to document any assumptions or known limitations
- Test your application with different scenarios

## Setup Instructions

#### Backend setup
```
cd backend
npm install
npm run dev # Starts express server on port 8080
```

#### Frontend setup
```
cd frontend
npm install
npm run dev # Starts nextjs frontend server on port 3000
```

#### Database setup
```
The application uses a JSON file (`data.json`) as a mock database
```

**Note: Feel free to use whatever frontend or backend framework you want. The sample contains a Next.js + Express server scaffold, but use whatever you're comfortable with.**

## Requirements

#### Core Features (Required)
- Display a list of recipes with their basic information (`/recipes`)
- Implement recipe detail page (`/recipes/:id`) showing:
  - Ingredients with quantities
  - Cooking instructions
  - Tags
  - Nutritional information (calculated from ingredients)
- Add search/filter functionality on (`/recipes`) by:
  - Recipe name
  - Tags
  - Ingredients

#### Example Advanced Features (Bonus Points. Feel free to implement any of these or add your own. Some examples below)
- Implement dietary restriction filters (e.g., vegetarian, vegan, gluten-free)
- Create a calorie calculator based on serving size
- Add recipe scaling functionality (e.g., adjust ingredients for different serving sizes)
- Implement recipe favoriting/saving
- Add sorting options (prep time, difficulty, etc.)
- Add a "shopping list" generator for selected recipes
- Incorporate an LLM feature
- Types

## Evaluation Criteria
- Code organization and clarity
- UI/UX design and responsiveness
- API design and implementation
- Error handling and edge cases
- Performance considerations
- TypeScript/JavaScript best practices 

## Submission
1. Update this README with a new section below called `Candidate Notes:
   - Setup instructions if you've added any requirements
   - Brief explanation of your implementation choices
   - List of completed features
   - Any assumptions made
   - Known limitations or bugs
   - Additional features you'd add with more time
 

2. Send us (via email to scott.nguyen@sprx.tax & anthony.difalco@sprx.tax):
   - A zip file of the entire project (frontend and backend)
   - A link to a deployed version of the application (bonus points)


Good luck! We're excited to see your implementation.


---

## Candidate Notes

### Live demo

| | |
|---|---|
| **App** | https://hells-kitchen-ten.vercel.app |
| **API** | https://recipe-api-izfc.onrender.com |

The API is on Render's free tier and sleeps after ~15 minutes idle, so the first
page load takes about 13 seconds while it wakes. Everything after that is ~0.2s.

Folders are `backend-app/` and `frontend-app/`. Node 20+.
`npm test` runs 49 backend and 16 frontend tests.

### Design decisions

**The gaps in the ingredient data drive the design.** Eight referenced ingredient
ids have no row, so the obvious join throws on four of the fifteen recipes. Rather
than hide that:

- Unresolved ingredients still render, marked, and are left out of totals rather
  than counted as zero.
- Affected recipes show `≥ 158 kcal*`. Without the marker, sorting by calories put
  Chocolate Chip Cookies among the lightest recipes, since butter and both sugars
  are missing.
- **The allergen filter withholds them.** Chicken Stir-Fry declares no allergens but
  contains soy sauce, so excluding gluten showed it as safe. Everywhere else a gap
  costs accuracy; here it could cost a reaction, so this is the one place the app
  declines to answer rather than answering approximately. The list reports how many
  it withheld.
- Dietary claims are derived only when every ingredient resolves; otherwise the
  recipe's own tags stand, so a gap can never invent a "vegan" label.

**Each layer hides the one below, so each file has a single reason to change.**

```
types.ts       shapes only, no runtime code
db.ts          the only file that touches the data source
nutrition.ts   pure maths — no I/O, no HTTP, trivially testable
recipes.ts     composes db + nutrition into answers
routes.ts      the untrusted boundary; nothing deeper sees raw input
server.ts      transport, CORS, error envelopes
```

Swapping `data.json` for a real datastore is confined to `db.ts`. Better unit
conversions are confined to `nutrition.ts`. A new filter is `recipes.ts` plus one
line in `routes.ts`. Auth would be `server.ts`.

The frontend mirrors it: `app/` routes and fetches, `components/` render from props
and never fetch, `lib/` holds logic with no JSX. **The URL is the seam** — `Filters`
only writes it, pages only read it, and the two never import each other. A new
filter therefore touches one component and one backend file, with nothing in
between.

**The server owns filtering, sorting and validation.** The client never holds the
dataset, so the API shape still holds as the data grows. Validation returns every
failing field at once rather than the first — a second copy of the rules in the
browser would drift, and is bypassable anyway.

### Beyond the core requirements

**From the suggested bonus list**

| Feature | Notes |
|---|---|
| Dietary restriction filters | derived from ingredients, not hardcoded |
| Calorie calculator by serving size | follows the scaler live, computed in the browser |
| Recipe scaling | volumes rescale as fractions (`1/2` → `5/8`), weights as decimals |
| Sorting | six fields, each ascending or descending |
| Types | both apps `strict`; the backend adds `noUncheckedIndexedAccess` |

**Added beyond it**

| Feature | Notes |
|---|---|
| Allergen exclusion | with the withholding behaviour above |
| Exact ingredient picker | AND across selections — "chicken *and* ginger" |
| Max total time filter | |
| Add-recipe form | `POST /api/recipes` with server-side validation |
| `GET /api/facets` | filter options derived from the data, so no option matches nothing |
| Shareable filtered views | filter state lives in the URL |
| Error handling | real 404s, a distinct screen for an unreachable API, JSON error envelope throughout |
| 65 unit tests | 49 backend, 16 frontend |
| Deployed | Vercel + Render, CORS locked to the frontend origin |

Not attempted: favouriting, shopping lists, and an LLM feature.

### File structure

```
backend-app/src/
server.ts      boot, CORS, 404/500 nets
  ├─ routes.ts        URL/body → trusted values, JSON out
  │    ├─ validation.ts    POST body → NewRecipeInput | field errors
  │    └─ recipes.ts       join, derive, filter, sort          ← the logic
  │         ├─ nutrition.ts    amount + unit → grams → kcal   (pure)
  │         └─ db.ts           data.json → in-memory Store
  └─ db.ts            also imported directly, to load() before listen()

types.ts       shapes only, zero runtime code — imported by everything
```

```
frontend-app/                       [client] = ships JS; the rest render server-side
app/layout.tsx            header + page frame, wraps every route
app/page.tsx              /             redirect to /recipes

app/recipes/page.tsx      /recipes      reads the URL's filters, renders the grid
  ├─ lib/api.ts                fetchRecipes + fetchFacets, concurrently
  ├─ components/Filters.tsx    [client] writes filter state back to the URL
  ├─ components/RecipeCard.tsx one card; flags incomplete calorie figures
  └─ components/ErrorBox.tsx   shown when the API is unreachable

app/recipes/[id]/page.tsx  /recipes/:id
  ├─ lib/api.ts                fetchRecipe; a 404 and a dead API differ
  ├─ components/ServingScaler.tsx  [client] servings → quantities + nutrition
  │    └─ lib/format.ts             scaling, fraction rendering        (pure)
  └─ components/ErrorBox.tsx

app/recipes/new/page.tsx   /recipes/new
  ├─ lib/api.ts                fetchFacets for the dropdown options
  └─ components/RecipeForm.tsx [client] POSTs, renders per-field errors
       └─ lib/api.ts               createRecipe → 201 | 400 + fields

app/error.tsx / not-found.tsx    unhandled throws / unknown URLs
lib/types.ts   the API contract, mirrored from the backend by hand
```

### Assumptions

1. **Nutrition is per 100 g.** Not stated in the data, but the values match standard
   per-100 g references (chicken breast 165, ground beef 250).
2. **Units convert to grams by a fixed table** — one figure per unit, not per
   ingredient, so a cup of flour and a cup of milk weigh the same. Totals are
   therefore estimates, and the UI labels them as such.

### Known limitations

- **Calorie figures are approximate**, per assumption 2. Directionally right.
- **Added recipes live in memory only.** `POST` never writes `data.json` — a
  free-tier filesystem is ephemeral, so a write would look like persistence until
  it silently vanished. The form says so.
- **No edit or delete**, and new recipes can only reference existing ingredients.
- **No pagination.** The list endpoint already returns `{ recipes, total, withheld }`
  with room for it.
- **Awkward fractions round.** Scaling snaps to common kitchen fractions, so 5/12
  cup falls back to `0.42 cup`.
- **Frontend tests cover `lib/format.ts` only**; components and pages are untested.

### With more time

- **An LLM to classify ingredients.** The root problem is that eight ingredients
  carry no dietary or allergen data. Inferring those tags from the ingredient name
  at import time — soy sauce as soy/gluten/wheat, butter as non-vegan — would close
  the allergen gap properly, instead of the app having to withhold recipes it
  cannot vouch for.
- **`gramsPerUnit` per ingredient**, replacing the fixed conversion table. The
  single biggest accuracy win available.
- **A shared types package**, so the frontend and backend contract cannot drift.
- **Real persistence** behind `db.ts`.
- Pagination, component tests, and a shopping-list generator.
