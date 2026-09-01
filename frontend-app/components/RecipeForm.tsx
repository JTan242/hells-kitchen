'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError, createRecipe } from '@/lib/api';
import type { Difficulty, Facets } from '@/lib/types';

/** Suggestions only. An unlisted unit is accepted and handled as unconvertible. */
const UNITS = [
  'g', 'ml', 'oz', 'lb', 'cup', 'cups', 'tbsp', 'tsp',
  'small', 'medium', 'large', 'whole', 'pieces', 'cloves', 'leaves', 'slices',
];

interface Row {
  ingredientId: string;
  amount: string;
  unit: string;
}

const EMPTY_ROW: Row = { ingredientId: '', amount: '', unit: '' };

/** Removes index `i`, unless it is the only entry — an empty form is a dead end. */
function removeAt<T>(items: T[], i: number): T[] {
  return items.length > 1 ? items.filter((_, n) => n !== i) : items;
}

/**
 * Label + control + the server's error for that field. Defined at module scope:
 * a component declared inside a render body is a fresh type each render, which
 * remounts its children and loses input focus while typing.
 */
function Field({
  name,
  label,
  error,
  hideLabel,
  style,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hideLabel?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className="field" style={style}>
      <label className={hideLabel ? 'sr-only' : undefined} htmlFor={name}>
        {label}
      </label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/**
 * Create-recipe form. Validation is server-side only; a 400 returns per-field
 * messages keyed to these input names, which `Field` renders inline.
 */
export function RecipeForm({ facets }: { facets: Facets }) {
  const router = useRouter();

  const [values, setValues] = useState({
    title: '',
    description: '',
    servings: '4',
    prepTimeMinutes: '15',
    cookTimeMinutes: '20',
    difficulty: 'easy',
    tags: '',
  });
  const [ingredients, setIngredients] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const setRow = (i: number, patch: Partial<Row>) =>
    setIngredients((rows) => rows.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const recipe = await createRecipe({
        ...values,
        // Constrained by the select, which only offers facets.difficulties.
        difficulty: values.difficulty as Difficulty,
        servings: Number(values.servings),
        prepTimeMinutes: Number(values.prepTimeMinutes),
        cookTimeMinutes: Number(values.cookTimeMinutes),
        ingredients,
        instructions,
        tags: values.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      // The POST returns the full recipe, so the detail page needs no refetch.
      router.push(`/recipes/${recipe.id}`);
    } catch (error) {
      const fields = error instanceof ApiError ? error.fields : {};
      setErrors(
        Object.keys(fields).length > 0
          ? fields
          : { _: error instanceof ApiError ? error.message : 'Something went wrong.' },
      );
      setSubmitting(false);
    }
  }

  // noValidate: native validation stops at the first invalid field, which would
  // hide the server's all-at-once field errors. `required` stays for semantics.
  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <p className="notice">
        Recipes you add are kept <strong>in memory only</strong> and disappear when the
        API restarts. The data file is never modified.
      </p>

      {errors._ && <div className="error-box">{errors._}</div>}

      <section className="panel stack" style={{ gap: 14 }}>
        <h3>Basics</h3>

        <Field name="title" label="Title" error={errors.title}>
          <input
            id="title"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Roast Chicken"
            required
            maxLength={200}
          />
        </Field>

        <Field name="description" label="Description" error={errors.description}>
          <input
            id="description"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="A short line about the dish"
            maxLength={200}
          />
        </Field>

        <div className="control-row">
          {(
            [
              ['servings', 'Servings', 1],
              ['prepTimeMinutes', 'Prep (minutes)', 1],
              ['cookTimeMinutes', 'Cook (minutes)', 0],
            ] as const
          ).map(([name, label, min]) => (
            <Field key={name} name={name} label={label} error={errors[name]}>
              <input
                id={name}
                type="number"
                min={min}
                max={name === 'servings' ? 100 : 1440}
                value={values[name]}
                onChange={(e) => set(name, e.target.value)}
                required
              />
            </Field>
          ))}

          <Field name="difficulty" label="Difficulty" error={errors.difficulty}>
            <select
              id="difficulty"
              value={values.difficulty}
              onChange={(e) => set('difficulty', e.target.value)}
            >
              {facets.difficulties.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field name="tags" label="Tags" error={errors.tags}>
          <input
            id="tags"
            value={values.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="dinner, italian (comma separated)"
            list="known-tags"
          />
          {/* Suggested from existing data so new recipes reuse tags rather than
              inventing near-duplicates. */}
          <datalist id="known-tags">
            {facets.tags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </Field>
      </section>

      <section className="panel stack" style={{ gap: 12 }}>
        <h3>Ingredients</h3>
        {errors.ingredients && <span className="field-error">{errors.ingredients}</span>}

        {ingredients.map((row, i) => (
          <div key={i} className="row-editor">
            {/* Restricted to known ingredients so nutrition always resolves. */}
            <Field
              name={`ingredients.${i}.ingredientId`}
              label={`Ingredient ${i + 1}`}
              error={errors[`ingredients.${i}.ingredientId`]}
              hideLabel
              style={{ flex: '2 1 200px' }}
            >
              <select
                id={`ingredients.${i}.ingredientId`}
                value={row.ingredientId}
                onChange={(e) => setRow(i, { ingredientId: e.target.value })}
              >
                <option value="">Choose an ingredient…</option>
                {facets.ingredients.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            {(
              [
                ['amount', 'Amount', '2 or 1/3', undefined],
                ['unit', 'Unit', 'cups', 'known-units'],
              ] as const
            ).map(([key, label, placeholder, list]) => (
              <Field
                key={key}
                name={`ingredients.${i}.${key}`}
                label={label}
                error={errors[`ingredients.${i}.${key}`]}
                hideLabel
                style={{ flex: '1 1 90px', minWidth: 90 }}
              >
                <input
                  id={`ingredients.${i}.${key}`}
                  value={row[key]}
                  onChange={(e) => setRow(i, { [key]: e.target.value })}
                  placeholder={placeholder}
                  list={list}
                />
              </Field>
            ))}

            <button
              type="button"
              className="chip"
              onClick={() => setIngredients((rows) => removeAt(rows, i))}
              disabled={ingredients.length === 1}
              aria-label={`Remove ingredient ${i + 1}`}
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
          <button
            type="button"
            className="link-button"
            onClick={() => setIngredients((rows) => [...rows, { ...EMPTY_ROW }])}
          >
            + Add ingredient
          </button>
        </div>
      </section>

      <section className="panel stack" style={{ gap: 12 }}>
        <h3>Instructions</h3>
        {errors.instructions && <span className="field-error">{errors.instructions}</span>}

        {instructions.map((step, i) => (
          <div key={i} className="row-editor">
            <Field name={`step-${i}`} label={`Step ${i + 1}`} hideLabel style={{ flex: 1 }}>
              <input
                id={`step-${i}`}
                value={step}
                onChange={(e) =>
                  setInstructions((steps) => steps.map((s, n) => (n === i ? e.target.value : s)))
                }
                placeholder={`Step ${i + 1}`}
                maxLength={1000}
              />
            </Field>
            <button
              type="button"
              className="chip"
              onClick={() => setInstructions((steps) => removeAt(steps, i))}
              disabled={instructions.length === 1}
              aria-label={`Remove step ${i + 1}`}
            >
              ×
            </button>
          </div>
        ))}

        <div>
          <button
            type="button"
            className="link-button"
            onClick={() => setInstructions((steps) => [...steps, ''])}
          >
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
