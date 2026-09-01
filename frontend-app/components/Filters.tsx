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
 * Filter state lives in the URL, not React state, so results render server-side
 * on first paint and filtered views are shareable links. Each change costs a
 * navigation.
 *
 * `replace` rather than `push`: filter changes do not stack history entries, so
 * back leaves the page instead of unwinding one chip at a time.
 */
export function Filters({ facets, resultCount }: { facets: Facets; resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The only control with local state, so typing can be debounced.
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
    // `params` is excluded deliberately: it would restart the debounce on every
    // URL change, including the ones this effect causes.
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

      {(
        [
          ['dietary', 'Diet', facets.dietary],
          ['difficulty', 'Difficulty', facets.difficulties],
          ['tags', 'Tags', facets.tags],
          ['excludeAllergens', 'Exclude allergens', facets.allergens],
        ] as const
      ).map(([key, label, options]) => (
        <FilterGroup
          key={key}
          label={label}
          options={options}
          selected={selected(key)}
          onToggle={(v) => toggle(key, v)}
        />
      ))}
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
            // Also drives the highlight styling, so visual and announced state
            // cannot disagree.
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
 * Exact ingredient matching. A chip row would be 46 buttons, so this adds one at
 * a time via a native select, with the chosen ones shown as removable chips.
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
          // Always resets: this is an add action, and the chips below are the state.
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
