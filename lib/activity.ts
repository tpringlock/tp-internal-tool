import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

export interface ActivityInput {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  /** Set explicitly for admin/service-role inserts; omit for the current user. */
  actorUserId?: string | null;
}

/**
 * Append an entry to the activity log. Pass the authenticated server client to
 * log the current user's action (RLS requires actor = auth.uid()), or the admin
 * client with an explicit actorUserId (or null for anonymous share opens).
 *
 * Logging failures are swallowed: an audit write should never break the
 * user-facing action it records.
 */
export async function logActivity(
  supabase: SupabaseClient<Database>,
  input: ActivityInput,
): Promise<void> {
  try {
    await supabase.from("activity_log").insert({
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      ...(input.actorUserId !== undefined
        ? { actor_user_id: input.actorUserId }
        : {}),
    });
  } catch (err) {
    console.error("Failed to write activity log", input.action, err);
  }
}
