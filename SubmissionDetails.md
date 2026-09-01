# Submission Details

> Draft for the `Candidate Notes` section of [README.md](./README.md).
> Deeper walkthroughs live in [Backend.md](./Backend.md), [Frontend.md](./Frontend.md)
> and [Review.md](./Review.md).

---

## Setup

Folders are `backend-app/` and `frontend-app/` (the brief called them `backend/`
and `frontend/`).

```bash
cd backend-app  && npm install && npm run dev   # Express API on :8080
cd frontend-app && npm install && npm run dev   # Next.js UI on :3000
```

No extra services, no database, no env files needed. The frontend defaults to
`http://localhost:8080`; set `NEXT_PUBLIC_API_URL` to point elsewhere. Each app
has a `.env.example` if you want to override defaults. Node 20+.

Checks:

```bash
cd backend-app  && npm run typecheck && npm test              # 49 tests
cd frontend-app && npm run typecheck && npm run lint && npm run build
```

---

## Implementation choices

- **TypeScript everywhere, `strict` mode.** The scaffold was plain JS. The
  backend also runs `noUncheckedIndexedAccess`, which is what forces the missing
  ingredients below to be handled rather than crashed on.
- **Filtering, sorting and nutrition happen on the server.** The client never
  holds the whole dataset, so the same API works at 15 recipes or 15,000.
- **Filter state lives in the URL, not React state.** First paint is already
  filtered, the back button works, and a filtered view is a shareable link.
- **Serving scaling is client-side maths.** It is multiplication — a request per
  tap would be slower and no more correct.
- **Validation lives only on the server**, returning per-field errors keyed to the
  form's input names. Two copies of the rules would drift, and the browser's copy
  is bypassable anyway.
- **No UI or state library.** Plain CSS custom properties and React state. The app
  isn't big enough for either to pay for itself.

---

## Completed features

**Core**

- Recipe list at `/recipes`
- Detail page at `/recipes/:id` — ingredients with quantities, instructions, tags,
  and nutrition calculated from the ingredients
- Search and filter by recipe name, tag and ingredient

**Bonus**

- Dietary filters (vegan, vegetarian, gluten-free, keto, high-protein)
- Allergen exclusion filter
- Recipe scaling by serving count, with the calorie calculator following it live
- Sorting by name, prep time, total time, difficulty, calories or date added
- Max-cook-time filter and an exact ingredient picker
- Add-recipe form (`POST /api/recipes`) with server-side validation
- Filter options derived from the data, so the UI never offers a dead option
- Full TypeScript in strict mode
- 49 unit tests over the backend logic

---

## Assumptions

1. **Ingredient nutrition is per 100 g.** `data.json` doesn't say. The values match
   standard per-100 g references (chicken breast 165, ground beef 250), so that's
   the basis.
2. **Units convert to grams by a fixed table** — one figure per unit, not per
   ingredient. A cup of flour and a cup of milk are treated as the same weight, so
   totals are **estimates** and the UI labels them that way.
3. **A recipe's own tags win when the data is incomplete.** Dietary claims are
   derived from ingredients only when *every* ingredient resolves. Otherwise the
   author's tags are used unchanged, so a gap can never invent a "vegan" claim.

---

## Known limitations

- **8 ingredient ids referenced by recipes have no row in the ingredients table**
  — `basil`, `broccoli`, `brown_sugar`, `butter`, `carrot`, `ginger`, `soy_sauce`,
  `white_sugar`. Four of the 15 recipes are affected — Margherita Pizza (4/5
  ingredients resolve), Stir-Fried Tofu (2/3), Chocolate Chip Cookies (2/5) and
  Chicken Stir-Fry, which accounts for only 1 of its 5.

  This is a data gap, not a bug, and it's surfaced rather than hidden: affected
  recipes show `≥ 158 kcal*` instead of a bare number, unresolved ingredients get
  a "no nutrition data" badge, and **the allergen filter withholds them entirely**
  — a recipe that can't account for all its ingredients must not be shown as free
  of an allergen. The list says how many were withheld and why.
- **Calorie figures are approximate**, for the unit-conversion reason above.
  Directionally right, not exact.
- **No frontend tests.** Backend logic is covered; `lib/format.ts` (quantity
  scaling and fraction rendering) is not.
- **No pagination.** Fine at 15 recipes. The list endpoint already returns an
  envelope (`{ recipes, total, withheld }`) with room to add it.
- **Added recipes live in memory only.** `POST /api/recipes` appends to the
  in-memory store and never writes `data.json` — it's a fixture, and on a
  free-tier host the filesystem is ephemeral, so a write would vanish on restart.
  The form says so plainly instead of implying persistence.
- **No edit or delete.** Create is the only write.
- **New recipes can only use existing ingredients**, so their nutrition always
  resolves.

---

## Deployment

<!-- PLACEHOLDER — fill in once deployed -->

| | URL |
|---|---|
| Frontend | _TBD_ |
| API | _TBD_ |

`frontend-app/vercel.json` and `backend-app/render.yaml` are included; Node 20 is
pinned via `.nvmrc` and an `engines` field in both apps.

1. **API → Render**: new Blueprint from this repo, Root Directory `backend-app`.
   Once live, set `ALLOWED_ORIGIN` to the frontend URL to close CORS.
2. **UI → Vercel**: import the repo, Root Directory `frontend-app`, set
   `NEXT_PUBLIC_API_URL` to the Render URL.

---

## With more time

- A shared types package, so the frontend and backend contract can't drift
- `gramsPerUnit` on each ingredient row, replacing the fixed conversion table —
  the single biggest accuracy win available
- Tests for `lib/format.ts`
- Real persistence behind `db.ts` so added recipes survive a restart
- Pagination on the list endpoint
- A shopping-list generator across selected recipes
