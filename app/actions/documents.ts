"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { buildCanonicalName, buildStoragePath } from "@/lib/documents/naming";
import { DOC_TYPES, MAX_FILE_SIZE, ACCEPTED_MIME } from "@/lib/documents/constants";
import type { DocType } from "@/lib/db/types";
import type { FormState } from "@/app/actions/auth";

const STORAGE_BUCKET = "documents";
const DOC_TYPE_VALUES = new Set(DOC_TYPES.map((t) => t.value));

interface ProjectForUpload {
  id: string;
  name: string;
  clients: { name: string } | null;
}

export async function uploadDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const projectId = String(formData.get("project_id") ?? "");
  const docType = String(formData.get("doc_type") ?? "") as DocType;
  const signed = formData.get("signed") === "on" || formData.get("signed") === "true";
  const file = formData.get("file");

  const fieldErrors: Record<string, string[]> = {};
  if (!projectId) fieldErrors.project_id = ["Choose a project"];
  if (!DOC_TYPE_VALUES.has(docType)) fieldErrors.doc_type = ["Choose a document type"];
  if (!signed) {
    fieldErrors.signed = ["You must confirm the document is signed"];
  }

  if (!(file instanceof File) || file.size === 0) {
    fieldErrors.file = ["Choose a PDF to upload"];
  } else if (file.type !== ACCEPTED_MIME) {
    fieldErrors.file = ["Only PDF files are allowed"];
  } else if (file.size > MAX_FILE_SIZE) {
    fieldErrors.file = ["File is larger than 25 MB"];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }
  const pdf = file as File;

  const supabase = await createClient();

  // RLS: this returns the project only if the user is an admin or a member,
  // so it doubles as the upload permission check.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, clients(name)")
    .eq("id", projectId)
    .single<ProjectForUpload>();

  if (!project) {
    return { error: "You don't have access to that project." };
  }

  const fileId = crypto.randomUUID();
  const storagePath = buildStoragePath(projectId, fileId);
  const canonicalName = buildCanonicalName({
    clientName: project.clients?.name ?? "Client",
    projectName: project.name,
    docType,
    date: new Date(),
    disambiguator: fileId.slice(0, 4),
  });

  // Upload the file with the service role (the bucket is private and has no
  // authenticated policies). The row insert below still runs under RLS.
  const admin = createAdminClient();
  const buffer = Buffer.from(await pdf.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: ACCEPTED_MIME,
      upsert: false,
    });
  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      project_id: projectId,
      doc_type: docType,
      canonical_name: canonicalName,
      storage_path: storagePath,
      file_size: pdf.size,
      signed_attested: true,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Roll back the orphaned file so storage stays consistent with the table.
    await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return {
      error:
        insertError?.message ??
        "Could not save the document. Please try again.",
    };
  }

  await logActivity(supabase, {
    action: "document.uploaded",
    entityType: "document",
    entityId: inserted.id,
    metadata: { project_id: projectId, doc_type: docType, canonical_name: canonicalName },
  });

  redirect(`/documents/${inserted.id}`);
}
