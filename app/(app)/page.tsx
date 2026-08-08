import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileText, GraduationCap } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { Card, CardBody } from "@/components/ui/card";

export default async function HomePage() {
  const user = await requireUser();
  const t = await getTranslations("Home");
  const firstName = user.profile.full_name.split(" ")[0] || t("friend");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">
          {t("welcome", { name: firstName })}
        </h1>
        <p className="text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/documents" className="group">
          <Card className="h-full transition-colors group-hover:border-slate-300">
            <CardBody className="flex items-start gap-4">
              <FileText
                className="h-10 w-10 shrink-0 text-primary"
                aria-hidden
              />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-primary">
                  {t("documentManagement")}
                </div>
                <p className="text-sm text-slate-500">
                  {t("documentManagementDesc")}
                </p>
              </div>
            </CardBody>
          </Card>
        </Link>

        <Link href="/academy" className="group">
          <Card className="h-full transition-colors group-hover:border-slate-300">
            <CardBody className="flex items-start gap-4">
              <GraduationCap
                className="h-10 w-10 shrink-0 text-primary"
                aria-hidden
              />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-primary">
                  {t("training")}
                </div>
                <p className="text-sm text-slate-500">{t("trainingDesc")}</p>
              </div>
            </CardBody>
          </Card>
        </Link>
      </div>
    </div>
  );
}
