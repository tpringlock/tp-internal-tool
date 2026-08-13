import Image from "next/image";
import { useTranslations } from "next-intl";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("Common");

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-12">
      {/* Full-bleed photo backdrop, dimmed with soft blurred accents below so
          the white title/logo stay readable rather than washing out. */}
      <Image
        src="/login-bg.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-black/15 blur-3xl" />
        <div className="absolute inset-0 bg-slate-950/20" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 rounded-2xl bg-white p-3 shadow-lg">
            <Image
              src="/logo-tp.png"
              alt={t("title")}
              width={56}
              height={56}
              priority
              className="h-14 w-14 object-contain"
            />
          </div>
          <h1 className="text-lg font-semibold text-white">{t("title")}</h1>
          <p className="text-sm text-white/80">{t("tagline")}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
