import { Suspense } from "react";
import { requireBillingUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getShowDemo } from "@/lib/billing/queries";
import { WorkspaceContent } from "@/components/workspace-content";
import { BillingNav } from "./billing-nav";

/**
 * "Tính hóa đơn tự động" workspace shell. Guards every /billing route:
 * admins and accountants only, everyone else is sent home.
 */
export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireBillingUser();
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
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <Suspense>
        <BillingNav
          contractCount={contracts.count ?? 0}
          uploadCount={uploads.count ?? 0}
          draftCount={drafts.count ?? 0}
          showDemo={showDemo}
          isAdmin={user.profile.role === "admin"}
        />
      </Suspense>
      <WorkspaceContent>{children}</WorkspaceContent>
    </div>
  );
}
