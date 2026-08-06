"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createShareLink, revokeShareLink } from "@/app/actions/shares";
import type { FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format";

export interface ShareLinkView {
  id: string;
  url: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

type Status = "active" | "expired" | "revoked";

function statusOf(link: ShareLinkView): Status {
  if (link.revoked_at) return "revoked";
  if (new Date(link.expires_at).getTime() < Date.now()) return "expired";
  return "active";
}

function CopyButton({ url }: { url: string }) {
  const t = useTranslations("Shares");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}

export function ShareManager({
  documentId,
  links,
}: {
  documentId: string;
  links: ShareLinkView[];
}) {
  const t = useTranslations("Shares");
  const [state, action, pending] = useActionState<FormState, FormData>(
    createShareLink,
    {},
  );

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        {state.success && <Alert tone="success">{state.success}</Alert>}
        {state.error && <Alert tone="error">{state.error}</Alert>}

        <input type="hidden" name="document_id" value={documentId} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("linkValidFor")}
            </label>
            <Select name="days" defaultValue="3">
              <option value="1">{t("days", { count: 1 })}</option>
              <option value="3">{t("days", { count: 3 })}</option>
              <option value="7">{t("days", { count: 7 })}</option>
              <option value="14">{t("days", { count: 14 })}</option>
              <option value="30">{t("days", { count: 30 })}</option>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? t("creating") : t("createLink")}
          </Button>
        </div>
      </form>

      {links.length === 0 ? (
        <p className="text-sm text-slate-500">{t("noLinks")}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {links.map((link) => {
            const status = statusOf(link);
            return (
              <li key={link.id} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={
                      status === "active"
                        ? "text-sm font-medium text-green-700"
                        : "text-sm font-medium text-slate-400"
                    }
                  >
                    {status === "active" && t("statusActive")}
                    {status === "expired" && t("statusExpired")}
                    {status === "revoked" && t("statusRevoked")}
                  </span>
                  <span className="text-xs text-slate-400">
                    {status === "revoked"
                      ? t("revokedAt", { date: formatDateTime(link.revoked_at!) })
                      : t("expiresAt", { date: formatDateTime(link.expires_at) })}
                  </span>
                </div>

                {status === "active" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      {link.url}
                    </code>
                    <CopyButton url={link.url} />
                    <form action={revokeShareLink}>
                      <input type="hidden" name="id" value={link.id} />
                      <input
                        type="hidden"
                        name="document_id"
                        value={documentId}
                      />
                      <Button type="submit" variant="danger" size="sm">
                        {t("revoke")}
                      </Button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
