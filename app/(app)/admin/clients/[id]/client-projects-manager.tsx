"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { deleteProjects } from "@/app/actions/projects";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast, useFormStateToast } from "@/components/ui/toast";
import { DeleteProjectButton } from "../../projects/delete-project-button";

export interface ClientProject {
  id: string;
  name: string;
  code: string;
  status: "active" | "archived";
}

/**
 * The projects table on the client manage page. Admins get a checkbox column
 * plus a batch "delete selected" action alongside the per-row delete;
 * everyone gets the Manage links. Projects that still hold documents are
 * skipped by the batch action and reported in the result toast.
 */
export function ClientProjectsManager({
  projects,
  canDelete,
}: {
  projects: ClientProject[];
  canDelete?: boolean;
}) {
  const t = useTranslations("Admin");
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteProjects,
    {},
  );
  useFormStateToast(state);

  useEffect(() => {
    // Close on any outcome; the toast carries the result. Deleted rows leave
    // the list with the revalidated page, so drop the stale selection.
    if (state.success || state.error) {
      setConfirming(false);
      setSelected(new Set());
    }
    if (state.success) toast(state.success, { tone: "success" });
  }, [state, toast]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === projects.length
        ? new Set()
        : new Set(projects.map((p) => p.id)),
    );
  }

  if (projects.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500">{t("noProjects")}</p>;
  }

  return (
    <div>
      <table className="responsive-table w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            {canDelete && (
              <th className="w-10 px-5 py-3">
                <input
                  type="checkbox"
                  aria-label={t("selectAllProjects")}
                  checked={selected.size === projects.length}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-red-600"
                />
              </th>
            )}
            <th className="px-5 py-3 font-medium">{t("name")}</th>
            <th className="px-5 py-3 font-medium">{t("code")}</th>
            <th className="px-5 py-3 font-medium">{t("status")}</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-slate-50 last:border-0">
              {canDelete && (
                <td className="px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label={p.name}
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 accent-red-600"
                  />
                </td>
              )}
              <td
                data-label={t("name")}
                className="px-5 py-3 font-medium text-slate-900"
              >
                {p.name}
              </td>
              <td data-label={t("code")} className="px-5 py-3 text-slate-600">
                {p.code}
              </td>
              <td data-label={t("status")} className="px-5 py-3">
                {p.status === "active" ? (
                  <span className="text-green-700">{t("active")}</span>
                ) : (
                  <span className="text-slate-400">{t("archived")}</span>
                )}
              </td>
              <td className="px-5 py-3 text-right">
                <div className="flex items-center justify-end gap-3">
                  <Link
                    href={`/admin/projects/${p.id}`}
                    className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                  >
                    {t("manage")}
                  </Link>
                  {canDelete && (
                    <DeleteProjectButton projectId={p.id} projectName={p.name} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canDelete && (
        <div className="border-t border-slate-100 px-5 py-3">
          <Button
            variant="danger"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setConfirming(true)}
          >
            {t("deleteSelected", { count: selected.size })}
          </Button>
        </div>
      )}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("deleteSelected", { count: selected.size })}
      >
        <p className="text-sm text-slate-600">
          {t("confirmDeleteProjectsBody", { count: selected.size })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
          <form action={action}>
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <Button variant="danger" size="sm" type="submit" loading={pending}>
              {t("confirmDelete")}
            </Button>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
