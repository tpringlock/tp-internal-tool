import { useTranslations } from "next-intl";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("Common");

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-primary">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("tagline")}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
