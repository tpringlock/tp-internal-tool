import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads/writes the session from the request cookies. All queries run as the
 * signed-in user, so RLS applies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.supabaseUrl(),
    env.supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components cookies are read-only; the proxy refreshes the
          // session, so it is safe to swallow the resulting error here.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component - ignore
          }
        },
      },
    },
  );
}
