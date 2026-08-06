"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/i18n/config";

/** Persist the chosen UI locale in a cookie and re-render the app shell. */
export async function setLocale(locale: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
