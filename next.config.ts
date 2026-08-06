import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
};

// Points at the default ./i18n/request.ts request-config module.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
