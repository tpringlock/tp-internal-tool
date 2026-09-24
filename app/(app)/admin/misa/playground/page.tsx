import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { MisaPlayground } from "./misa-playground";
import { ModuleEyebrow } from "@/components/page-title";

export default async function MisaPlaygroundPage() {
  await requireAdmin();
  const t = await getTranslations("MisaTest");

  return (
    <div className="space-y-6">
      <div>
        <ModuleEyebrow id="admin" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t("subtitle")}</p>
      </div>
      <MisaPlayground />
    </div>
  );
}
