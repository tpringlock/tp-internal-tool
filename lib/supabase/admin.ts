import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * Service-role Supabase client. Bypasses RLS entirely, so it must only be used
 * in trusted server code AFTER an explicit permission check, e.g. creating auth
 * users, streaming files, or logging anonymous share-link opens.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.supabaseUrl(),
    env.supabaseServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
