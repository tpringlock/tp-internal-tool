import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/dal";
import { MisaPlayground } from "./misa-playground";

export default async function MisaPlaygroundPage() {
  await requireAdmin();
  const t = await getTranslations("MisaTest");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">{t("title")}</h1>
        <p className="text-sm text-slate-500">{t("subtitle")}</p>
      </div>
      <MisaPlayground />
    </div>
  );
}
