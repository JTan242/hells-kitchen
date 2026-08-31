'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError, createRecipe } from '@/lib/api';
import type { Difficulty, Facets } from '@/lib/types';

/** Units nutrition.ts can convert. Offered as suggestions, not enforced — an
 *  unknown unit is handled the same way an unknown ingredient is. */
const UNITS = [
  'g', 'ml', 'oz', 'lb', 'cup', 'cups', 'tbsp', 'tsp',
  'small', 'medium', 'large', 'whole', 'pieces', 'cloves', 'leaves', 'slices',
];

interface IngredientRow {
  ingredientId: string;
  amount: string;
  unit: string;
}

const EMPTY_ROW: IngredientRow = { ingredientId: '', amount: '', unit: '' };

/**
 * The create-recipe form.
 *
 * The only place in the app that writes. Validation is the server's job — this
 * sends what the user typed and renders whatever `fields` come back on a 400,
 * so there is exactly one set of rules rather than two that can disagree.
 * The browser's own `required`/`min` attributes catch the obvious cases first,
 * which saves a round trip without becoming a second source of truth.
 */
export function RecipeForm({ facets }: { facets: Facets }) {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('4');
  const [prepTime, setPrepTime] = useState('15');
  const [cookTime, setCookTime] = useState('20');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [tags, setTags] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([{ ...EMPTY_ROW }]);
  const [instructions, setInstructions] = useState<string[]>(['']);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const setRow = (index: number, patch: Partial<IngredientRow>) =>
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addRow = () => setIngredients((rows) => [...rows, { ...EMPTY_ROW }]);
  // Never remove the last row: an empty form with no inputs is a dead end.
  const removeRow = (index: number) =>
    setIngredients((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));

  const setStep = (index: number, value: string) =>
    setInstructions((steps) => steps.map((step, i) => (i === index ? value : step)));
  const addStep = () => setInstructions((steps) => [...steps, '']);
  const removeStep = (index: number) =>
    setInstructions((steps) => (steps.length > 1 ? steps.filter((_, i) => i !== index) : steps));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const recipe = await createRecipe({
        title,
        description,
        servings: Number(servings),
        prepTimeMinutes: Number(prepTime),
        cookTimeMinutes: Number(cookTime),
        difficulty,
        ingredients,
        instructions,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      // Straight to the recipe that was just created — the POST already returned
      // it in full, so this needs no extra request.
      router.push(`/recipes/${recipe.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(
          Object.keys(error.fields).length > 0 ? error.fields : { _: error.message },
        );
      } else {
        setErrors({ _: 'Something went wrong. Please try again.' });
      }
      setSubmitting(false);
    }
  }

  /** Renders the server's message for a field, if it sent one. */
  const Err = ({ name }: { name: string }) =>
    errors[name] ? <span className="field-error">{errors[name]}</span> : null;

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate={false}>
      <p className="notice">
        Recipes you add are kept <strong>in memory only</strong> and disappear when the
        API restarts. The data file is a fixture and is never modified.
      </p>

      {errors._ && <div className="error-box">{errors._}</div>}

      <section className="panel stack" style={{ gap: 14 }}>
        <h3>Basics</h3>

        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Roast Chicken"
            required
            maxLength={200}
          />
          <Err name="title" />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short line about the dish"
            maxLength={200}
          />
          <Err name="description" />
        </div>

        <div className="control-row">
          <div className="field">
            <label htmlFor="servings">Servings</label>
            <input
              id="servings"
              type="number"
              min={1}
              max={100}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              required
            />
            <Err name="servings" />
          </div>

          <div className="field">
            <label htmlFor="prepTime">Prep (minutes)</label>
            <input
              id="prepTime"
              type="number"
              min={1}
              max={1440}
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              required
            />
            <Err name="prepTimeMinutes" />
          </div>

          <div className="field">
            <label htmlFor="cookTime">Cook (minutes)</label>
            <input
              id="cookTime"
              type="number"
              min={0}
              max={1440}
              value={cookTime}
              onChange={(e) => setCookTime(e.target.value)}
              required
            />
            <Err name="cookTimeMinutes" />
          </div>

          <div className="field">
            <label htmlFor="difficulty">Difficulty</label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {facets.difficulties.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <Err name="difficulty" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="tags">Tags</label>
          <input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="dinner, italian (comma separated)"
            list="known-tags"
          />
          {/* Suggestions come from the data, so new recipes reuse existing tags
              rather than inventing near-duplicates. */}
          <datalist id="known-tags">
            {facets.tags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <Err name="tags" />
        </div>
      </section>

      <section className="panel stack" style={{ gap: 12 }}>
        <h3>Ingredients</h3>
        <Err name="ingredients" />

        {ingredients.map((row, index) => (
          <div key={index} className="row-editor">
            <div className="field" style={{ flex: '2 1 200px' }}>
              <label className="sr-only" htmlFor={`ingredient-${index}`}>
                Ingredient {index + 1}
              </label>
              <select
                id={`ingredient-${index}`}
                value={row.ingredientId}
                onChange={(e) => setRow(index, { ingredientId: e.target.value })}
              >
                <option value="">Choose an ingredient…</option>
                {facets.ingredients.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <Err name={`ingredients.${index}.ingredientId`} />
            </div>

            <div className="field" style={{ flex: '1 1 90px', minWidth: 90 }}>
              <label className="sr-only" htmlFor={`amount-${index}`}>
                Amount
              </label>
              <input
                id={`amount-${index}`}
                value={row.amount}
                onChange={(e) => setRow(index, { amount: e.target.value })}
                placeholder="2 or 1/3"
              />
              <Err name={`ingredients.${index}.amount`} />
            </div>

            <div className="field" style={{ flex: '1 1 90px', minWidth: 90 }}>
              <label className="sr-only" htmlFor={`unit-${index}`}>
                Unit
              </label>
              <input
                id={`unit-${index}`}
                value={row.unit}
                onChange={(e) => setRow(index, { unit: e.target.value })}
                placeholder="cups"
                list="known-units"
              />
              <Err name={`ingredients.${index}.unit`} />
            </div>

            <button
              type="button"
              className="chip"
              onClick={() => removeRow(index)}
              disabled={ingredients.length === 1}
              aria-label={`Remove ingredient ${index + 1}`}
            >
              ×
            </button>
          </div>
        ))}

        <datalist id="known-units">
          {UNITS.map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>

        <div>
          <button type="button" className="link-button" onClick={addRow}>
            + Add ingredient
          </button>
        </div>
      </section>

      <section className="panel stack" style={{ gap: 12 }}>
        <h3>Instructions</h3>
        <Err name="instructions" />

        {instructions.map((step, index) => (
          <div key={index} className="row-editor">
            <div className="field grow">
              <label className="sr-only" htmlFor={`step-${index}`}>
                Step {index + 1}
              </label>
              <input
                id={`step-${index}`}
                value={step}
                onChange={(e) => setStep(index, e.target.value)}
                placeholder={`Step ${index + 1}`}
                maxLength={1000}
              />
            </div>
            <button
              type="button"
              className="chip"
              onClick={() => removeStep(index)}
              disabled={instructions.length === 1}
              aria-label={`Remove step ${index + 1}`}
            >
              ×
            </button>
          </div>
        ))}

        <div>
          <button type="button" className="link-button" onClick={addStep}>
            + Add step
          </button>
        </div>
      </section>

      <div className="control-row">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save recipe'}
        </button>
        <Link href="/recipes" className="link-button">
          Cancel
        </Link>
      </div>
    </form>
  );
}
