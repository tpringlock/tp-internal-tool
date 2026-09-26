import { Suspense } from "react";
import { requireBillingUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceContent } from "@/components/workspace-content";
import { BillingNav } from "./billing-nav";
import { ClientMessages } from "@/components/client-messages";

/**
 * "Tính hóa đơn tự động" workspace shell. Guards every /billing route:
 * admins and accountants only, everyone else is sent home.
 */
export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBillingUser();
  const supabase = await createClient();

  const [contracts, uploads, drafts] = await Promise.all([
    supabase
      .from("billing_contracts")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("billing_misa_uploads")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("billing_rent_calculations")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
  ]);

  return (
    <ClientMessages module="billing">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Suspense>
          <BillingNav
            contractCount={contracts.count ?? 0}
            uploadCount={uploads.count ?? 0}
            draftCount={drafts.count ?? 0}
          />
        </Suspense>
        <WorkspaceContent>{children}</WorkspaceContent>
      </div>
    </ClientMessages>
  );
}
