import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocType } from "@/lib/db/types";

export interface SharedFolderFile {
  id: string;
  canonicalName: string;
  docType: DocType;
  fileSize: number;
}

export interface SharedFolderProject {
  id: string;
  name: string;
  documents: SharedFolderFile[];
}

export interface ResolvedFolderShare {
  clientId: string;
  clientName: string;
  projects: SharedFolderProject[];
}

interface FolderShareRow {
  client_id: string;
  revoked_at: string | null;
  expires_at: string;
  clients: { name: string } | null;
}

/**
 * Validate a folder-share token and return its client id + name, or null if the
 * token is unknown, revoked, expired, or its client is missing. Uses the service
 * role because the caller is anonymous (no RLS session).
 */
async function resolveValidClient(
  token: string,
): Promise<{ clientId: string; clientName: string } | null> {
  if (!token) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("folder_share_links")
    .select("client_id, revoked_at, expires_at, clients ( name )")
    .eq("token", token)
    .single<FolderShareRow>();

  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  if (!data.clients) return null;

  return { clientId: data.client_id, clientName: data.clients.name };
}

interface DocRow {
  id: string;
  canonical_name: string;
  doc_type: DocType;
  file_size: number;
  created_at: string;
  projects: { id: string; name: string; client_id: string } | null;
}

/**
 * Resolve a folder-share token to the full client folder: every document across
 * the client's projects, grouped by project. Returns null for an invalid token.
 */
export async function resolveFolderShareToken(
  token: string,
): Promise<ResolvedFolderShare | null> {
  const client = await resolveValidClient(token);
  if (!client) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("documents")
    .select(
      "id, canonical_name, doc_type, file_size, created_at, projects!inner ( id, name, client_id )",
    )
    .eq("projects.client_id", client.clientId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as DocRow[];

  const byProject = new Map<string, SharedFolderProject>();
  for (const row of rows) {
    if (!row.projects) continue;
    const p = row.projects;
    let group = byProject.get(p.id);
    if (!group) {
      group = { id: p.id, name: p.name, documents: [] };
      byProject.set(p.id, group);
    }
    group.documents.push({
      id: row.id,
      canonicalName: row.canonical_name,
      docType: row.doc_type,
      fileSize: row.file_size,
    });
  }

  const projects = [...byProject.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
    clientId: client.clientId,
    clientName: client.clientName,
    projects,
  };
}

export interface ResolvedFolderFile {
  documentId: string;
  storagePath: string;
  canonicalName: string;
}

/**
 * Resolve a single document requested through a folder-share token, but only if
 * that document belongs to the token's client. Guards against enumerating
 * documents outside the shared folder. Returns null otherwise.
 */
export async function resolveFolderShareFile(
  token: string,
  documentId: string,
): Promise<ResolvedFolderFile | null> {
  if (!documentId) return null;
  const client = await resolveValidClient(token);
  if (!client) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("documents")
    .select(
      "id, storage_path, canonical_name, projects!inner ( client_id )",
    )
    .eq("id", documentId)
    .eq("projects.client_id", client.clientId)
    .single<{
      id: string;
      storage_path: string;
      canonical_name: string;
      projects: { client_id: string } | null;
    }>();

  if (!data) return null;

  return {
    documentId: data.id,
    storagePath: data.storage_path,
    canonicalName: data.canonical_name,
  };
}
