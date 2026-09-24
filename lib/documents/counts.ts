import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type DB = SupabaseClient<Database>;

export interface ClientCount {
  id: string;
  name: string;
  count: number;
}

/**
 * Visible document count per client (with name), via the
 * document_counts_by_client RPC. Only clients with >= 1 visible document are
 * returned; callers seed zero-count clients themselves. Respects the caller's
 * RLS, so employees only get clients they can see documents for.
 */
export async function documentCountsByClient(
  supabase: DB,
): Promise<ClientCount[]> {
  const { data, error } = await supabase.rpc("document_counts_by_client");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.client_id,
    name: r.client_name,
    count: Number(r.doc_count),
  }));
}

export interface ProjectStats {
  /** Visible document count keyed by project id (missing = 0). */
  countByProject: Map<string, number>;
  totalFiles: number;
  totalBytes: number;
}

/**
 * Per-project visible document count + byte sum for one client, plus the
 * client-wide totals, via the document_stats_by_project RPC. Projects with zero
 * visible documents are absent from the map. Respects the caller's RLS.
 */
export async function documentStatsByProject(
  supabase: DB,
  clientId: string,
): Promise<ProjectStats> {
  const { data, error } = await supabase.rpc("document_stats_by_project", {
    p_client_id: clientId,
  });
  if (error) throw error;

  const countByProject = new Map<string, number>();
  let totalFiles = 0;
  let totalBytes = 0;
  for (const r of data ?? []) {
    const count = Number(r.doc_count);
    countByProject.set(r.project_id, count);
    totalFiles += count;
    totalBytes += Number(r.byte_sum);
  }
  return { countByProject, totalFiles, totalBytes };
}
