"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { searchItems } from "@/lib/search";
import { cn } from "@/lib/utils";
import { Input } from "./input";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Second line under the label. */
  description?: string;
  /** Searchable text; the FIRST keyword ranks first on an exact/prefix match. */
  keywords?: (string | null | undefined)[];
}

/**
 * Checkbox list with type-to-search (accent-insensitive, like Combobox) and
 * "select all shown" / "clear" buttons. Selecting all while a search is
 * typed adds only the matching options, so "type a customer, select all"
 * picks that customer's projects. `toolbar` renders extra filters next to
 * the search box; the caller narrows `options` accordingly. Controlled.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  searchPlaceholder,
  selectAllLabel,
  clearLabel,
  emptyText,
  summary,
  toolbar,
  className,
}: {
  options: readonly MultiSelectOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  searchPlaceholder: string;
  /** Label of the "select all shown" button; gets the number shown. */
  selectAllLabel: (shown: number) => string;
  clearLabel: string;
  emptyText: string;
  /** "12 / 230 selected" line. */
  summary: React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const shown = searchItems(options, query, (o) => [...(o.keywords ?? []), o.label, o.description]);
  const selected = new Set(value);

  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const selectShown = () => onChange([...new Set([...value, ...shown.map((o) => o.value)])]);
  const clear = () => {
    if (!query) return onChange([]);
    const hide = new Set(shown.map((o) => o.value));
    onChange(value.filter((v) => !hide.has(v)));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-q`} className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </label>
        {toolbar}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">{summary}</span>
        <span className="flex gap-3">
          <button type="button" onClick={selectShown} className="font-medium text-primary hover:underline" disabled={shown.length === 0}>
            {selectAllLabel(shown.length)}
          </button>
          <button type="button" onClick={clear} className="font-medium text-slate-600 hover:underline">
            {clearLabel}
          </button>
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {shown.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(o.value)}
                  onChange={() => toggle(o.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm text-slate-900">{o.label}</span>
                  {o.description && <span className="block break-words text-xs text-slate-500">{o.description}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
