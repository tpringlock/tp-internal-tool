"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { searchItems } from "@/lib/search";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Second line under the label (e.g. contract number). */
  description?: string;
  /**
   * Extra searchable text. The FIRST keyword is the primary key (e.g. the
   * MISA warehouse code): an exact or prefix match on it ranks first.
   */
  keywords?: (string | null | undefined)[];
}

/**
 * Select with type-to-search (feedback item 4): typing a few letters of any
 * keyword (warehouse code, warehouse name, customer, contract number…)
 * filters the list, accent-insensitive ("viet panel" finds "VIỆT PANEL").
 * Keyboard: ↑/↓ to move, Enter to pick, Esc to close. Submits its value
 * through a hidden input named `name`, so it works in plain forms.
 *
 * Controlled (`value` + `onChange`) or uncontrolled (`defaultValue`).
 */
export function Combobox({
  options,
  value: controlled,
  defaultValue = "",
  onChange,
  name,
  id,
  placeholder,
  emptyText,
  allLabel,
  disabled,
  limit = 60,
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  emptyText: string;
  /** When set, an empty-value option with this label is offered first (e.g. "Tất cả"). */
  allLabel?: string;
  disabled?: boolean;
  /** Max options rendered at once (the rest is reached by typing). */
  limit?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const matches = searchItems(options, query, (o) => [o.keywords?.[0] ?? o.label, o.label, o.description, ...(o.keywords ?? [])], limit);
  const items: ComboboxOption[] = allLabel && !query ? [{ value: "", label: allLabel }, ...matches] : matches;
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  const pick = (o: ComboboxOption) => {
    if (controlled === undefined) setInternal(o.value);
    onChange?.(o.value);
    setOpen(false);
    setQuery("");
  };
  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setActive(Math.max(0, items.findIndex((o) => o.value === value)));
  };

  return (
    <div
      className={cn("relative", className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={selected ? selected.label : (allLabel ?? placeholder)}
          value={open ? query : (selected?.label ?? (allLabel && !value ? allLabel : ""))}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) openList();
              else setActive(Math.min(activeIndex + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(activeIndex - 1, 0));
            } else if (e.key === "Enter") {
              if (open && items[activeIndex]) {
                e.preventDefault();
                pick(items[activeIndex]);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className="h-10 w-full truncate rounded-md border border-slate-300 bg-white pl-3 pr-16 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-slate-400">
          {allLabel && value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={allLabel}
              title={allLabel}
              className="pointer-events-auto rounded p-0.5 hover:bg-slate-100 hover:text-slate-700"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick({ value: "", label: allLabel })}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </span>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {items.length === 0 && <li className="px-3 py-2 text-slate-500">{emptyText}</li>}
          {items.map((o, i) => (
            <li
              key={o.value || "__all"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={cn(
                "flex cursor-pointer items-start gap-2 px-3 py-2",
                i === activeIndex ? "bg-primary/10" : "hover:bg-slate-50",
              )}
            >
              <Check className={cn("mt-0.5 h-4 w-4 shrink-0 text-primary", o.value !== value && "invisible")} aria-hidden />
              <span className="min-w-0">
                <span className="block break-words text-slate-900">{o.label}</span>
                {o.description && <span className="block break-words text-xs text-slate-500">{o.description}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
