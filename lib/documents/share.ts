import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ResolvedShare {
  documentId: string;
  storagePath: string;
  canonicalName: string;
}

interface ShareRow {
  document_id: string;
  revoked_at: string | null;
  expires_at: string;
  documents: { storage_path: string; canonical_name: string } | null;
}

/**
 * Resolve a public share token to its document, or null if the token is
 * unknown, revoked, expired, or its document is missing. Uses the service role
 * because the caller is anonymous (no RLS session).
 */
export async function resolveShareToken(
  token: string,
): Promise<ResolvedShare | null> {
  if (!token) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("share_links")
    .select(
      "document_id, revoked_at, expires_at, documents ( storage_path, canonical_name )",
    )
    .eq("token", token)
    .single<ShareRow>();

  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  if (!data.documents) return null;

  return {
    documentId: data.document_id,
    storagePath: data.documents.storage_path,
    canonicalName: data.documents.canonical_name,
  };
}
