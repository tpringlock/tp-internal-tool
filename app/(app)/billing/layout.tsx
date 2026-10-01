import { Suspense } from "react";
import { requireBillingViewer } from "@/lib/auth/dal";
import { canEditBilling } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { getShowDemo } from "@/lib/billing/queries";
import { WorkspaceContent } from "@/components/workspace-content";
import { BillingNav } from "./billing-nav";
import { ClientMessages } from "@/components/client-messages";

/**
 * "Tính hóa đơn tự động" workspace shell. Guards every /billing route:
 * admins, accountants and "Chỉ xem" accounts; everyone else is sent home.
 * Pages hide their edit controls for "Chỉ xem"; the server actions refuse
 * them regardless (requireBillingUser).
 */
export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireBillingViewer();
  const supabase = await createClient();
  const showDemo = await getShowDemo();

  let contractCount = supabase
    .from("billing_contracts")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  let draftCount = supabase
    .from("billing_rent_calculations")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");
  if (!showDemo) {
    contractCount = contractCount.eq("is_demo", false);
    draftCount = draftCount.eq("is_demo", false);
  }
  const [contracts, uploads, drafts] = await Promise.all([
    contractCount,
    supabase
      .from("billing_misa_uploads")
      .select("id", { count: "exact", head: true }),
    draftCount,
  ]);

  return (
    <ClientMessages module="billing">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Suspense>
          <BillingNav
            contractCount={contracts.count ?? 0}
            uploadCount={uploads.count ?? 0}
            draftCount={drafts.count ?? 0}
            showDemo={showDemo}
            isAdmin={user.profile.role === "admin"}
            canEdit={canEditBilling(user.profile.role)}
          />
        </Suspense>
        <WorkspaceContent>{children}</WorkspaceContent>
      </div>
    </ClientMessages>
  );
}
