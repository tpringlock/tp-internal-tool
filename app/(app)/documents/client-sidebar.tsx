"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { AsideHeading, WorkspaceAside } from "@/components/workspace-aside";
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
 * Customer list for the Documents workspace, in the shared WorkspaceAside
 * shell (sticky column on `lg`+, drawer below).
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
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <WorkspaceAside
        label={t("customers")}
        current={active ? active.name : t("chooseCustomer")}
        icon={<Building2 className="h-4 w-4" aria-hidden />}
        widthClass="w-80"
      >
        {() => (
          <ClientList
            clients={clients}
            activeId={activeId}
            canManage={canManage}
            onAdd={() => setAddOpen(true)}
          />
        )}
      </WorkspaceAside>

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
}: {
  clients: SidebarClient[];
  activeId: string | undefined;
  canManage: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations("DocWorkspace");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return q ? clients.filter((c) => fold(c.name).includes(q)) : clients;
  }, [clients, query]);

  return (
    <>
      <AsideHeading
        title={t("customers")}
        subtitle={t("customerCount", { count: clients.length })}
        action={
          canManage && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={t("addCustomer")}
              title={t("addCustomer")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
            </button>
          )
        }
      />

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
