import type { NewRecipeInput } from './types';

/**
 * Validates the POST /api/recipes body. Same boundary job as the query-param
 * readers in routes.ts, split out because the body is a nested structure.
 *
 * Errors are collected per field rather than thrown on the first problem, so the
 * form can show every mistake at once. Keys match the form's input names.
 */

export type FieldErrors = Record<string, string>;

export interface ValidationResult {
  value?: NewRecipeInput;
  errors?: FieldErrors;
}

const MAX_TEXT = 200;
const MAX_INSTRUCTION = 1000;
const MAX_ITEMS = 50;
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trimmed string, or '' for anything that is not a usable string. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Mirrors what nutrition.parseAmount accepts, so "1/3" is valid input. */
function isParseableAmount(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value) || /^(\d+\s+)?\d+(\.\d+)?\s*\/\s*\d*[1-9]\d*$/.test(value);
}

export function validateNewRecipe(body: unknown): ValidationResult {
  const errors: FieldErrors = {};

  if (!isRecord(body)) {
    return { errors: { _: 'Request body must be a JSON object' } };
  }

  const title = text(body.title);
  if (!title) errors.title = 'Title is required';
  else if (title.length > MAX_TEXT) errors.title = `Title must be under ${MAX_TEXT} characters`;

  const description = text(body.description);
  if (description.length > MAX_TEXT) {
    errors.description = `Description must be under ${MAX_TEXT} characters`;
  }

  // Number() rather than parseInt, which would read "4abc" as 4.
  const servings = Number(body.servings);
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) {
    errors.servings = 'Servings must be a whole number between 1 and 100';
  }

  // Named `*Minutes` on the wire so it is never confused with RawRecipe's
  // "20 minutes" string form.
  const times = { prepTimeMinutes: 0, cookTimeMinutes: 0 };
  for (const field of ['prepTimeMinutes', 'cookTimeMinutes'] as const) {
    const minutes = Number(body[field]);
    // A cook time of 0 is legitimate (Greek Salad), so only prep time must be positive.
    const min = field === 'prepTimeMinutes' ? 1 : 0;
    if (!Number.isInteger(minutes) || minutes < min || minutes > 1440) {
      errors[field] = `Must be a whole number of minutes (${min}-1440)`;
    } else {
      times[field] = minutes;
    }
  }

  const difficulty = text(body.difficulty).toLowerCase();
  if (!DIFFICULTIES.includes(difficulty as (typeof DIFFICULTIES)[number])) {
    errors.difficulty = 'Difficulty must be easy, medium or hard';
  }

  // At least one ingredient, each with an id, a readable amount and a unit.
  const rawIngredients = Array.isArray(body.ingredients) ? body.ingredients : [];
  const ingredients: NewRecipeInput['ingredients'] = [];
  if (rawIngredients.length === 0) {
    errors.ingredients = 'Add at least one ingredient';
  } else if (rawIngredients.length > MAX_ITEMS) {
    errors.ingredients = `No more than ${MAX_ITEMS} ingredients`;
  } else {
    rawIngredients.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors[`ingredients.${index}`] = 'Invalid ingredient';
        return;
      }
      const ingredientId = text(entry.ingredientId);
      const amount = text(entry.amount);
      const unit = text(entry.unit);

      if (!ingredientId) errors[`ingredients.${index}.ingredientId`] = 'Choose an ingredient';
      if (!amount) errors[`ingredients.${index}.amount`] = 'Amount is required';
      else if (!isParseableAmount(amount)) {
        errors[`ingredients.${index}.amount`] = 'Use a number or a fraction, e.g. 2 or 1/3';
      }
      if (!unit) errors[`ingredients.${index}.unit`] = 'Unit is required';

      if (ingredientId && amount && unit) ingredients.push({ ingredientId, amount, unit });
    });
  }

  const rawInstructions = Array.isArray(body.instructions) ? body.instructions : [];
  const instructions = rawInstructions.map(text).filter(Boolean);
  if (instructions.length === 0) {
    errors.instructions = 'Add at least one instruction';
  } else if (instructions.length > MAX_ITEMS) {
    errors.instructions = `No more than ${MAX_ITEMS} steps`;
  } else if (instructions.some((step) => step.length > MAX_INSTRUCTION)) {
    errors.instructions = `Each step must be under ${MAX_INSTRUCTION} characters`;
  }

  // Optional. Lowercased so they match existing facet values.
  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const tags = [...new Set(rawTags.map((t) => text(t).toLowerCase()).filter(Boolean))].slice(0, 20);

  if (Object.keys(errors).length > 0) return { errors };

  return {
    value: {
      title,
      description,
      servings,
      prepTimeMinutes: times.prepTimeMinutes,
      cookTimeMinutes: times.cookTimeMinutes,
      difficulty: difficulty as (typeof DIFFICULTIES)[number],
      ingredients,
      instructions,
      tags,
    },
  };
}
