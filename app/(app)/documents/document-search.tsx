"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface Suggestion {
  id: string;
  canonicalName: string;
  clientId: string;
  clientName: string;
}

export function DocumentSearch() {
  const t = useTranslations("Documents");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced fetch: only query after the user pauses, and cancel in-flight
  // requests so results never arrive out of order. All state updates run inside
  // the timer callback so none happen synchronously during the effect.
  useEffect(() => {
    const query = q.trim();
    const ctrl = new AbortController();
    const timer = setTimeout(
      async () => {
        if (query.length < 2) {
          setResults([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          const res = await fetch(
            `/api/documents/search?q=${encodeURIComponent(query)}`,
            { signal: ctrl.signal },
          );
          if (res.ok) {
            setResults((await res.json()) as Suggestion[]);
            setOpen(true);
            setActive(-1);
          }
        } catch {
          /* aborted request — ignore */
        } finally {
          setLoading(false);
        }
      },
      query.length < 2 ? 0 : 250,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  // Dismiss the dropdown when clicking outside the search box.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(s: Suggestion) {
    setOpen(false);
    setQ("");
    router.push(
      `/documents/clients/${s.clientId}?highlight=${s.id}#file-${s.id}`,
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("searchFilesPlaceholder")}
          className="pl-9 pr-9"
          aria-label={t("searchFilesPlaceholder")}
        />
        {loading && (
          <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
              <Spinner className="h-4 w-4" />
              {t("searching")}
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">{t("noMatches")}</p>
          ) : (
            <ul className="max-h-80 overflow-auto py-1">
              {results.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(s);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left ${
                      i === active ? "bg-primary/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="line-clamp-1 text-sm font-medium text-slate-900">
                      {s.canonicalName}
                    </span>
                    <span className="text-xs text-slate-400">
                      {s.clientName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
