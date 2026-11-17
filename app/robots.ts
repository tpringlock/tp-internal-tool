import type { MetadataRoute } from "next";

/**
 * Internal portal: nothing here should be crawled or indexed, including the
 * public share-link pages (their URLs are capability tokens). The root layout
 * metadata also sends `noindex`; this file covers crawlers that only look at
 * /robots.txt. Listed in PUBLIC_PREFIXES (lib/supabase/proxy.ts) so signed-out
 * crawlers get the file instead of a redirect to the login page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
