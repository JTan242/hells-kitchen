'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Facets, SortField } from '@/lib/types';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'title', label: 'Name' },
  { value: 'prepTime', label: 'Prep time' },
  { value: 'totalTime', label: 'Total time' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'calories', label: 'Calories' },
  { value: 'dateAdded', label: 'Date added' },
];

/**
 * All filter state lives in the URL rather than in React state.
 *
 * That means the server component above can render the correct results on first
 * paint, the browser back button steps through filter changes, and a filtered
 * view is a link you can share. The cost is a navigation per change, which Next
 * makes cheap because only the changed segment re-renders.
 */
export function Filters({ facets, resultCount }: { facets: Facets; resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The text box is the one control that needs local state: we debounce it so a
  // request is not fired on every keystroke.
  const [search, setSearch] = useState(params.get('search') ?? '');
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search) next.set('search', search);
      else next.delete('search');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
    // `params` is intentionally excluded: including it would restart the debounce
    // on every URL change, including the ones this effect itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pathname, router]);

  const update = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const selected = (key: string): string[] => params.getAll(key).flatMap((v) => v.split(','));

  const toggle = (key: string, value: string) =>
    update((next) => {
      const current = selected(key);
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      next.delete(key);
      if (updated.length) next.set(key, updated.join(','));
    });

  const setSingle = (key: string, value: string) =>
    update((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });

  const hasFilters = search !== '' || [...params.keys()].length > 0;

  const clearAll = () => {
    setSearch('');
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="controls">
      <div className="control-row">
        <div className="grow">
          <label className="sr-only" htmlFor="search">
            Search recipes
          </label>
          <input
            id="search"
            type="search"
            placeholder="Search by name, ingredient or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select
            id="sort"
            value={params.get('sort') ?? 'title'}
            onChange={(e) => setSingle('sort', e.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="order">Order</label>
          <select
            id="order"
            value={params.get('order') ?? 'asc'}
            onChange={(e) => setSingle('order', e.target.value)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="maxTotalTime">Max minutes</label>
          <input
            id="maxTotalTime"
            type="number"
            min={0}
            step={5}
            placeholder="any"
            value={params.get('maxTotalTime') ?? ''}
            onChange={(e) => setSingle('maxTotalTime', e.target.value)}
          />
        </div>
      </div>

      <FilterGroup
        label="Diet"
        options={facets.dietary}
        selected={selected('dietary')}
        onToggle={(v) => toggle('dietary', v)}
      />
      <FilterGroup
        label="Difficulty"
        options={facets.difficulties}
        selected={selected('difficulty')}
        onToggle={(v) => toggle('difficulty', v)}
      />
      <FilterGroup
        label="Tags"
        options={facets.tags}
        selected={selected('tags')}
        onToggle={(v) => toggle('tags', v)}
      />
      <FilterGroup
        label="Exclude allergens"
        options={facets.allergens}
        selected={selected('excludeAllergens')}
        onToggle={(v) => toggle('excludeAllergens', v)}
      />
      <IngredientPicker
        options={facets.ingredients}
        selected={selected('ingredients')}
        onToggle={(v) => toggle('ingredients', v)}
      />

      <div className="control-row">
        <span className="result-count">
          {resultCount} {resultCount === 1 ? 'recipe' : 'recipes'}
        </span>
        {hasFilters && (
          <button type="button" className="link-button" onClick={clearAll}>
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="field">
      <label>{label}</label>
      <div className="chips">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="chip"
            // aria-pressed carries the selected state for assistive tech and
            // drives the highlight styling, so the two can never disagree.
            aria-pressed={selected.includes(option)}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Exact ingredient matching - "what can I make with chicken and ginger".
 *
 * A chip row would be 46 buttons, so this is a native select that adds one at a
 * time, with the chosen ones shown as removable chips. Native means it is
 * searchable by typing, works on mobile, and needs no dependency.
 */
function IngredientPicker({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;

  const available = options.filter((option) => !selected.includes(option.id));
  const nameFor = (id: string) => options.find((o) => o.id === id)?.name ?? id;

  return (
    <div className="field">
      <label htmlFor="ingredients">Must contain</label>
      <div className="control-row">
        <select
          id="ingredients"
          // Always reset to the placeholder: the select is an "add" action, not
          // a display of current state - the chips below are that.
          value=""
          onChange={(e) => e.target.value && onToggle(e.target.value)}
          style={{ maxWidth: 240 }}
        >
          <option value="">Add an ingredient…</option>
          {available.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>

        <div className="chips">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              className="chip"
              aria-pressed={true}
              onClick={() => onToggle(id)}
              aria-label={`Remove ${nameFor(id)}`}
            >
              {nameFor(id)} ×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
