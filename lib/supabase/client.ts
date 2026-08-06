import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/** Supabase client for Client Components (browser). Queries run under RLS. */
export function createClient() {
  return createBrowserClient<Database>(
    env.supabaseUrl(),
    env.supabaseAnonKey(),
  );
}
