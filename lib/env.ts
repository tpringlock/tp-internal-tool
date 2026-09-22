/**
 * Centralised access to environment variables so a missing value fails loudly
 * with a clear message instead of surfacing as a confusing runtime error.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () =>
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  supabaseServiceRoleKey: () =>
    required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  siteUrl: () =>
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  // MISA ACT Open API. `app_id` is a secret credential issued by MISA and must
  // never reach the browser — only read it inside server actions.
  misaAppId: () => required("MISA_APP_ID", process.env.MISA_APP_ID),
  misaApiUrl: () => process.env.MISA_API_URL ?? "https://actapp.misa.vn",
  // Credentials used by the automated sync (cron / manual "Đồng bộ ngay") to
  // obtain a token without any UI input. Server-only.
  misaAccessCode: () =>
    required("MISA_ACCESS_CODE", process.env.MISA_ACCESS_CODE),
  misaOrgCompanyCode: () =>
    required("MISA_ORG_COMPANY_CODE", process.env.MISA_ORG_COMPANY_CODE),
  // Shared secret that protects the Vercel Cron sync endpoint. Required only
  // once the cron trigger is enabled.
  cronSecret: () => required("CRON_SECRET", process.env.CRON_SECRET),
};
