import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Document upload posts the PDF through a server action. Must cover
      // MAX_FILE_SIZE (25MB, lib/documents/constants.ts) plus multipart
      // overhead; the framework default of 1MB rejects bigger bodies before
      // the action's own size check can run.
      bodySizeLimit: "26mb",
    },
  },
};

// Points at the default ./i18n/request.ts request-config module.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
