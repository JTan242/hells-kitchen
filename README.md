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

### Setup

Folders are `backend-app/` and `frontend-app/` (the names in the original
instructions were `backend/` and `frontend/`).

```
cd backend-app && npm install && npm run dev    # Express API on :8080
cd frontend-app && npm install && npm run dev   # Next.js UI on :3000
```

No extra services or env files are required. The frontend defaults to
`http://localhost:8080`; override with `NEXT_PUBLIC_API_URL` if you move the API.

Both apps are TypeScript in `strict` mode.

```
cd backend-app  && npm run typecheck && npm test    # 49 tests
cd frontend-app && npm run typecheck && npm run lint && npm run build
```

Copy `.env.example` to `.env` in either app to override defaults. Neither is
required locally.

### Implementation choices

- **Both apps converted to TypeScript.** The scaffold shipped as plain JS; the
  brief lists types as a bonus and TS best practice as a criterion.
- **Filtering, sorting and nutrition run on the server.** The client never holds
  the full dataset, so the same API shape works at 15 recipes or 15,000.
- **Filter state lives in the URL.** Results render server-side on first paint
  and a filtered view is a shareable link. Filter changes use `router.replace`,
  so they do not each become a history entry.
- **Serving scaling is client-side maths.** Instant, and a round trip per tap
  would be no more correct.
- **No UI or state library.** Plain CSS custom properties and React state; the
  app is not large enough for either to pay for itself.

A full walkthrough of the architecture and every trade-off is in
[Review.md](./Review.md).

### Completed features

Core: recipe list, detail page (ingredients, instructions, tags, calculated
nutrition), and search/filter by name, tag and ingredient.

Bonus: dietary filters, allergen exclusion, an exact ingredient picker, recipe
scaling by serving size, a calorie calculator that follows the scaler, sorting
(name / prep time / total time / difficulty / calories / date added), a
max-cook-time filter, an add-recipe form with server-side validation, and derived
filter options served from the data rather than hardcoded. Backend logic is
covered by 49 unit tests.

### Assumptions

- **Ingredient nutrition is per 100 g.** `data.json` does not say so, but the
  numbers match standard per-100 g references (chicken breast 165 kcal, ground
  beef 250 kcal, mozzarella 280 kcal).
- **Volume and count units convert to grams via a fixed table.** One number per
  unit, not per ingredient, so a cup of flour and a cup of milk are treated as
  the same weight. Totals are therefore estimates and the UI labels them as such.
- **A recipe's own dietary tags are authoritative.** Tags are derived from
  ingredients only when every ingredient resolves; otherwise the author's tags
  are used unchanged, so an incomplete list can never invent a "vegan" claim.

### Known limitations

- **8 of the ingredient ids referenced by recipes have no row in the ingredients
  table** (`basil`, `broccoli`, `brown_sugar`, `butter`, `carrot`, `ginger`,
  `soy_sauce`, `white_sugar`). Four recipes are affected, one of them badly:
  Chicken Stir-Fry can only account for 1 of its 5 ingredients.

  This is a data gap rather than a bug, but it is not hidden. Affected recipes
  show their calories as `≥ 158 kcal*` rather than a bare figure, missing
  ingredients are listed with a "no nutrition data" badge, and **the allergen
  filter withholds them entirely** — a recipe that cannot account for all its
  ingredients must not be presented as free of an allergen. The list says how
  many were withheld and why.
- **Unit conversion is approximate** (see assumptions) — expect calorie figures
  to be directionally right rather than exact.
- **Frontend has no tests.** The backend's pure logic is covered; `lib/format.ts`
  (quantity scaling and fraction rendering) is not.
- **No pagination.** Fine for 15 recipes; the list endpoint already returns an
  envelope with room for it.
- **Added recipes live in memory only.** `POST /api/recipes` appends to the
  in-memory store and never writes to `data.json` — the file is a fixture, and on
  a free-tier host the filesystem is ephemeral, so a write would silently vanish
  on restart. The form says this plainly rather than implying persistence.
- **No edit or delete.** Create is the only write; full CRUD on a fixture would
  be scope without much to show for it.
- **New recipes can only use existing ingredients.** The form picks from the 46
  in the table, so nutrition always resolves. Inventing an ingredient would mean
  a second write path for the ingredients table.

### Deployment

`frontend-app/vercel.json` and `backend-app/render.yaml` are included.

1. **API → Render**: new Blueprint from this repo, Root Directory `backend-app`.
   Once it is live, set `ALLOWED_ORIGIN` to the frontend URL to close CORS.
2. **UI → Vercel**: import the repo, Root Directory `frontend-app`, set
   `NEXT_PUBLIC_API_URL` to the Render URL.

Node 20 is pinned via `.nvmrc` and an `engines` field in both apps.

### With more time

A shared types package so the frontend and backend contract cannot drift,
`gramsPerUnit` on each ingredient row to replace the conversion table, tests for
`lib/format.ts`, real persistence behind `db.ts` so added recipes survive a
restart, pagination on the list endpoint, and a shopping-list generator across
selected recipes.
