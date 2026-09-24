"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, ChevronDown, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { CreateClientForm } from "@/app/(app)/admin/clients/client-forms";

export interface SidebarClient {
  id: string;
  name: string;
  count: number;
}

/** Lower-case and strip Vietnamese diacritics so "ha noi" finds "Hà Nội". */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

/** Customer id from /documents/clients/<id>[/...], if any. */
function activeClientId(pathname: string): string | undefined {
  const m = pathname.match(/^\/documents\/clients\/([^/]+)/);
  return m?.[1];
}

/**
 * Customer list for the Documents workspace. Sticky full-height column on
 * `lg`+; below that a bar showing the current customer that opens the same
 * list in a slide-in drawer.
 */
export function ClientSidebar({
  clients,
  canManage,
}: {
  clients: SidebarClient[];
  canManage: boolean;
}) {
  const t = useTranslations("DocWorkspace");
  const pathname = usePathname();
  const activeId = activeClientId(pathname);
  const active = clients.find((c) => c.id === activeId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close the drawer after navigating (state adjusted during render).
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setDrawerOpen(false);
  }

  // While the drawer is open: Escape closes it and the page behind is locked.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  const panel = (variant: "sidebar" | "drawer") => (
    <ClientList
      clients={clients}
      activeId={activeId}
      canManage={canManage}
      onAdd={() => setAddOpen(true)}
      onClose={variant === "drawer" ? () => setDrawerOpen(false) : undefined}
    />
  );

  return (
    <>
      {/* Desktop column */}
      <aside
        aria-label={t("customers")}
        className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-80 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex"
      >
        {panel("sidebar")}
      </aside>

      {/* Mobile / tablet: current customer + drawer trigger */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:border-slate-300"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t("customers")}
            </span>
            <span className="block truncate text-sm font-medium text-slate-900">
              {active ? active.name : t("chooseCustomer")}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("customers")}
            onClick={(e) => e.stopPropagation()}
            className="drawer-in flex h-full w-80 max-w-[85%] flex-col bg-white shadow-xl"
          >
            {panel("drawer")}
          </div>
        </div>
      )}

      {canManage && (
        <Dialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title={t("addCustomer")}
        >
          <CreateClientForm />
        </Dialog>
      )}
    </>
  );
}

function ClientList({
  clients,
  activeId,
  canManage,
  onAdd,
  onClose,
}: {
  clients: SidebarClient[];
  activeId: string | undefined;
  canManage: boolean;
  onAdd: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("DocWorkspace");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return q ? clients.filter((c) => fold(c.name).includes(q)) : clients;
  }, [clients, query]);

  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t("customers")}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {t("customerCount", { count: clients.length })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canManage && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={t("addCustomer")}
              title={t("addCustomer")}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pb-3">
        <label className="relative block">
          <span className="sr-only">{t("filterCustomers")}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filterCustomers")}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-primary focus-visible:bg-white focus-visible:outline-none"
          />
        </label>
      </div>

      <nav
        aria-label={t("customers")}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-5"
      >
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-slate-400">
            {clients.length === 0 ? t("noCustomers") : t("noCustomerMatches")}
          </p>
        ) : (
          visible.map((c) => {
            const isActive = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/documents/clients/${c.id}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                  isActive
                    ? "border-primary/30 bg-primary/5"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    isActive
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  <Building2 className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "line-clamp-2 text-sm font-semibold leading-snug",
                      isActive ? "text-primary" : "text-slate-800",
                    )}
                  >
                    {c.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {t("fileCount", { count: c.count })}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </nav>
    </>
  );
}
