import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE } from "./config";

// The app is Vietnamese-only: the locale is fixed to Vietnamese regardless of
// any request cookie, so the UI can never render in English.
export default getRequestConfig(async () => {
  return {
    locale: DEFAULT_LOCALE,
    messages: (await import(`../messages/${DEFAULT_LOCALE}.json`)).default,
  };
});
